import type { SqlExecutor } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers.v2";
import {
	ParsedCellSqlCompilerV2,
	type ParsedCellSqlDialect,
	resolveDetailTable,
} from "../../sql/parsed-cell-query-compiler.v2";
import type {
	ParsedCellHistoryKey,
	ParsedCellLookup,
	ParsedCellRecord,
	ParsedCellStore,
} from "../interfaces.v2";
import { scoreRecency } from "../interfaces.v2";
import type { ParsedCellHistoryStore } from "./history-store.v2";
import { getTransformForSchema } from "./parsed-cell-record-transform";
import { flattenParsedItem } from "./transforms/flatten-helper";

function isScopedHistoryKey(key: ParsedCellHistoryKey): boolean {
	return Boolean(
		key.soapNoteId ||
			key.patientId ||
			key.patientOrganismType ||
			key.patientGender ||
			key.patientAgeBucket ||
			key.patientSpeciesBucket ||
			key.patientSubBucket !== undefined ||
			key.patientBucketKey ||
			key.personnelId ||
			key.specialtyId ||
			key.facilityId,
	);
}

const SHARED_TABLE = "parsed_cell_shared";

export class SqlParsedCellStore
	implements ParsedCellStore, ParsedCellHistoryStore
{
	private compiler: ParsedCellSqlCompilerV2;
	private dialect: ParsedCellSqlDialect;
	private sharedTable: string;
	private executor: SqlExecutor;
	private detailTableMap: Record<string, string>;

	constructor(
		dialect: ParsedCellSqlDialect,
		executor: SqlExecutor,
		sharedTable = SHARED_TABLE,
		detailTableMap?: Record<string, string>,
	) {
		this.dialect = dialect;
		this.executor = executor;
		this.sharedTable = sharedTable;
		this.detailTableMap = detailTableMap || {};
		this.compiler = new ParsedCellSqlCompilerV2(this.dialect);
		this.ensureSharedTable();
	}

	private async ensureSharedTable(): Promise<void> {
		const c = this.executor.compiler;
		await this.executor.exec(
			c.compileCreateTable({
				table: this.sharedTable,
				ifNotExists: true,
				columns: [
					{ name: "cellId", type: "TEXT", primaryKey: true },
					{ name: "data", type: "TEXT", nullable: false },
				],
			}).sql,
		);
	}

	private async ensureDetailTable(targetSchema: string): Promise<void> {
		const detailTable = this.resolveDetailTable(targetSchema);
		const transform = getTransformForSchema(targetSchema);
		const c = this.executor.compiler;

		const createTableQ = this.compiler.compileCreateDetailTable(
			detailTable,
			transform || {
				targetSchema,
				flatten: () => ({}),
				template: () => ({
					targetSchema,
					attributes: {},
					concept: [],
					rawText: "",
					tag: "",
					extractedData: {},
				}),
				indexes: [],
			},
		);
		await this.executor.exec(createTableQ.sql);

		const indexQueries = this.compiler.compileCreateIndexes(
			detailTable,
			transform?.indexes,
		);
		for (const idxQ of indexQueries) {
			await this.executor.exec(idxQ.sql);
		}
	}

	private resolveDetailTable(targetSchema: string): string {
		return (
			this.detailTableMap[targetSchema] || resolveDetailTable(targetSchema)
		);
	}

	async putRecord(record: ParsedCellRecord): Promise<void> {
		const c = this.executor.compiler;
		const id = record.shared.cellId;
		const targetSchema = record.parsedItem.targetSchema;
		const detailTable = this.resolveDetailTable(targetSchema);
		const transform = getTransformForSchema(targetSchema);

		await this.ensureDetailTable(targetSchema);

		const sharedQ = c.compileReplace({
			table: this.sharedTable,
			values: [{ cellId: id, data: JSON.stringify(record.shared) }],
		});
		await this.executor.exec(sharedQ.sql, sharedQ.params);

		const flatValues = transform ? flattenParsedItem(record.parsedItem) : {};

		const detailQ = this.compiler.compileDetailInsert(
			detailTable,
			transform || {
				targetSchema,
				flatten: () => ({}),
				template: () => record.parsedItem,
				indexes: [],
			},
			{
				cellId: id,
				...flatValues,
				recencyScore: 0,
				priorAcceptCount: 0,
				priorCorrectionCount: 0,
				contractValid: 1,
				stalePreference: 0,
				reviewRequired: 0,
			},
		);
		await this.executor.exec(detailQ.sql, detailQ.params);
	}

	async get(cellId: string): Promise<ParsedCellLookup | null> {
		const sharedResult = await this.executor.query(
			`SELECT * FROM ${this.sharedTable} WHERE "cellId" = ?`,
			[cellId],
		);
		if (sharedResult.length === 0) return null;

		const shared = parseJsonField(
			sharedResult[0]!.data,
		) as ParsedCellRecord["shared"];
		const targetSchema = shared.targetSchema;
		const detailTable = this.resolveDetailTable(targetSchema);
		const transform = getTransformForSchema(targetSchema);

		const detailRows = await this.executor.query(
			`SELECT * FROM ${detailTable} WHERE "cellId" = ?`,
			[cellId],
		);

		const detailRow = detailRows[0] || null;
		const parsedItem = detailRow
			? rehydrateParsedItem(detailRow, transform)
			: null;
		const learningMetadata = detailRow
			? rehydrateLearningMetadata(detailRow)
			: { history: {}, flags: {} };

		return { shared, parsedItem, learningMetadata };
	}

	async listBySession(
		sessionId: string,
		targetSchema?: string,
	): Promise<ParsedCellLookup[]> {
		const sharedQuery = this.executor.compiler.compileSelect({
			table: this.sharedTable,
			where: [
				{ column: "data", jsonPath: "sessionId", op: "eq", value: sessionId },
			],
		});
		const rows = await this.executor.query(sharedQuery.sql, sharedQuery.params);
		const results: ParsedCellLookup[] = [];

		for (const row of rows) {
			const shared = parseJsonField(row.data) as ParsedCellRecord["shared"];
			if (targetSchema && shared.targetSchema !== targetSchema) continue;

			const detailTable = this.resolveDetailTable(shared.targetSchema);
			const transform = getTransformForSchema(shared.targetSchema);
			const detailRows = await this.executor.query(
				`SELECT * FROM ${detailTable} WHERE "cellId" = ?`,
				[shared.cellId],
			);
			const detailRow = detailRows[0] || null;

			results.push({
				shared,
				parsedItem: detailRow
					? rehydrateParsedItem(detailRow, transform)
					: null,
				learningMetadata: detailRow
					? rehydrateLearningMetadata(detailRow)
					: { history: {}, flags: {} },
			});
		}
		return results;
	}

	async listByTargetSchema(
		targetSchema: string,
		sessionId?: string,
	): Promise<ParsedCellLookup[]> {
		const sharedQuery = this.executor.compiler.compileSelect({
			table: this.sharedTable,
			where: [
				{
					column: "data",
					jsonPath: "targetSchema",
					op: "eq",
					value: targetSchema,
				},
			],
		});
		const rows = await this.executor.query(sharedQuery.sql, sharedQuery.params);
		const results: ParsedCellLookup[] = [];

		for (const row of rows) {
			const shared = parseJsonField(row.data) as ParsedCellRecord["shared"];
			if (sessionId && shared.sessionId !== sessionId) continue;

			const detailTable = this.resolveDetailTable(targetSchema);
			const transform = getTransformForSchema(targetSchema);
			const detailRows = await this.executor.query(
				`SELECT * FROM ${detailTable} WHERE "cellId" = ?`,
				[shared.cellId],
			);
			const detailRow = detailRows[0] || null;

			results.push({
				shared,
				parsedItem: detailRow
					? rehydrateParsedItem(detailRow, transform)
					: null,
				learningMetadata: detailRow
					? rehydrateLearningMetadata(detailRow)
					: { history: {}, flags: {} },
			});
		}
		return results;
	}

	async markCorrection(
		cellId: string,
		replacement?: ParsedItem,
	): Promise<void> {
		const sharedResult = await this.executor.query(
			`SELECT data FROM ${this.sharedTable} WHERE "cellId" = ?`,
			[cellId],
		);
		if (sharedResult.length === 0) return;

		const shared = JSON.parse(
			sharedResult[0]!.data,
		) as ParsedCellRecord["shared"];
		const detailTable = this.resolveDetailTable(shared.targetSchema);
		await this.ensureDetailTable(shared.targetSchema);
		const now = new Date().toISOString();

		const detailRows = await this.executor.query(
			`SELECT * FROM ${detailTable} WHERE "cellId" = ?`,
			[cellId],
		);
		const existing = detailRows[0] || null;
		const priorCorrectionCount = existing
			? (Number(existing.priorCorrectionCount) || 0) + 1
			: 1;

		const updateValues: Record<string, any> = {
			priorCorrectionCount,
			lastCorrectedAt: now,
			recencyScore: scoreRecency(now),
			stalePreference: 1,
			reviewRequired: replacement ? 1 : 0,
		};

		if (replacement) {
			const transform = getTransformForSchema(shared.targetSchema);
			const flatValues = transform ? flattenParsedItem(replacement) : {};
			for (const [key, value] of Object.entries(flatValues)) {
				updateValues[key] = value;
			}
		}

		const updateQ = this.compiler.compileDetailUpdate(
			detailTable,
			cellId,
			updateValues,
		);
		await this.executor.exec(updateQ.sql, updateQ.params);
	}

	async getHistoryBySchema(
		targetSchema: string,
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellRecord[]> {
		const detailTable = this.resolveDetailTable(targetSchema);
		const { sql, params } = this.compiler.compileHistoryQuery({
			detailTableName: detailTable,
			sharedTableName: this.sharedTable,
			key,
			scope: isScopedHistoryKey(key) ? "scoped" : "global",
			limit: 50,
		});
		const rows = await this.executor.query(sql, params);
		return rows.map((row) => reconstructRecordFromRow(row));
	}

	async getHistory(key: ParsedCellHistoryKey): Promise<ParsedCellRecord[]> {
		return this.getHistoryBySchema(key.targetSchema, key);
	}
}

function parseJsonField(value: unknown): any {
	if (typeof value === "string") {
		return JSON.parse(value);
	}
	if (typeof value === "object" && value !== null) {
		return value as any;
	}
	return {};
}

function reconstructRecordFromRow(row: Record<string, any>): ParsedCellRecord {
	const sharedData = parseJsonField(row.shared_data);
	const shared = sharedData as ParsedCellRecord["shared"];
	const transform = getTransformForSchema(shared.targetSchema);
	const parsedItem = rehydrateParsedItem(row, transform);
	const learningMetadata = rehydrateLearningMetadata(row);

	return {
		shared,
		parsedItem: parsedItem || {
			targetSchema: shared.targetSchema,
			attributes: {},
			concept: [],
			rawText: shared.rawText,
			tag: shared.tag,
			extractedData: {},
		},
		learningMetadata,
	};
}

function rehydrateParsedItem(
	row: Record<string, any>,
	transform: ReturnType<typeof getTransformForSchema>,
): ParsedItem | null {
	if (!transform) return null;

	const flat = flattenParsedItem({
		targetSchema: "",
		attributes: {},
		concept: [],
		rawText: "",
		tag: "",
		extractedData: {},
	} as ParsedItem);

	for (const key of Object.keys(row)) {
		if (key === "cellId" || key === "shared_data" || key === "data") continue;
		flat[key] = row[key];
	}

	const extractedData: Record<string, any> = {};
	for (const [path, value] of Object.entries(flat)) {
		if (path === "conceptId" || path === "conceptDisplay") continue;
		setNestedValue(extractedData, path, value);
	}

	const concept =
		flat.conceptId !== undefined
			? [{ conceptId: flat.conceptId, display: flat.conceptDisplay || "" }]
			: [];

	return {
		targetSchema: "",
		attributes: {},
		concept,
		rawText: "",
		tag: "",
		extractedData,
	};
}

function setNestedValue(
	obj: Record<string, any>,
	path: string,
	value: any,
): void {
	const parts = path.split(".");
	let current = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i]!;
		if (
			!(part in current) ||
			typeof current[part] !== "object" ||
			current[part] === null
		) {
			current[part] = {};
		}
		current = current[part] as Record<string, any>;
	}
	const lastPart = parts[parts.length - 1];
	if (lastPart !== undefined) {
		current[lastPart] = value;
	}
}

function rehydrateLearningMetadata(
	row: Record<string, any>,
): ParsedCellRecord["learningMetadata"] {
	return {
		history: {
			priorAcceptCount: Number(row.priorAcceptCount) || 0,
			priorCorrectionCount: Number(row.priorCorrectionCount) || 0,
			recencyScore: row.recencyScore ? Number(row.recencyScore) : undefined,
		},
		flags: {
			contractValid: Boolean(row.contractValid),
			stalePreference: Boolean(row.stalePreference),
			reviewRequired: Boolean(row.reviewRequired),
		},
	};
}
