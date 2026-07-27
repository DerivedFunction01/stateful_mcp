import type { SqlExecutor } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers.v2";
import {
	ParsedCellSqlCompiler,
	type ParsedCellSqlDialect,
} from "../../sql/parsed-cell-query-compiler";
import type {
	ParsedCellHistoryKey,
	ParsedCellLookup,
	ParsedCellRecord,
	ParsedCellStore,
} from "../interfaces.v2";
import { scoreRecency } from "../interfaces.v2";
import type { ParsedCellHistoryStore } from "./history-store.v2";

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
const DETAIL_TABLE = "parsed_cell_detail";

export class SqlParsedCellStore
	implements ParsedCellStore, ParsedCellHistoryStore
{
	private queryCompiler: ParsedCellSqlCompiler;
	private dialect: ParsedCellSqlDialect;
	private sharedTable: string;
	private detailTable: string;
	private executor: SqlExecutor;

	constructor(
		dialect: ParsedCellSqlDialect,
		executor: SqlExecutor,
		sharedTable = SHARED_TABLE,
		detailTable = DETAIL_TABLE,
	) {
		this.dialect = dialect;
		this.executor = executor;
		this.sharedTable = sharedTable;
		this.detailTable = detailTable;
		this.queryCompiler = new ParsedCellSqlCompiler(
			this.dialect,
			this.sharedTable,
			this.detailTable,
		);
		this.ensureTables();
	}

	private async ensureTables(): Promise<void> {
		for (const query of this.queryCompiler.compileCreateTables()) {
			await this.executor.exec(query.sql);
		}
	}

	async putRecord(record: ParsedCellRecord): Promise<void> {
		const c = this.executor.compiler;
		const id = record.shared.cellId;

		const sharedQ = c.compileReplace({
			table: this.sharedTable,
			values: [{ cellId: id, data: JSON.stringify(record.shared) }],
		});
		await this.executor.exec(sharedQ.sql, sharedQ.params);

		const detailQ = c.compileReplace({
			table: this.detailTable,
			values: [{ cellId: id, data: JSON.stringify(record) }],
		});
		await this.executor.exec(detailQ.sql, detailQ.params);
	}

	async get(cellId: string): Promise<ParsedCellLookup | null> {
		const query = this.queryCompiler.compileGetQuery(cellId, this.sharedTable);
		const rows = await this.executor.query(query.sql, query.params);
		if (rows.length === 0) return null;

		const shared = rows[0]!.data as ParsedCellRecord["shared"];

		const detailQuery = this.queryCompiler.compileGetQuery(
			cellId,
			this.detailTable,
		);
		const detailRows = await this.executor.query(
			detailQuery.sql,
			detailQuery.params,
		);
		const detail =
			detailRows.length > 0 ? (detailRows[0]!.data as ParsedCellRecord) : null;

		return {
			shared,
			parsedItem: detail?.parsedItem || null,
			learningMetadata: detail?.learningMetadata || {
				history: {},
				flags: {},
			},
		};
	}

	async listBySession(
		sessionId: string,
		targetSchema?: string,
	): Promise<ParsedCellLookup[]> {
		const query = this.queryCompiler.compileListSharedQuery();
		const rows = await this.executor.query(query.sql, query.params);
		const results: ParsedCellLookup[] = [];

		for (const row of rows) {
			const shared = row.data as ParsedCellRecord["shared"];
			if (shared.sessionId !== sessionId) continue;
			if (targetSchema && shared.targetSchema !== targetSchema) continue;

			const dq = this.queryCompiler.compileGetQuery(
				shared.cellId,
				this.detailTable,
			);
			const dr = await this.executor.query(dq.sql, dq.params);
			const detail = dr.length > 0 ? (dr[0]!.data as ParsedCellRecord) : null;

			results.push({
				shared,
				parsedItem: detail?.parsedItem || null,
				learningMetadata: detail?.learningMetadata || {
					history: {},
					flags: {},
				},
			});
		}
		return results;
	}

	async listByTargetSchema(
		targetSchema: string,
		sessionId?: string,
	): Promise<ParsedCellLookup[]> {
		const query =
			this.queryCompiler.compileListByTargetSchemaQuery(targetSchema);
		const rows = await this.executor.query(query.sql, query.params);
		const results: ParsedCellLookup[] = [];

		for (const row of rows) {
			const shared = row.data as ParsedCellRecord["shared"];
			if (sessionId && shared.sessionId !== sessionId) continue;

			const dq = this.queryCompiler.compileGetQuery(
				shared.cellId,
				this.detailTable,
			);
			const dr = await this.executor.query(dq.sql, dq.params);
			const detail = dr.length > 0 ? (dr[0]!.data as ParsedCellRecord) : null;

			results.push({
				shared,
				parsedItem: detail?.parsedItem || null,
				learningMetadata: detail?.learningMetadata || {
					history: {},
					flags: {},
				},
			});
		}
		return results;
	}

	async markCorrection(
		cellId: string,
		replacement?: ParsedItem,
	): Promise<void> {
		const c = this.executor.compiler;
		const dq = this.queryCompiler.compileGetQuery(cellId, this.detailTable);
		const rows = await this.executor.query(dq.sql, dq.params);
		if (rows.length === 0) return;

		const record = rows[0]!.data as ParsedCellRecord;
		const now = new Date().toISOString();

		record.learningMetadata = {
			...record.learningMetadata,
			history: {
				...(record.learningMetadata?.history || {}),
				priorCorrectionCount:
					(record.learningMetadata?.history?.priorCorrectionCount || 0) + 1,
				lastCorrectedAt: now,
				recencyScore: scoreRecency(now),
			},
			flags: {
				...(record.learningMetadata?.flags || {}),
				stalePreference: true,
				reviewRequired: !!replacement,
			},
		};

		if (replacement) {
			record.parsedItem = replacement;
		}

		const replaceQ = c.compileReplace({
			table: this.detailTable,
			values: [{ cellId, data: JSON.stringify(record) }],
		});
		await this.executor.exec(replaceQ.sql, replaceQ.params);
	}

	async getHistoryBySchema(
		targetSchema: string,
		key: ParsedCellHistoryKey,
	): Promise<ParsedCellRecord[]> {
		const { sql, params } = this.queryCompiler.compileHistoryQuery({
			tableName: this.sharedTable,
			detailTableName: this.detailTable,
			key,
			scope: isScopedHistoryKey(key) ? "scoped" : "global",
			limit: 50,
		});
		const rows = await this.executor.query(sql, params);
		return rows.map((row) => row.detail_data as ParsedCellRecord);
	}

	async getHistory(key: ParsedCellHistoryKey): Promise<ParsedCellRecord[]> {
		return this.getHistoryBySchema(key.targetSchema, key);
	}
}
