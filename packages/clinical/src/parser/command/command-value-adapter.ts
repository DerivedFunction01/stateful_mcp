import type { AttributeParserRule } from "../../store/interfaces";
import type { CommandMacroValueSpec, CommandMacroPatternRule } from "../../store/parser/command-macros/interfaces";
import { getCompiledRegex } from "../_compiled-regex";
import { validateNamedGroups } from "../utils/named-group-validator";
import { MeasurementHelper, QuantityTokenizer, TimeHelper, type QuantityCandidate } from "../helpers/measurement-helper";
import type { CommandMacroEvidence, CommandMacroValueResult } from "./command-macro-ir";

export interface CommandValueAdapterOptions {
	attributeRules?: AttributeParserRule[];
	defaultUnit?: string;
}

function failure(message: string): CommandMacroValueResult {
	return { value: undefined, evidence: [], diagnostics: [message] };
}

function matchRule(rawValue: string, rule: CommandMacroPatternRule, flags = ""): { match: RegExpExecArray; groups: Record<string, string | undefined> } | null {
	const regex = getCompiledRegex(rule.pattern, flags);
	const match = regex.exec(rawValue);
	if (!match || (rule.fullSpan && (match.index !== 0 || match[0] !== rawValue))) return null;
	const groups = match.groups ?? {};
	try {
		validateNamedGroups(groups, rule.namedGroupContract);
	} catch {
		return null;
	}
	return { match, groups };
}

function evidence(source: string, rule?: CommandMacroPatternRule): CommandMacroEvidence {
	return { source, pattern: rule?.pattern, confidence: 1 };
}

function extractArray(rawValue: string, spec: Extract<CommandMacroValueSpec, { kind: "array" }>, options: CommandValueAdapterOptions): CommandMacroValueResult {
	const delimiter = spec.itemDelimiter ?? ";";
	const values = rawValue.replace(/^\[|\]$/g, "").split(delimiter).map((item) => extractCommandValue(item.trim(), spec.item, options));
	return {
		value: values.map((item) => item.value),
		evidence: values.flatMap((item) => item.evidence),
		diagnostics: values.flatMap((item) => item.diagnostics),
		confidence: values.every((item) => item.confidence === 1) ? 1 : undefined,
	};
}

