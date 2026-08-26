import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { DateTimeToken } from "../token-spec";

export type DateTimeValueKind = "date" | "time" | "datetime";
export type DateTimeField =
	| "year"
	| "month"
	| "day"
	| "dayOfYear"
	| "hour"
	| "minute"
	| "second"
	| "dayPeriod"
	| "timeZone";

export interface TwoDigitYearCenturyConfig {
	readonly pivotYear?: number;
	readonly currentCentury?: number;
	readonly previousCentury?: number;
	readonly centuryDecades?: Readonly<Record<string, string>>;
}

export interface DateTimeFormatOptions {
	centuryDecades?: Record<string, string>;
	twoDigitYear?: TwoDigitYearCenturyConfig;
	is24Hour?: boolean;
	exact?: boolean;
	monthNames?: string[];
	monthAliases?: string[][];
	dayPeriods?: { am: string[]; pm: string[] };
	precision?: string;
	locale?: string;
	timeZone?: string;
	firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface DateTimeFormatConfig {
	id?: string;
	readonly tokens: readonly DateTimeToken[];
	readonly separators: readonly string[];
	options?: DateTimeFormatOptions;
}

export interface DateTimeFormatDefinition extends DateTimeFormatConfig {
	readonly id: string;
	readonly kind: DateTimeValueKind;
	readonly fields?: readonly DateTimeField[];
	readonly parserEnabled?: boolean;
	readonly parserPriority?: number;
	readonly displayLabel?: string;
}

export interface DateTimeFormatRegistry {
	readonly formats: Readonly<Record<string, DateTimeFormatDefinition>>;
	readonly display: Partial<Record<DateTimeValueKind, string>>;
	readonly parse: Readonly<Record<DateTimeValueKind, readonly string[]>>;
}

export interface DateTimeInputSpec {
	readonly role: DateTimeValueKind;
	readonly requiredFields: readonly DateTimeField[];
	readonly allowAdditionalFields?: boolean;
	readonly optional?: boolean;
	readonly combineWith?: string;
	readonly missingDatePolicy?: "reject" | "use-context-date";
	readonly missingTimePolicy?: "reject" | "start-of-day";
}

export interface DateTimeRegistryDiagnostic {
	readonly code:
		| "duplicate-id"
		| "missing-reference"
		| "kind-mismatch"
		| "field-mismatch"
		| "ambiguous-order";
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly formatId?: string;
}

const TOKEN_FIELDS: Readonly<Record<DateTimeToken, DateTimeField>> = {
	YYYY: "year",
	YY: "year",
	MM: "month",
	MM_name: "month",
	DD: "day",
	DDD: "dayOfYear",
	HH: "hour",
	min: "minute",
	SS: "second",
	ampm: "dayPeriod",
	tz: "timeZone",
};

export function fieldsForDateTimeTokens(
	tokens: readonly DateTimeToken[],
): readonly DateTimeField[] {
	return [...new Set(tokens.map((token) => TOKEN_FIELDS[token]))];
}

export function inferDateTimeKind(
	fields: readonly DateTimeField[],
): DateTimeValueKind {
	const hasDate = fields.some((field) =>
		["year", "month", "day", "dayOfYear"].includes(field),
	);
	const hasTime = fields.some((field) =>
		["hour", "minute", "second", "dayPeriod", "timeZone"].includes(field),
	);
	return hasDate && hasTime ? "datetime" : hasTime ? "time" : "date";
}

export function normalizeDateTimeFormatDefinition(
	definition: DateTimeFormatDefinition,
): DateTimeFormatDefinition {
	const inferredFields = fieldsForDateTimeTokens(definition.tokens);
	return {
		...definition,
		fields: definition.fields ?? inferredFields,
	};
}

export function createDateTimeRegistry(
	legacy?: DateTimeFormatConfig,
): DateTimeFormatRegistry {
	if (!legacy)
		return {
			formats: {},
			display: {},
			parse: { date: [], time: [], datetime: [] },
		};
	const id = legacy.id ?? "legacy.date";
	const definition = normalizeDateTimeFormatDefinition({
		...legacy,
		id,
		kind: inferDateTimeKind(fieldsForDateTimeTokens(legacy.tokens)),
	});
	return {
		formats: { [id]: definition },
		display: { [definition.kind]: id },
		parse: {
			date: definition.kind === "date" ? [id] : [],
			time: definition.kind === "time" ? [id] : [],
			datetime: definition.kind === "datetime" ? [id] : [],
		},
	};
}

export function validateDateTimeRegistry(
	registry: DateTimeFormatRegistry,
): readonly DateTimeRegistryDiagnostic[] {
	const diagnostics: DateTimeRegistryDiagnostic[] = [];
	const seen = new Set<string>();
	for (const [key, raw] of Object.entries(registry.formats)) {
		const definition = normalizeDateTimeFormatDefinition(raw);
		if (seen.has(definition.id) || key !== definition.id)
			diagnostics.push({
				code: "duplicate-id",
				messageKey: "errors.dateTimeDuplicateId",
				messageParams: { id: definition.id },
				formatId: definition.id,
			});
		seen.add(definition.id);
		const inferred = new Set(fieldsForDateTimeTokens(definition.tokens));
		if ((definition.fields ?? []).some((field) => !inferred.has(field)))
			diagnostics.push({
				code: "field-mismatch",
				messageKey: "errors.dateTimeFieldMismatch",
				messageParams: { id: definition.id },
				formatId: definition.id,
			});
		seen.add(definition.id);
	}
	for (const kind of ["date", "time", "datetime"] as const) {
		for (const id of registry.parse[kind] ?? []) {
			const definition = registry.formats[id];
			if (!definition)
				diagnostics.push({
					code: "missing-reference",
					messageKey: "errors.dateTimeMissingReference",
					messageParams: { id },
					formatId: id,
				});
			else if (definition.kind !== kind)
				diagnostics.push({
					code: "kind-mismatch",
					messageKey: "errors.dateTimeKindMismatch",
					messageParams: { id, kind: definition.kind, expected: kind },
					formatId: id,
				});
		}
	}
	return diagnostics;
}

export function selectDateTimeFormats(
	registry: DateTimeFormatRegistry,
	spec: DateTimeInputSpec,
): readonly DateTimeFormatDefinition[] {
	const required = new Set(spec.requiredFields);
	const ids = registry.parse[spec.role] ?? [];
	return ids
		.map((id) => registry.formats[id])
		.filter((definition): definition is DateTimeFormatDefinition =>
			Boolean(definition && definition.parserEnabled !== false),
		)
		.filter((definition) => {
			const fields = new Set(
				definition.fields ?? fieldsForDateTimeTokens(definition.tokens),
			);
			return (
				[...required].every((field) => fields.has(field)) &&
				(spec.allowAdditionalFields !== false || fields.size === required.size)
			);
		})
		.sort((a, b) => (b.parserPriority ?? 0) - (a.parserPriority ?? 0));
}

export interface DatePatternResult {
	pattern: string;
	groupNames: string[];
}

export interface DateTimeComponents {
	year?: number;
	month?: number;
	day?: number;
	dayOfYear?: number;
	hour?: number;
	minute?: number;
	second?: number;
	dayPeriod?: "am" | "pm";
	timeZone?: string;
}

export interface DateTimeCompositionOptions {
	/** Order of composition (default: "date-first") */
	readonly order?: "date-first" | "time-first" | "both";
	/** Connectors/separators between date and time (default: [" ", "T"]) */
	readonly separators?: readonly string[];
	/** List of combined format strings to exclude/disable */
	readonly disabledCombinations?: readonly string[];
}
