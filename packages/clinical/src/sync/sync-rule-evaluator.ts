import { executePipeline, type PipelineStep } from "@stateful-mcp/core";
import type { SyncResult, SyncRuleMatch } from "./sync-rule-config";

/**
 * Pure function: given matched sync rules + clinical record values, produce
 * the set of workspace operations (facts to add/remove).
 *
 * Field-level transforms reuse the core `PropertyTranslation` model:
 * - Identity mapping when no pipeline is present (direct value copy).
 * - Pipeline-based reshaping when `transform.pipeline` is present.
 */
export function evaluateSyncRules(
	matches: readonly SyncRuleMatch[],
): SyncResult[] {
	const results: SyncResult[] = [];
	for (const match of matches) {
		const rule = match.rule;
		const resultValues: Record<string, unknown> = { ...rule.constants };
		for (const [targetField, translation] of Object.entries(
			rule.propertyMapping,
		)) {
			const sourceValue = resolvePath(match.values, translation.internal);
			if (
				sourceValue === undefined &&
				!translation.transform?.pipeline?.length
			) {
				continue;
			}
			if (translation.transform?.pipeline?.length) {
				const transformed = applyPipeline(
					translation.transform.pipeline,
					sourceValue,
					match.values,
				);
				if (transformed !== undefined) {
					resultValues[targetField] = transformed;
				}
			} else {
				resultValues[targetField] = sourceValue;
			}
		}
		if (Object.keys(resultValues).length === 0) continue;
		results.push({
			operation: "add_fact",
			targetSchema: rule.targetSchema,
			certainty:
				typeof resultValues.certainty === "string"
					? (resultValues.certainty as SyncResult["certainty"])
					: rule.defaultCertainty,
			values: resultValues,
			provenance: {
				ruleId: rule.ruleId,
				...(match.provenance ?? {}),
			},
		});
	}
	return results;
}

/**
 * Navigate a dot-separated path into a nested object.
 * Returns undefined if any segment is missing.
 */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split(".").filter(Boolean);
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		if (typeof current !== "object" || Array.isArray(current)) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

/**
 * Apply a pipeline transform to a source value.
 * Seeds source value (as "value") and all inputs as the row passed to
 * core's executePipeline — args can reference them via { $var: "key" }.
 */
function applyPipeline(
	steps: PipelineStep[],
	sourceValue: unknown,
	inputs: Record<string, unknown>,
): unknown {
	const row: Record<string, unknown> = { ...inputs };
	if (sourceValue !== undefined) {
		row["value"] = sourceValue;
	}
	return executePipeline(steps, row, {});
}