export function extractCommandValue(rawValue: string, spec: CommandMacroValueSpec, options: CommandValueAdapterOptions = {}): CommandMacroValueResult {
	if (spec.kind === "prose") return { value: rawValue, evidence: [{ source: "legacy_cdsl" }], diagnostics: [] };
	if (spec.kind === "array") return extractArray(rawValue, spec, options);
	if (spec.kind === "enum") {
		const candidates = spec.values.flatMap((entry) => entry.patterns.map((rule) => ({ entry, rule }))).sort((left, right) => (right.rule.priority ?? right.entry.priority ?? 0) - (left.rule.priority ?? left.entry.priority ?? 0));
		for (const candidate of candidates) {
			const matched = matchRule(rawValue, candidate.rule, spec.caseSensitive ? "" : "i");
			if (matched) return { value: candidate.entry.value, namedGroups: matched.groups, evidence: [evidence("enum", candidate.rule)], diagnostics: [], confidence: 1 };
		}
		return failure("value did not match an enum pattern");
	}
	if (spec.kind === "concept") {
		for (const rule of spec.patterns ?? []) {
			const matched = matchRule(rawValue, rule, "i");
			if (matched) return { value: matched.groups.concept ?? matched.groups.value ?? rawValue, namedGroups: matched.groups, evidence: [evidence("concept", rule)], diagnostics: [], confidence: 1 };
		}
		return spec.patterns?.length ? failure("value did not match a concept pattern") : { value: rawValue, evidence: [evidence("concept")], diagnostics: [] };
	}
	if (spec.kind === "measurement") {
		const matched = matchRule(rawValue, spec.extraction);
		if (!matched) return failure("value did not match its measurement pattern");
		const magnitude = Number.parseFloat(matched.groups[spec.magnitudeGroup] ?? "");
		if (!Number.isFinite(magnitude)) return failure(`measurement group '${spec.magnitudeGroup}' is not numeric`);
		const rawUnit = matched.groups[spec.unitGroup];
		if (!rawUnit) return failure(`measurement group '${spec.unitGroup}' is required`);
		const unit = QuantityTokenizer.resolveUnit(rawUnit, options.attributeRules);
		const displayUnit = unit?.display ?? rawUnit;
		if (spec.units?.allowed && !spec.units.allowed.includes(displayUnit) && !spec.units.allowed.includes(rawUnit)) return failure(`unit '${rawUnit}' is not allowed for this measurement`);
		if (spec.units?.denied?.includes(displayUnit) || spec.units?.denied?.includes(rawUnit)) return failure(`unit '${rawUnit}' is denied for this measurement`);
		const token: QuantityCandidate = { magnitude, rawUnit, operator: matched.groups.operator, isApproximate: matched.groups.is_approximate === "true", tokenStart: matched.match.index, tokenEnd: matched.match.index + matched.match[0].length };
		const parsed = MeasurementHelper.parse(token, options.defaultUnit, options.attributeRules);
		if (!parsed) return failure("measurement could not be resolved using the active attribute rules");
		const normalized = "valueInBase" in parsed ? parsed.valueInBase : undefined;
		const rawBounds = spec.bounds?.raw;
		const normalizedBounds = spec.bounds?.normalized;
		if (rawBounds && ((rawBounds.min !== undefined && (magnitude < rawBounds.min || (magnitude === rawBounds.min && rawBounds.inclusiveMin === false))) || (rawBounds.max !== undefined && (magnitude > rawBounds.max || (magnitude === rawBounds.max && rawBounds.inclusiveMax === false))))) return failure("measurement is outside raw bounds");
		if (normalizedBounds && normalized !== undefined && ((normalizedBounds.min !== undefined && normalized < normalizedBounds.min) || (normalizedBounds.max !== undefined && normalized > normalizedBounds.max))) return failure("measurement is outside normalized bounds");
		return { value: { ...parsed, dimension: spec.dimension, normalizedValue: normalized, rawValue: magnitude }, namedGroups: matched.groups, evidence: [evidence("measurement", spec.extraction)], diagnostics: [], confidence: 1 };
	}
	const matched = matchRule(rawValue, spec.extraction);
	if (!matched) return failure("value did not match its guarded pattern");
	if (spec.kind === "temporal") {
		const quantity = matched.groups.magnitude ?? matched.groups.value;
		if (quantity !== undefined && matched.groups.unit) {
			const parsed = TimeHelper.parse({ magnitude: Number.parseFloat(quantity), rawUnit: matched.groups.unit, tokenStart: 0, tokenEnd: rawValue.length }, options.attributeRules);
			if (!parsed) return failure("temporal unit could not be resolved using the active attribute rules");
			return { value: { ...parsed, temporalType: spec.temporalType }, namedGroups: matched.groups, evidence: [evidence("temporal", spec.extraction)], diagnostics: [], confidence: 1 };
		}
		return { value: { ...matched.groups, temporalType: spec.temporalType }, namedGroups: matched.groups, evidence: [evidence("temporal", spec.extraction)], diagnostics: [], confidence: 1 };
	}
	if (spec.kind === "scalar") {
		const raw = matched.groups.value ?? rawValue;
		const value = spec.valueType === "integer" ? Number.parseInt(raw, 10) : spec.valueType === "number" ? Number(raw) : spec.valueType === "boolean" ? raw === "true" : raw;
		if ((spec.valueType === "integer" || spec.valueType === "number") && !Number.isFinite(value as number)) return failure("scalar value is not numeric");
		if (spec.bounds && typeof value === "number" && ((spec.bounds.min !== undefined && value < spec.bounds.min) || (spec.bounds.max !== undefined && value > spec.bounds.max))) return failure("scalar value is outside bounds");
		return { value, namedGroups: matched.groups, evidence: [evidence("scalar", spec.extraction)], diagnostics: [], confidence: 1 };
	}
	return failure("unsupported command value kind");
}

export { extractCommandValue as extractCommandMacroValue };
