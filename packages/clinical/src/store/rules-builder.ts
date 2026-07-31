import {
	buildDatePatternString,
	type DateTimeFormatConfig,
} from "../parser/utils/date-regex-generator";
import { buildNumericPatternString } from "../parser/utils/numeric-regex-generator";
import type {
	AttributeParserRule,
	NumericFieldFormatOptions,
} from "./interfaces";

export function buildCalendarDateRules(
	formats: DateTimeFormatConfig[],
): AttributeParserRule[] {
	return formats.map((format, idx) => {
		const datePattern = buildDatePatternString(
			format.tokens,
			format.separators,
			format.options,
		);
		return {
			targetField: "calendar_date" as const,
			targetValue: "calendar_date" as const,
			regexPatterns: [datePattern.pattern],
			isCaseInsensitive: true,
			priority: 100,
			calendarTokens: format.tokens,
			calendarSeparators: format.separators,
			monthNames: format.options?.monthNames,
			dayPeriods: format.options?.dayPeriods,
			namedGroupContract: {
				required: datePattern.groupNames,
				allowed: datePattern.groupNames,
			},
		};
	});
}

export function buildNumericFieldRules(
	formats: NumericFieldFormatOptions[],
): AttributeParserRule[] {
	const validFormats = formats.filter(
		(
			f,
		): f is Required<Pick<NumericFieldFormatOptions, "targetField">> &
			NumericFieldFormatOptions => f.targetField !== undefined,
	);
	return validFormats
		.map((format) => ({
			targetField: format.targetField,
			targetValue: "number" as const,
			regexPatterns: [buildNumericPatternString(format)],
			isCaseInsensitive: true,
			priority: format.priority ?? 1,
			integerDigits: format.integerDigits,
			decimalDigits: format.decimalDigits,
			allowNegative: format.allowNegative,
			leadingMin: format.leadingMin,
			leadingMax: format.leadingMax,
			targetSchema: format.targetSchema,
		}))
		.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
}
