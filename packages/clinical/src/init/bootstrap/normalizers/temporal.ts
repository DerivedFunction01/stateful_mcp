import type { SharedFieldAnchorRule } from "../../../parser/field-shared/shared-field-anchor";
import type {
	ConceptFieldRule,
	DateTimeFormatConfig,
	DateTimeToken,
} from "../../../store/interfaces";
import type { StoredAttributeRule } from "../../../store/parser/rules/interfaces";
import type {
	ClinicalInitSeedKind,
	ClinicalInitSeedLoadedRecord,
} from "../../seed/record";

export interface TemporalCompilationResult {
	kind: ClinicalInitSeedKind;
	recordId: string;
	profileId?: string;
	attributeRules?: StoredAttributeRule[];
	conceptFieldRules?: ConceptFieldRule[];
	sharedFieldAnchors?: SharedFieldAnchorRule[];
	calendarDateFormats?: DateTimeFormatConfig[];
}

const TOKEN_ALIASES: Record<string, DateTimeToken> = {
	minute: "min",
	minutes: "min",
	hr: "HH",
	hour: "HH",
	hours: "HH",
	month: "MM",
	day: "DD",
	sec: "SS",
	second: "SS",
	seconds: "SS",
};

function normalizeToken(raw: string): DateTimeToken | undefined {
	const trimmed = raw.trim() as DateTimeToken;
	const valid: DateTimeToken[] = [
		"YYYY",
		"YY",
		"MM",
		"MM_name",
		"DD",
		"HH",
		"min",
		"SS",
		"ampm",
		"tz",
	];
	if (valid.includes(trimmed)) return trimmed;
	return TOKEN_ALIASES[trimmed.toLowerCase()] as DateTimeToken | undefined;
}

function normalizeTokens(raw: unknown): DateTimeToken[] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const tokens: DateTimeToken[] = [];
	for (const item of raw) {
		if (typeof item !== "string") return null;
		const token = normalizeToken(item);
		if (!token) return null;
		tokens.push(token);
	}
	return tokens;
}

function normalizeSeparators(raw: unknown): string[] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const separators: string[] = [];
	for (const item of raw) {
		if (typeof item !== "string") return null;
		separators.push(item);
	}
	return separators;
}

function getTokenCount(tokens: DateTimeToken[]): number {
	return tokens.length;
}

export function compileTemporalRecord(
	record: ClinicalInitSeedLoadedRecord,
): TemporalCompilationResult | null {
	const payload = record.payload;
	if (!payload || typeof payload !== "object") return null;
	const p = payload as Record<string, unknown>;
	const profileId = (record.profileId ?? p.profileId ?? undefined) as
		| string
		| undefined;

	switch (record.kind) {
		case "calendar_vocabulary":
			return compileCalendarVocabulary(record, p, profileId);
		case "date_pattern":
			return compileDatePattern(record, p, profileId);
		case "time_pattern":
			return compileTimePattern(record, p, profileId);
		case "relative_time_rule":
			return compileRelativeTimeRule(record, p, profileId);
		case "range_rule":
			return compileRangeRule(record, p, profileId);
		case "cadence_rule":
			return compileCadenceRule(record, p, profileId);
		case "exclusion_rule":
			return compileExclusionRule(record, p, profileId);
		default:
			return null;
	}
}

function compileCalendarVocabulary(
	record: ClinicalInitSeedLoadedRecord,
	p: Record<string, unknown>,
	profileId: string | undefined,
): TemporalCompilationResult | null {
	return {
		kind: record.kind,
		recordId: record.recordId,
		profileId,
	};
}

function compileDatePattern(
	record: ClinicalInitSeedLoadedRecord,
	p: Record<string, unknown>,
	profileId: string | undefined,
): TemporalCompilationResult | null {
	const tokens = normalizeTokens(p.tokens);
	const separators = normalizeSeparators(p.separators);

	if (!tokens || !separators) {
		return { kind: record.kind, recordId: record.recordId, profileId };
	}

	if (separators.length !== getTokenCount(tokens) - 1) {
		return { kind: record.kind, recordId: record.recordId, profileId };
	}

	const options =
		typeof p.options === "object" && p.options !== null
			? (p.options as Record<string, unknown>)
			: undefined;

	const config: DateTimeFormatConfig = {
		tokens,
		separators,
		options: options
			? {
					...(typeof options.centuryDecades === "object" &&
					options.centuryDecades !== null
						? {
								centuryDecades: options.centuryDecades as Record<
									string,
									string
								>,
							}
						: {}),
					...(typeof options.is24Hour === "boolean"
						? { is24Hour: options.is24Hour }
						: {}),
					...(typeof options.exact === "boolean"
						? { exact: options.exact }
						: {}),
					...(Array.isArray(options.monthNames)
						? {
								monthNames: options.monthNames.filter(
									(m): m is string => typeof m === "string",
								),
							}
						: {}),
					...(typeof options.dayPeriods === "object" &&
					options.dayPeriods !== null
						? {
								dayPeriods: options.dayPeriods as {
									am: string[];
									pm: string[];
								},
							}
						: {}),
				}
			: undefined,
	};

	return {
		kind: record.kind,
		recordId: record.recordId,
		profileId,
		calendarDateFormats: [config],
	};
}

