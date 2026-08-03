import type { ClinicalDocumentReadModel } from "../clinical/clinical-document-types";
import { evaluateSyncRules } from "./sync-rule-evaluator";
import type { SyncConfig, SyncResult, SyncRule } from "./sync-rule-config";
import { normalizeSchemaPath } from "../schemas/schema-path-validator";

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
			for (const rule of config.rules) {
				if (!this.ruleMatches(rule, recordId, record)) continue;
				const provenance = {
					recordId,
					schemaName: record.schemaName,
					sourceDocumentId: document.documentId,
					sourceDocumentHead: document.eventHead,
					...(record.provenance ?? {}),
				};
				if (record.removed) {
					results.push({
						operation: "remove_fact",
						factId: this.factId(document.documentId, recordId, rule, rule.targetBranchId),
						targetSchema: rule.targetSchema,
						targetBranchId: rule.targetBranchId,
						values: {},
						provenance: { ruleId: rule.ruleId, ...provenance },
					});
					continue;
				}
				const evaluated = evaluateSyncRules([
					{
						rule,
						values: record.values,
						provenance,
					},
				]);
				results.push(...evaluated.map((result) => ({
					...result,
					factId: this.factId(document.documentId, recordId, rule, rule.targetBranchId),
					targetBranchId: rule.targetBranchId,
					provenance: { ...result.provenance, sourceDocumentHead: document.eventHead },
				})));
			}
		}
		return results;
	}

	private ruleMatches(
		rule: SyncRule,
		_recordId: string,
		record: { schemaName: string; values: Record<string, unknown>; provenance?: { sourceMacroId?: string; sourcePath?: string } },
	): boolean {
		if (rule.sourceSchema && rule.sourceSchema !== record.schemaName) return false;
		if (rule.sourceMacroId) {
			if (record.provenance?.sourceMacroId !== rule.sourceMacroId) return false;
		}
		if (rule.sourcePath && normalizeSchemaPath(record.provenance?.sourcePath ?? "") !== normalizeSchemaPath(rule.sourcePath)) return false;
		return true;
	}

	private factId(documentId: string, recordId: string, rule: SyncRule, branchId?: string | "active"): string {
		return [documentId, recordId, rule.ruleId, branchId ?? "global"].join(":");
	}
}
