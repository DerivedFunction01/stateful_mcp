import type { SqlDialect, SqlExecutor } from "@stateful-mcp/core";
import type { MacroValueSpecKind } from "../macros/macro-definition";
import type { HistoryPruningConfig } from "./command-history";
import { MacroParseQueryCompiler } from "../stores/sql/macro-parse-query-compiler";

export interface MacroParseFeedbackRecord {
	id: string;
	macroId: string;
	macroVersion: number;
	argumentName: string;
	argumentKind: MacroValueSpecKind;
	rawTerm: string;
	parsedValue: string;
	correctedValue: string | null;
	outcome: "accepted" | "corrected" | "rejected";
	personnelId?: string;
	timestamp: string;
}

export interface MacroConfidenceResult {
	score: number;
	sampleSize: number;
}

export interface MacroParseLearningStore {
	recordFeedback(feedback: Omit<MacroParseFeedbackRecord, "id" | "timestamp">): Promise<void>;
	getConfidence(
		macroId: string,
		argumentName: string,
		rawTerm: string,
		parsedValue: string
	): Promise<MacroConfidenceResult>;
}

export class SqlMacroParseLearningStore implements MacroParseLearningStore {
	private readonly compiler: MacroParseQueryCompiler;
	private readonly table = "macro_parse_events";
	private readonly ready: Promise<void>;

	constructor(
		private readonly dialect: SqlDialect,
		private readonly executor: SqlExecutor,
		private readonly pruningConfig?: HistoryPruningConfig,
	) {
		this.compiler = new MacroParseQueryCompiler(dialect);
		this.ready = this.ensureTables();
	}

	private async ensureTables(): Promise<void> {
		for (const query of this.compiler.getTableDDL(this.table)) {
			await this.executor.exec(query.sql, query.params);
		}
	}

	async recordFeedback(feedback: Omit<MacroParseFeedbackRecord, "id" | "timestamp">): Promise<void> {
		await this.ready;
		const id = crypto.randomUUID();
		const timestamp = new Date().toISOString();

		// 1. Insert into raw event log
		const insertQuery = this.compiler.compileInsert(this.table, {
			id,
			macro_id: feedback.macroId,
			macro_version: feedback.macroVersion,
			argument_name: feedback.argumentName,
			argument_kind: feedback.argumentKind,
			raw_term: feedback.rawTerm,
			parsed_value: feedback.parsedValue,
			corrected_value: feedback.correctedValue ?? null,
			outcome: feedback.outcome,
			personnel_id: feedback.personnelId ?? null,
			timestamp
		});
		await this.executor.exec(insertQuery.sql, insertQuery.params);

		// 2. Trigger pruning if limit is exceeded
		if (this.pruningConfig) {
			await this.consolidateAndPrune();
		}
	}

	private async consolidateAndPrune(): Promise<void> {
		if (!this.pruningConfig) return;
		const countQuery = this.compiler.compileCount(this.table);
		const countRows = await this.executor.query(countQuery.sql, countQuery.params);
		const total = Number(countRows[0]?.count ?? 0);
		if (total <= this.pruningConfig.maxHistoryRows) return;

		const batchSize = this.pruningConfig.pruneBatchSize;
		const pruneSelectQuery = this.compiler.compilePruneSelect(this.table, batchSize);
		const oldEvents = await this.executor.query(
			pruneSelectQuery.sql,
			pruneSelectQuery.params
		);
		if (oldEvents.length === 0) return;

		const eventIds = oldEvents.map((r: any) => String(r.id));

		for (const ev of oldEvents) {
			const parsedValueStr = typeof ev.parsed_value === "string" ? ev.parsed_value : JSON.stringify(ev.parsed_value);
			const upsertQuery = this.compiler.compileUpsertAggregate(
				ev.macro_id,
				ev.argument_name,
				ev.raw_term,
				parsedValueStr,
				ev.outcome as "accepted" | "corrected" | "rejected",
				ev.timestamp
			);
			await this.executor.exec(upsertQuery.sql, upsertQuery.params);
		}

		// Delete consolidated detailed records
		const deleteQuery = this.compiler.compileDelete(this.table, eventIds);
		await this.executor.exec(deleteQuery.sql, deleteQuery.params);
	}

	async getConfidence(
		macroId: string,
		argumentName: string,
		rawTerm: string,
		parsedValue: string
	): Promise<MacroConfidenceResult> {
		await this.ready;
		
		let accepted = 0;
		let corrected = 0;
		let rejected = 0;

		// 1. Query aggregate hot table
		const lookup = this.compiler.compileConfidenceLookup(macroId, argumentName, rawTerm, parsedValue);
		const rows = await this.executor.query(lookup.sql, lookup.params);
		if (rows.length > 0) {
			const first = rows[0]!;
			accepted += Number(first.accepted_count ?? 0);
			corrected += Number(first.corrected_count ?? 0);
			rejected += Number(first.rejected_count ?? 0);
		}

		// 2. Query remaining active event logs
		const rawLookup = this.compiler.compileRawConfidenceLookup(macroId, argumentName, rawTerm, parsedValue);
		const rawRows = await this.executor.query(rawLookup.sql, rawLookup.params);
		for (const r of rawRows) {
			const count = Number(r.count ?? 0);
			if (r.outcome === "accepted") accepted += count;
			if (r.outcome === "corrected") corrected += count;
			if (r.outcome === "rejected") rejected += count;
		}

		const total = accepted + corrected + rejected;
		if (total === 0) {
			return { score: 0.5, sampleSize: 0 };
		}

		const score = (accepted + 1) / (total + 2);
		return { score, sampleSize: total };
	}
}