function compileTimePattern(
	record: ClinicalInitSeedLoadedRecord,
	p: Record<string, unknown>,
	profileId: string | undefined,
): TemporalCompilationResult | null {
	const tokens = normalizeTokens(p.tokens);
	const separators = normalizeSeparators(p.separators);

	if (!tokens || !separators) {
		return { kind: record.kind, recordId: record.recordId, profileId };
	}

	if (separators.length !== getTokenCount(tokens) - 1) {
		return { kind: record.kind, recordId: record.recordId, profileId };
	}

	const options =
		typeof p.options === "object" && p.options !== null
			? (p.options as Record<string, unknown>)
			: undefined;

	const config: DateTimeFormatConfig = {
		tokens,
		separators,
		options: options
			? {
					...(typeof options.is24Hour === "boolean"
						? { is24Hour: options.is24Hour }
						: {}),
					...(typeof options.exact === "boolean"
						? { exact: options.exact }
						: {}),
					...(typeof options.dayPeriods === "object" &&
					options.dayPeriods !== null
						? {
								dayPeriods: options.dayPeriods as {
									am: string[];
									pm: string[];
								},
							}
						: {}),
				}
			: undefined,
	};

	return {
		kind: record.kind,
		recordId: record.recordId,
		profileId,
		calendarDateFormats: [config],
	};
}

function makeRuleId(recordId: string, suffix: string): string {
	return `${recordId}.${suffix}`;
}

function compileRelativeTimeRule(
	record: ClinicalInitSeedLoadedRecord,
	p: Record<string, unknown>,
	profileId: string | undefined,
): TemporalCompilationResult | null {
	const sequences = p.sequences;
	const precisionUnits = p.precisionUnits;
	const directionAnchors = p.directionAnchors;

	if (!Array.isArray(sequences) || sequences.length === 0) {
		return { kind: record.kind, recordId: record.recordId, profileId };
	}

	const attributeRules: StoredAttributeRule[] = [];

	for (let i = 0; i < sequences.length; i++) {
		const seq = sequences[i] as Record<string, unknown> | undefined;
		if (!seq || typeof seq !== "object") continue;

		const patterns = seq.patterns;
		if (!Array.isArray(patterns) || patterns.length === 0) continue;
		const regexPatterns = patterns.filter(
			(p): p is string => typeof p === "string",
		);
		if (regexPatterns.length === 0) continue;

		const targetField =
			typeof seq.targetField === "string" ? seq.targetField : "relative_time";
		const targetValue =
			typeof seq.targetValue === "string"
				? seq.targetValue
				: `relative_time_seq_${i}`;

		const rule: StoredAttributeRule = {
			ruleId: makeRuleId(record.recordId, `seq_${i}`),
			targetField,
			targetValue,
			regexPatterns,
			isCaseInsensitive: seq.isCaseInsensitive !== false,
			priority: typeof seq.priority === "number" ? seq.priority : 50,
		};
		attributeRules.push(rule);
	}

	return {
		kind: record.kind,
		recordId: record.recordId,
		profileId,
		attributeRules: attributeRules.length > 0 ? attributeRules : undefined,
	};
}

function compileRangeRule(
	record: ClinicalInitSeedLoadedRecord,
	p: Record<string, unknown>,
	profileId: string | undefined,
): TemporalCompilationResult | null {
	const sequences = p.sequences;
	const startTarget = p.startTarget;
	const endTarget = p.endTarget;
	const anchorSchema = p.anchorSchema;
	const anchorField = p.anchorField;

	const attributeRules: StoredAttributeRule[] = [];
	const conceptFieldRules: ConceptFieldRule[] = [];
	const sharedFieldAnchors: SharedFieldAnchorRule[] = [];

	if (Array.isArray(sequences)) {
		for (let i = 0; i < sequences.length; i++) {
			const seq = sequences[i] as Record<string, unknown> | undefined;
			if (!seq || typeof seq !== "object") continue;

			const patterns = seq.patterns;
			if (!Array.isArray(patterns) || patterns.length === 0) continue;
			const regexPatterns = patterns.filter(
				(p): p is string => typeof p === "string",
			);
			if (regexPatterns.length === 0) continue;

			const targetField =
				typeof seq.targetField === "string"
					? seq.targetField
					: "range_boundary";
			const targetValue =
				typeof seq.targetValue === "string"
					? seq.targetValue
					: `range_seq_${i}`;

			const rule: StoredAttributeRule = {
				ruleId: makeRuleId(record.recordId, `seq_${i}`),
				targetField,
				targetValue,
				regexPatterns,
				isCaseInsensitive: seq.isCaseInsensitive !== false,
				priority: typeof seq.priority === "number" ? seq.priority : 50,
			};
			attributeRules.push(rule);
		}
	}

	if (
		typeof startTarget === "string" &&
		typeof endTarget === "string" &&
		typeof p.conceptId === "string" &&
		typeof p.targetSchema === "string"
	) {
		const conceptId = p.conceptId as string;
		const targetSchema = p.targetSchema as string;
		conceptFieldRules.push({
			ruleId: `${record.recordId}.start`,
			conceptId,
			targetSchema,
			fieldPath: startTarget,
		});
		conceptFieldRules.push({
			ruleId: `${record.recordId}.end`,
			conceptId,
			targetSchema,
			fieldPath: endTarget,
		});
	}

	if (typeof anchorSchema === "string" && typeof anchorField === "string") {
		sharedFieldAnchors.push({
			ruleId: `${record.recordId}.context`,
			targetSchema: anchorSchema,
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: anchorField,
					relation: "contains",
					distance: {
						maxLeft: 1,
						maxRight: 0,
						unit: "items",
					},
					temporalContainment: {
						sourceRangePath: "",
						targetDateTimePath: "effectiveDatetime",
						missingDatePolicy: "inherit",
					},
				},
			],
		});
	}

	return {
		kind: record.kind,
		recordId: record.recordId,
		profileId,
		attributeRules: attributeRules.length > 0 ? attributeRules : undefined,
		conceptFieldRules:
			conceptFieldRules.length > 0 ? conceptFieldRules : undefined,
		sharedFieldAnchors:
			sharedFieldAnchors.length > 0 ? sharedFieldAnchors : undefined,
	};
}

