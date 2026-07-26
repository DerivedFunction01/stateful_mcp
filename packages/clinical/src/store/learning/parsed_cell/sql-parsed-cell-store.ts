import type { SqlExecutor } from "@stateful-mcp/core";
import type { ParsedItem } from "../../../parser/schema-parsers";
import {
	ParsedCellSqlCompiler,
	type ParsedCellSqlDialect,
} from "../../sql/parsed-cell-query-compiler";
import type {
	ParsedCellDetail,
	ParsedCellHistoryKey,
	ParsedCellLookup,
	ParsedCellRecord,
	ParsedCellShared,
	ParsedCellStore,
} from "../interfaces";
import { scoreRecency } from "../interfaces";
import { buildObservationShape } from "./history-store";

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

export class SqlParsedCellStore implements ParsedCellStore {
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
			await this.executor.exec(query.sql, query.params);
		}
	}

	async putRecord(record: ParsedCellRecord<ParsedItem>): Promise<void> {
		const c = this.executor.compiler;
		const id = record.shared.cellId;
		const sharedQ = c.compileReplace({
			table: this.sharedTable,
			values: [{ cellId: id, data: JSON.stringify(record.shared) }],
		});
		await this.executor.exec(sharedQ.sql, sharedQ.params);

		const detailQ = c.compileReplace({
			table: this.detailTable,
			values: [{ cellId: id, data: JSON.stringify(record.detail) }],
		});
		await this.executor.exec(detailQ.sql, detailQ.params);
	}

	async get(cellId: string): Promise<ParsedCellLookup | null> {
		const query = this.queryCompiler.compileGetQuery(cellId, this.sharedTable);
		const rows = await this.executor.query(query.sql, query.params);
		if (rows.length === 0) return null;

		const shared: ParsedCellShared = JSON.parse(rows[0]!.data);
		const detailQuery = this.queryCompiler.compileGetQuery(
			cellId,
			this.detailTable,
		);
		const detailRows = await this.executor.query(
			detailQuery.sql,
			detailQuery.params,
		);
		const detail =
			detailRows.length > 0
				? (JSON.parse(detailRows[0]!.data) as ParsedCellDetail)
				: null;

		return { shared, detail, parsedItem: detail?.parsedItem || null };
	}

	async listBySession(
		sessionId: string,
		targetSchema?: string,
	): Promise<ParsedCellLookup[]> {
		const query = this.queryCompiler.compileListSharedQuery();
		const rows = await this.executor.query(query.sql, query.params);
		const results: ParsedCellLookup[] = [];

		for (const row of rows) {
			const shared: ParsedCellShared = JSON.parse(row.data);
			if (shared.sessionId !== sessionId) continue;
			if (targetSchema && shared.targetSchema !== targetSchema) continue;

			const dq = this.queryCompiler.compileGetQuery(
				shared.cellId,
				this.detailTable,
			);
			const dr = await this.executor.query(dq.sql, dq.params);
			const detail =
				dr.length > 0 ? (JSON.parse(dr[0]!.data) as ParsedCellDetail) : null;
			results.push({ shared, detail, parsedItem: detail?.parsedItem || null });
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
			const shared: ParsedCellShared = JSON.parse(row.data);
			if (sessionId && shared.sessionId !== sessionId) continue;

			const dq = this.queryCompiler.compileGetQuery(
				shared.cellId,
				this.detailTable,
			);
			const dr = await this.executor.query(dq.sql, dq.params);
			const detail =
				dr.length > 0 ? (JSON.parse(dr[0]!.data) as ParsedCellDetail) : null;
			results.push({ shared, detail, parsedItem: detail?.parsedItem || null });
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

		const detail = JSON.parse(rows[0]!.data) as any;
		const now = new Date().toISOString();
		detail.history = {
			...(detail.history || {}),
			priorCorrectionCount: (detail.history?.priorCorrectionCount || 0) + 1,
			lastCorrectedAt: now,
			recencyScore: scoreRecency(now),
		};
		detail.flags = {
			...(detail.flags || {}),
			stalePreference: true,
			reviewRequired: !!replacement,
		};
		if (replacement && replacement.targetSchema === "ObservationEvent") {
			detail.parsedItem = replacement;
			detail.conceptId = replacement.conceptId;
			detail.display = replacement.display;
			detail.certainty = replacement.certainty;
			detail.status = replacement.status;
			detail.severity = replacement.severity;
			detail.shape = buildObservationShape(replacement);
		}

		const replaceQ = c.compileReplace({
			table: this.detailTable,
			values: [{ cellId, data: JSON.stringify(detail) }],
		});
		await this.executor.exec(replaceQ.sql, replaceQ.params);
	}

	async getHistoryBySchema<TDetail extends ParsedCellDetail>(
		targetSchema: TDetail["targetSchema"],
		key: ParsedCellHistoryKey,
	): Promise<TDetail[]> {
		const { sql, params } = this.queryCompiler.compileObservationHistoryQuery({
			tableName: this.sharedTable,
			detailTableName: this.detailTable,
			key,
			scope: isScopedHistoryKey(key) ? "scoped" : "global",
			limit: 50,
		});
		const rows = await this.executor.query(sql, params);
		return rows.map((row) => JSON.parse(row.detail_data) as TDetail);
	}
}
