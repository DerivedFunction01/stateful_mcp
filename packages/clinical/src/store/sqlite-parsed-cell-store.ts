import { SqliteEntityStore, type SqlQueryStore } from "@stateful-mcp/core";
import type Database from "bun:sqlite";
import type { ParsedObservationItem } from "../parser/schema-parsers";
import { type ParsedCellStore, type ParsedCellV1Shared, type ParsedCellObservationDetailV1, type ParsedCellV1, scoreRecency, type ParsedCellJoinResult, type ParsedCellHistoryKey, buildObservationShape } from "./parsed-cell-store";
import { compileParsedCellObservationHistoryQuery, type ParsedCellSqlDialect } from "./sql/parsed-cell-query-compiler";


export class SqliteParsedCellStore implements ParsedCellStore {
	private sharedStore: SqliteEntityStore<ParsedCellV1Shared>;
	private observationDetailStore: SqliteEntityStore<ParsedCellObservationDetailV1>;
	private sharedTable: string;
	private observationDetailTable: string;

	constructor(
		db: Database,
		sharedTable = "parsed_cell_v1_shared",
		observationDetailTable = "parsed_cell_v1_observation_detail"
	) {
		this.sharedTable = sharedTable;
		this.observationDetailTable = observationDetailTable;
		this.sharedStore = new SqliteEntityStore<ParsedCellV1Shared>(
			db,
			sharedTable
		);
		this.observationDetailStore =
			new SqliteEntityStore<ParsedCellObservationDetailV1>(
				db,
				observationDetailTable
			);
	}

	async putObservation(
		record: ParsedCellV1<ParsedObservationItem>
	): Promise<void> {
		await this.sharedStore.set(record.shared.cellId, record.shared);
		await this.observationDetailStore.set(record.shared.cellId, {
			cellId: record.shared.cellId,
			conceptId: record.parsedItem.conceptId,
			display: record.parsedItem.display,
			certainty: record.parsedItem.certainty,
			status: record.parsedItem.status,
			severity: record.parsedItem.severity,
			candidateTokens: [],
			shape: {
				schema: record.parsedItem.targetSchema,
				slots: {
					certainty: record.parsedItem.certainty,
					status: record.parsedItem.status,
					severity: record.parsedItem.severity,
				},
			},
			parsedItem: record.parsedItem,
			history: {
				priorAcceptCount: 1,
				priorCorrectionCount: 0,
				lastAcceptedAt: record.shared.acceptedAt,
				recencyScore: scoreRecency(record.shared.acceptedAt),
			},
			flags: {
				contractValid: true,
				stalePreference: false,
				reviewRequired: false,
			},
		});
	}

	async get(cellId: string): Promise<ParsedCellJoinResult | null> {
		const shared = await this.sharedStore.get(cellId);
		if (!shared) return null;
		const detail = await this.observationDetailStore.get(cellId);
		return {
			shared,
			detail,
			parsedItem: detail?.parsedItem || null,
		};
	}

	async listBySession(sessionId: string): Promise<ParsedCellJoinResult[]> {
		const sharedRows = await this.sharedStore.list();
		const results: ParsedCellJoinResult[] = [];
		for (const shared of sharedRows) {
			if (shared.sessionId !== sessionId) continue;
			const detail = await this.observationDetailStore.get(shared.cellId);
			results.push({ shared, detail, parsedItem: detail?.parsedItem || null });
		}
		return results;
	}

	async listObservationPilots(
		sessionId?: string
	): Promise<ParsedCellJoinResult<ParsedObservationItem>[]> {
		const sharedRows = await this.sharedStore.list();
		const results: ParsedCellJoinResult<ParsedObservationItem>[] = [];
		for (const shared of sharedRows) {
			if (shared.targetSchema !== "ObservationEvent") continue;
			if (sessionId && shared.sessionId !== sessionId) continue;
			const detail = await this.observationDetailStore.get(shared.cellId);
			results.push({
				shared,
				detail,
				parsedItem: detail?.parsedItem || null,
			});
		}
		return results;
	}

	async getObservationHistory(
		key: ParsedCellHistoryKey
	): Promise<ParsedCellObservationDetailV1[]> {
		const { sql, params } = compileParsedCellObservationHistoryQuery(
			{
				tableName: this.sharedTable,
				detailTableName: this.observationDetailTable,
				key,
				limit: 50,
			},
			"sqlite" satisfies ParsedCellSqlDialect
		);
		const queryStore = this.sharedStore as unknown as SqlQueryStore;
		const rows = await queryStore.query<{ detail_data: string; ranking_score: number; }>(
			sql,
			params
		);
		return rows.map(
			(row) => JSON.parse(row.detail_data) as ParsedCellObservationDetailV1
		);
	}

	async markObservationCorrection(
		cellId: string,
		replacement?: ParsedObservationItem
	): Promise<void> {
		const detail = await this.observationDetailStore.get(cellId);
		if (!detail) return;
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
		if (replacement) {
			detail.parsedItem = replacement;
			detail.conceptId = replacement.conceptId;
			detail.display = replacement.display;
			detail.certainty = replacement.certainty;
			detail.status = replacement.status;
			detail.severity = replacement.severity;
			detail.shape = buildObservationShape(replacement);
		}
		await this.observationDetailStore.set(cellId, detail);
	}
}