function compileCadenceRule(
	record: ClinicalInitSeedLoadedRecord,
	p: Record<string, unknown>,
	profileId: string | undefined,
): TemporalCompilationResult | null {
	const mappings = p.mappings;

	if (!Array.isArray(mappings) || mappings.length === 0) {
		return { kind: record.kind, recordId: record.recordId, profileId };
	}

	const attributeRules: StoredAttributeRule[] = [];

	for (let i = 0; i < mappings.length; i++) {
		const mapping = mappings[i] as Record<string, unknown> | undefined;
		if (!mapping || typeof mapping !== "object") continue;

		const patterns = mapping.patterns;
		if (!Array.isArray(patterns) || patterns.length === 0) continue;
		const regexPatterns = patterns.filter(
			(p): p is string => typeof p === "string",
		);
		if (regexPatterns.length === 0) continue;

		const targetField =
			typeof mapping.targetField === "string" ? mapping.targetField : "cadence";
		const targetValue =
			typeof mapping.targetValue === "string"
				? mapping.targetValue
				: `cadence_${i}`;

		attributeRules.push({
			ruleId: makeRuleId(record.recordId, `map_${i}`),
			targetField,
			targetValue,
			regexPatterns,
			isCaseInsensitive: mapping.isCaseInsensitive !== false,
			priority: typeof mapping.priority === "number" ? mapping.priority : 50,
		});
	}

	return {
		kind: record.kind,
		recordId: record.recordId,
		profileId,
		attributeRules: attributeRules.length > 0 ? attributeRules : undefined,
	};
}

function compileExclusionRule(
	record: ClinicalInitSeedLoadedRecord,
	p: Record<string, unknown>,
	profileId: string | undefined,
): TemporalCompilationResult | null {
	const sequences = p.sequences;

	if (!Array.isArray(sequences) || sequences.length === 0) {
		return { kind: record.kind, recordId: record.recordId, profileId };
	}

	const attributeRules: StoredAttributeRule[] = [];
	const sharedFieldAnchors: SharedFieldAnchorRule[] = [];

	for (let i = 0; i < sequences.length; i++) {
		const seq = sequences[i] as Record<string, unknown> | undefined;
		if (!seq || typeof seq !== "object") continue;

		const patterns = seq.patterns;
		if (!Array.isArray(patterns) || patterns.length === 0) continue;
		const regexPatterns = patterns.filter(
			(p): p is string => typeof p === "string",
		);
		if (regexPatterns.length === 0) continue;

		const targetField =
			typeof seq.targetField === "string" ? seq.targetField : "exclusion";
		const targetValue =
			typeof seq.targetValue === "string"
				? seq.targetValue
				: `exclusion_seq_${i}`;

		attributeRules.push({
			ruleId: makeRuleId(record.recordId, `seq_${i}`),
			targetField,
			targetValue,
			regexPatterns,
			isCaseInsensitive: seq.isCaseInsensitive !== false,
			priority: typeof seq.priority === "number" ? seq.priority : 50,
		});
	}

	const anchorSchema = p.anchorSchema;
	const anchorField = p.anchorField;
	if (
		typeof anchorSchema === "string" &&
		typeof anchorField === "string" &&
		typeof p.exclusionSchema === "string"
	) {
		sharedFieldAnchors.push({
			ruleId: `${record.recordId}.exclusion-context`,
			targetSchema: anchorSchema as string,
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: anchorField as string,
					relation: "excludes",
					distance: {
						maxLeft: 1,
						maxRight: 0,
						unit: "items",
					},
				},
			],
		});
	}

	return {
		kind: record.kind,
		recordId: record.recordId,
		profileId,
		attributeRules: attributeRules.length > 0 ? attributeRules : undefined,
		sharedFieldAnchors:
			sharedFieldAnchors.length > 0 ? sharedFieldAnchors : undefined,
	};
}
