import type { ColumnType, SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers";
import {
	extractSharedValues,
	ParsedCellSqlCompilerV2,
	rehydrateParsedShared,
	resolveDetailTable,
} from "../../sql/parsed-cell-query-compiler";
import type {
	ParsedCellHistoryKey,
	ParsedCellLookup,
	ParsedCellRecord,
	ParsedCellShared,
	ParsedCellStore,
	SystemWeightStore,
} from "../interfaces";
import { scoreRecency } from "../interfaces";
import type { ParsedCellHistoryStore } from "./history-store";
import { getTransformForSchema } from "./parsed-cell-record-transform";
import { flattenParsedItem } from "./transforms/flatten-helper";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectLeafPaths(
	obj: Record<string, unknown>,
	prefix = "",
	result: Map<string, unknown> = new Map(),
): Map<string, unknown> {
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		const path = prefix ? `${prefix}.${key}` : key;

		if (isPlainObject(value)) {
			collectLeafPaths(value, path, result);
		} else if (value !== undefined && value !== null) {
			result.set(path, value);
		}
	}

	return result;
}

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
	private dialect: SqlDialect;
	private sharedTable: string;
	private executor: SqlExecutor;
	private detailTableMap: Record<string, string>;
	private weightStore?: SystemWeightStore;

	constructor(
		dialect: SqlDialect,
		executor: SqlExecutor,
		sharedTable = SHARED_TABLE,
		detailTableMap?: Record<string, string>,
		weightStore?: SystemWeightStore,
	) {
		this.dialect = dialect;
		this.executor = executor;
		this.sharedTable = sharedTable;
		this.detailTableMap = detailTableMap || {};
		this.weightStore = weightStore;
		this.compiler = new ParsedCellSqlCompilerV2(this.dialect);
		this.ensureSharedTable();
	}

	private async ensureSharedTable(): Promise<void> {
		const createQ = this.compiler.compileCreateSharedTable();
		await this.executor.exec(createQ.sql);

		const indexQueries = this.compiler.compileSharedIndexes();
		for (const idxQ of indexQueries) {
			await this.executor.exec(idxQ.sql);
		}
	}

	private async ensureDetailTable(targetSchema: string): Promise<void> {
		const detailTable = this.resolveDetailTable(targetSchema);
		const transform = getTransformForSchema(targetSchema);

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
		const id = record.shared.cellId;
		const targetSchema = record.parsedItem.targetSchema;
		const detailTable = this.resolveDetailTable(targetSchema);
		const transform = getTransformForSchema(targetSchema);

		await this.ensureDetailTable(targetSchema);

		const sharedInsertQ = this.compiler.compileSharedInsert(
			extractSharedValues(record.shared as unknown as Record<string, any>),
		);
		await this.executor.exec(sharedInsertQ.sql, sharedInsertQ.params);

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
		const sharedQ = this.executor.compiler.compileSelect({
			table: this.sharedTable,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
		const sharedResult = await this.executor.query(sharedQ.sql, sharedQ.params);
		if (sharedResult.length === 0) return null;

		const shared = rehydrateParsedShared(sharedResult[0]!) as ParsedCellShared;
		const targetSchema = shared.targetSchema;
		const detailTable = this.resolveDetailTable(targetSchema);
		const transform = getTransformForSchema(targetSchema);

		const detailQ = this.executor.compiler.compileSelect({
			table: detailTable,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
		const detailRows = await this.executor.query(detailQ.sql, detailQ.params);

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
		const sharedQ = this.executor.compiler.compileSelect({
			table: this.sharedTable,
			where: [{ column: "sessionId", op: "eq", value: sessionId }],
		});
		const sharedRows = await this.executor.query(sharedQ.sql, sharedQ.params);
		const results: ParsedCellLookup[] = [];

		for (const row of sharedRows) {
			const shared = rehydrateParsedShared(row) as ParsedCellShared;
			if (targetSchema && shared.targetSchema !== targetSchema) continue;

			const detailTable = this.resolveDetailTable(shared.targetSchema);
			const transform = getTransformForSchema(shared.targetSchema);
			const detailQ = this.executor.compiler.compileSelect({
				table: detailTable,
				where: [{ column: "cellId", op: "eq", value: shared.cellId }],
			});
			const detailRows = await this.executor.query(detailQ.sql, detailQ.params);
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
		const sharedQ = this.executor.compiler.compileSelect({
			table: this.sharedTable,
			where: [{ column: "targetSchema", op: "eq", value: targetSchema }],
		});
		const sharedRows = await this.executor.query(sharedQ.sql, sharedQ.params);
		const results: ParsedCellLookup[] = [];

		for (const row of sharedRows) {
			const shared = rehydrateParsedShared(row) as ParsedCellShared;
			if (sessionId && shared.sessionId !== sessionId) continue;

			const detailTable = this.resolveDetailTable(targetSchema);
			const transform = getTransformForSchema(targetSchema);
			const detailQ = this.executor.compiler.compileSelect({
				table: detailTable,
				where: [{ column: "cellId", op: "eq", value: shared.cellId }],
			});
			const detailRows = await this.executor.query(detailQ.sql, detailQ.params);
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
		const sharedQ = this.executor.compiler.compileSelect({
			table: this.sharedTable,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
		const sharedResult = await this.executor.query(sharedQ.sql, sharedQ.params);
		if (sharedResult.length === 0) return;

		const shared = rehydrateParsedShared(sharedResult[0]!) as ParsedCellShared;
		const detailTable = this.resolveDetailTable(shared.targetSchema);
		await this.ensureDetailTable(shared.targetSchema);
		const now = new Date().toISOString();

		const detailQ = this.executor.compiler.compileSelect({
			table: detailTable,
			where: [{ column: "cellId", op: "eq", value: cellId }],
		});
		const detailRows = await this.executor.query(detailQ.sql, detailQ.params);
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

	async rankHistoryBySchema(
		targetSchema: string,
		key: ParsedCellHistoryKey,
		candidate: ParsedItem,
	): Promise<
		Array<ParsedCellRecord & { rankScore: number; rankReason: string }>
	> {
		const detailTable = this.resolveDetailTable(targetSchema);
		const transform = getTransformForSchema(targetSchema);

		const flatValues = transform
			? flattenParsedItem(candidate)
			: Object.fromEntries(
					Object.keys(candidate.extractedData || {}).map((k) => [
						k,
						(candidate.extractedData as any)?.[k],
					]),
				);

		const schemaWeights = this.weightStore
			? await this.weightStore.getWeightsForCategory(
					"field_weights",
					targetSchema,
				)
			: {};

		const columns = (transform?.columnSpecs || []).map((col) => ({
			name: col.name,
			type: col.type as ColumnType,
			weight: schemaWeights[col.name] ?? 1,
		}));

		const candidateValues: Record<string, any> = {};
		for (const col of columns) {
			candidateValues[col.name] = flatValues[col.name];
		}

		const { sql, params } = this.compiler.compileRankedHistoryQuery({
			detailTable,
			sharedTable: this.sharedTable,
			key,
			scope: isScopedHistoryKey(key) ? "scoped" : "global",
			columns,
			candidateValues,
		});

		const rows = await this.executor.query(sql, params);
		return rows.map((row) => ({
			...reconstructRecordFromRow(row),
			rankScore: Number(row.rank_score) || 0,
			rankReason: "",
		}));
	}

	async adjustWeights(
		candidate: ParsedItem,
		key: ParsedCellHistoryKey,
		accepted: boolean,
	): Promise<void> {
		if (!this.weightStore) return;

		const transform = getTransformForSchema(key.targetSchema);
		if (!transform) return;

		const history = await this.getHistoryBySchema(key.targetSchema, key);

		const candidateFlat = flattenParsedItem(candidate);
		const candidateLeaves = collectLeafPaths(candidateFlat);

		let bestHistory: ParsedCellRecord | undefined;
		let bestScore = -Infinity;

		for (const historyRecord of history) {
			const rankResult = await this.rankHistoryBySchema(
				key.targetSchema,
				key,
				candidate,
			);
			const scored = rankResult.find(
				(r) => r.shared.cellId === historyRecord.shared.cellId,
			);
			const score = scored?.rankScore ?? 0;
			if (score > bestScore) {
				bestScore = score;
				bestHistory = historyRecord;
			}
		}

		if (!bestHistory) return;

		const historyFlat = flattenParsedItem(bestHistory.parsedItem);
		const historyLeaves = collectLeafPaths(historyFlat);

		for (const [path] of candidateLeaves) {
			if (historyLeaves.has(path)) {
				await this.weightStore.adjustWeight(
					"field_weights",
					key.targetSchema,
					accepted ? 0.1 : -0.1,
					path,
				);
			}
		}
	}

	async getHistory(key: ParsedCellHistoryKey): Promise<ParsedCellRecord[]> {
		return this.getHistoryBySchema(key.targetSchema, key);
	}
}

function reconstructRecordFromRow(row: Record<string, any>): ParsedCellRecord {
	const shared = rehydrateParsedShared(row) as ParsedCellShared;
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
		if (
			key === "cellId" ||
			key === "shared_data" ||
			key === "data" ||
			isSharedColumn(key)
		)
			continue;
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

function isSharedColumn(key: string): boolean {
	return [
		"targetSchema",
		"tag",
		"rawText",
		"normalizedText",
		"sessionId",
		"soapNoteId",
		"patientId",
		"patientOrganismType",
		"patientGender",
		"patientAgeBucket",
		"patientSpeciesBucket",
		"patientSubBucket",
		"patientBucketKey",
		"patientTierWeights",
		"personnelId",
		"specialtyId",
		"facilityId",
		"workspaceId",
		"anchorText",
		"parserVersion",
		"contractVersion",
		"sourceKind",
		"outcome",
		"replacedByCellId",
		"acceptedAt",
		"createdAt",
		"updatedAt",
	].includes(key);
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
