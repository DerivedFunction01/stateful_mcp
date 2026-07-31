import type { CustomExpression } from "@stateful-mcp/core";
import type { ClinicalInitSeedLoadedRecord } from "../../seed/record";

const NAMESPACE_PREFIXES = ["RxNorm::", "SNOMED::", "LOINC::", "ICD10::"];

export interface DictionaryExpressionWarning {
	message: string;
	path?: string;
}

export function normalizeDictionaryExpression(
	record: ClinicalInitSeedLoadedRecord,
	warnings: DictionaryExpressionWarning[] = [],
	allowedTargetAssignments?: string[],
): CustomExpression | null {
	const payload = record.payload;
	const term = payload.term;
	const regexPattern = payload.regexPattern;
	const conceptId = payload.conceptId;
	const targetAssignment = payload.targetAssignment;

	if (typeof term !== "string" || term.trim().length === 0) return null;
	if (typeof regexPattern !== "string" || regexPattern.trim().length === 0)
		return null;
	if (typeof conceptId !== "string" || !hasNamespacePrefix(conceptId))
		return null;
	if (
		typeof targetAssignment !== "string" ||
		targetAssignment.trim().length === 0 ||
		(allowedTargetAssignments?.length &&
			!allowedTargetAssignments.includes(targetAssignment))
	)
		return null;
	if (payload.active !== undefined && typeof payload.active !== "boolean")
		return null;
	if (hasNoAnchoringConstruct(regexPattern)) return null;

	if ([...term].length <= 3)
		warnings.push({
			message: `Short dictionary expression term may produce false matches: ${term}`,
			path: "term",
		});
	if (/\\b/.test(regexPattern) && containsNonLatinScript(term))
		warnings.push({
			message:
				"Latin-centric \\b boundary may not delimit this non-Latin term.",
			path: "regexPattern",
		});
	if (payload.context === undefined)
		warnings.push({
			message: "Dictionary expression has no context scoping.",
			path: "context",
		});
	if (payload.priorityWeight === undefined || payload.priorityWeight === 0)
		warnings.push({
			message: "Dictionary expression has no ranking signal.",
			path: "priorityWeight",
		});

	return {
		id:
			typeof payload.id === "string" && payload.id.length > 0
				? payload.id
				: record.recordId,
		term,
		regexPattern,
		isCaseInsensitive:
			typeof payload.isCaseInsensitive === "boolean"
				? payload.isCaseInsensitive
				: false,
		targetAssignment,
		conceptId,
		priorityWeight:
			typeof payload.priorityWeight === "number" ? payload.priorityWeight : 1,
		active: payload.active ?? true,
		context:
			typeof payload.context === "object" && payload.context !== null
				? (payload.context as Record<string, unknown>)
				: undefined,
	};
}

function hasNamespacePrefix(value: string): boolean {
	return NAMESPACE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function hasNoAnchoringConstruct(pattern: string): boolean {
	return !/(\^|\$|\\b|\(\?[=!<]|\[\^?\w|\(\?:)/.test(pattern);
}

function containsNonLatinScript(value: string): boolean {
	return /[^\u0000-\u024f\u1e00-\u1eff\u2c60-\u2c7f\u00c0-\u00ff\s\d\p{P}\p{N}]/u.test(
		value,
	);
}
