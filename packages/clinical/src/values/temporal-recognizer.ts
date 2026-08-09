import {
	TIME_UNITS,
	type TimePrecisionLevel,
	type TimeUnit,
} from "../schemas/schemas-interface/time";
import {
	createNumericalSyntaxProfile,
	type NumericalSyntaxProfile,
} from "./numerical-syntax-profile";
import type { TemporalExpression } from "./temporal-expression";
import {
	buildDatePatternString,
	buildDayPeriodMap,
	buildMonthNameMap,
} from "./utils/date-regex-generator";
import { parseQuantity } from "./quantity-grammar";
import { resolveTemporalEnum } from "./temporal-enum-resolver";

export function recognizeTemporalExpression(
	text: string,
	profile: NumericalSyntaxProfile = createNumericalSyntaxProfile({
		profileId: "v2-numerical-default",
	}),
): { expression?: TemporalExpression; diagnostics: string[] } {
	const input = text.trim();
	if (!input) return { diagnostics: ["Temporal expression is empty"] };
	const lower = input.toLocaleLowerCase();
	const t = profile.temporal;
	const alias = t.relativeDayAliases[lower];
	if (alias !== undefined)
		return {
			expression: { kind: "relative_day", offsetDays: alias },
			diagnostics: [],
		};
	for (const delimiter of t.rangeDelimiters) {
		const index = lower.indexOf(delimiter);
		if (index > 0) {
			const left = recognizeTemporalExpression(input.slice(0, index), profile);
			const right = recognizeTemporalExpression(
				input.slice(index + delimiter.length),
				profile,
			);
			if (
				left.expression &&
				right.expression &&
				!left.diagnostics.length &&
				!right.diagnostics.length
			)
				return {
					expression: {
						kind: "range",
						start: left.expression,
						end: right.expression,
					},
					diagnostics: [],
				};
		}
	}
	for (const format of t.dateTimeFormats) {
		const generated = buildDatePatternString(
			format.tokens,
			format.separators,
			format.options,
		);
		const match = new RegExp(generated.pattern, "u").exec(input);
		if (!match?.groups) continue;
		const groups = match.groups;
		const year = groups.yyyy ?? groups.yy;
		const month = groups.mm_name
			? buildMonthNameMap(format.options?.monthNames, format.options?.monthAliases)[
					groups.mm_name.toLocaleLowerCase()
				]
			: Number(groups.mm);
		const day = Number(groups.dd);
		if (!year || !month || !day) continue;
		let hour = groups.hh ? Number(groups.hh) : 0;
		const minute = groups.min ? Number(groups.min) : 0;
		const second = groups.ss ? Number(groups.ss) : 0;
		if (!format.options?.is24Hour && groups.ampm) {
			const period = buildDayPeriodMap(format.options?.dayPeriods).get(
				groups.ampm.toLocaleLowerCase(),
			);
			if (period === "pm" && hour < 12) hour += 12;
			if (period === "am" && hour === 12) hour = 0;
		}
		const date = `${String(year).length === 2 ? `20${year}` : year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
		const instant = groups.tz
			? `${date}T${time}${groups.tz}`
			: `${date}T${time}.000Z`;
		if (Number.isNaN(new Date(instant).getTime())) continue;
		const precision: TimePrecisionLevel =
			format.options?.precision ??
			(format.tokens.includes("HH") ? "second" : "day");
		return {
			expression: { kind: "absolute_instant", instant, precision },
			diagnostics: [],
		};
	}
	const tokens = lower.split(/\s+/);
	const leadingDirection = resolveTemporalEnum(tokens[0] ?? "", "direction", t);
	const trailingDirection = resolveTemporalEnum(tokens.at(-1) ?? "", "direction", t);
	const direction = (leadingDirection ?? trailingDirection) as
		| "retrospective"
		| "prospective"
		| "static_approximate"
		| undefined;
	const quantityText = leadingDirection
		? tokens.slice(1).join(" ")
		: trailingDirection
			? tokens.slice(0, -1).join(" ")
			: lower;
	const quantity = parseQuantity(
		quantityText,
		{
			unitAliases: t.unitAliases,
			rangeDelimiters: t.rangeDelimiters,
		},
		{
			allowedUnits: Object.values(t.unitAliases),
			allowRange: true,
			allowOperator: false,
			statistics: "reject",
			allowDataPointCount: false,
		},
	);
	if (quantity.value)
		return {
			expression: {
				kind: "relative",
				direction: direction ?? "static_approximate",
				amount: quantity.value.lower,
				upperAmount: quantity.value.upper,
				unit: quantity.value.unit as TimePrecisionLevel,
			},
			diagnostics: quantity.diagnostics.map((diagnostic) => diagnostic.message),
		};
	return { diagnostics: [`Unable to recognize temporal expression '${text}'`] };
}

export function temporalUnitIsTimeUnit(unit: TimePrecisionLevel): boolean {
	return TIME_UNITS.includes(unit as TimeUnit);
}
