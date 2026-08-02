import type { CommandMacroValueSpec } from "../store/parser/command-macros/interfaces";

export interface CommandMacroEvidence {
	source: string;
	pattern?: string;
	confidence?: number;
}

export interface CommandMacroTargetOperation {
	operationId: string;
	groupId: string;
	cellRef: string;
	targetSchema: string;
	targetPath: string;
	rawValue: string;
	value: unknown;
	sourceLine: number;
	sourceArgument: number;
	evidence: CommandMacroEvidence[];
}

export interface CommandMacroCellPlan {
	cellRef: string;
	targetSchema: string;
	rootTarget?: string;
	operations: CommandMacroTargetOperation[];
	parentRef?: string;
	linkTarget?: { targetField: string; mergeStrategy: "replace" | "append" | "deep_merge" | "partial_fill" };
}

export interface CommandMacroValueResult {
	value: unknown;
	namedGroups?: Record<string, string | undefined>;
	evidence: CommandMacroEvidence[];
	diagnostics: string[];
	confidence?: number;
}

export function extractCommandMacroValue(rawValue: string, spec: CommandMacroValueSpec): CommandMacroValueResult {
	if (spec.kind === "prose") return { value: rawValue, evidence: [{ source: "legacy_cdsl" }], diagnostics: [] };
	if (spec.kind === "array") {
		const delimiter = spec.itemDelimiter ?? ";";
		const value = rawValue.replace(/^\[|\]$/g, "").split(delimiter).map((item) => extractCommandMacroValue(item.trim(), spec.item));
		return { value: value.map((item) => item.value), evidence: value.flatMap((item) => item.evidence), diagnostics: value.flatMap((item) => item.diagnostics) };
	}
	if (spec.kind === "enum") {
		const candidates = spec.values.flatMap((entry) => entry.patterns.map((rule) => ({ entry, rule }))).sort((a, b) => (b.rule.priority ?? a.entry.priority ?? 0) - (a.rule.priority ?? b.entry.priority ?? 0));
		for (const candidate of candidates) {
			const flags = spec.caseSensitive ? "" : "i";
			const match = new RegExp(candidate.rule.pattern, flags).exec(rawValue);
			if (match && (!candidate.rule.fullSpan || match[0] === rawValue)) return { value: candidate.entry.value, namedGroups: match.groups, evidence: [{ source: "enum", pattern: candidate.rule.pattern }], diagnostics: [], confidence: 1 };
		}
		return { value: undefined, evidence: [], diagnostics: ["value did not match an enum pattern"] };
	}
	const rule = spec.kind === "concept" ? spec.patterns?.[0] : spec.extraction;
	if (!rule) return { value: rawValue, evidence: [{ source: "raw" }], diagnostics: [] };
	const match = new RegExp(rule.pattern).exec(rawValue);
	if (!match || (rule.fullSpan && match[0] !== rawValue)) return { value: undefined, evidence: [], diagnostics: ["value did not match its guarded pattern"] };
	if (spec.kind === "scalar") {
		const value = spec.valueType === "integer" ? Number.parseInt(rawValue, 10) : spec.valueType === "number" ? Number(rawValue) : spec.valueType === "boolean" ? rawValue === "true" : rawValue;
		return { value, namedGroups: match.groups, evidence: [{ source: "scalar", pattern: rule.pattern }], diagnostics: [], confidence: 1 };
	}
	return { value: match.groups ?? rawValue, namedGroups: match.groups, evidence: [{ source: spec.kind, pattern: rule.pattern }], diagnostics: [], confidence: 1 };
}
