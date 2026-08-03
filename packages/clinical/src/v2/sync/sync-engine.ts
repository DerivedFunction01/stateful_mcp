import type { ClinicalDocumentReadModel } from "../clinical/clinical-document-types";
import { evaluateSyncRules } from "./sync-rule-evaluator";
import type { SyncConfig, SyncResult, SyncRule } from "./sync-rule-config";

export interface SyncEngineOptions {
	syncConfig?: SyncConfig;
}

/**
 * Passive sync engine: reads committed clinical events (via the document
 * projection), evaluates sync rules against each matching record, and returns
 * sync results that the caller converts to workspace operations.
 *
 * The engine is stateless and deterministic — given the same input state and
 * config, it produces the same results. It does NOT write to any store.
 */
export class SyncEngine {
	constructor(private readonly options: SyncEngineOptions = {}) {}

	evaluate(document: ClinicalDocumentReadModel): SyncResult[] {
		const config = this.options.syncConfig;
		if (!config || !config.rules.length) return [];
		const results: SyncResult[] = [];
		for (const [recordId, record] of Object.entries(document.records)) {
			if (record.removed) continue;
			for (const rule of config.rules) {
				if (!this.ruleMatches(rule, recordId, record)) continue;
				const evaluated = evaluateSyncRules([
					{
						rule,
						values: record.values,
						provenance: {
							recordId,
							schemaName: record.schemaName,
							sourceCellId: typeof record.values.sourceCellId === "string" ? record.values.sourceCellId : undefined,
						},
					},
				]);
				results.push(...evaluated);
			}
		}
		return results;
	}

	private ruleMatches(
		rule: SyncRule,
		_recordId: string,
		record: { schemaName: string; values: Record<string, unknown> },
	): boolean {
		if (rule.sourceSchema && rule.sourceSchema !== record.schemaName) return false;
		if (rule.sourceMacroId) {
			const cellRef = record.values.sourceCellId;
			if (cellRef !== rule.sourceMacroId) return false;
		}
		return true;
	}
}