import { TIME_UNITS, type TimePrecisionLevel, type TimeUnit } from "../schemas/schemas-interface/time";
import type { TemporalExpression } from "./temporal-expression";
import {
	createTemporalSyntaxProfile,
	type TemporalSyntaxProfile,
} from "./temporal-syntax-profile";
import { buildDatePatternString, buildDayPeriodMap, buildMonthNameMap } from "./utils/date-regex-generator";

export function recognizeTemporalExpression(
	text: string,
	profile: TemporalSyntaxProfile = createTemporalSyntaxProfile({
		profileId: "v2-temporal-default",
	}),
): { expression?: TemporalExpression; diagnostics: string[] } {
	const input = text.trim();
	if (!input) return { diagnostics: ["Temporal expression is empty"] };
	const lower = input.toLocaleLowerCase();
	const alias = profile.relativeDayAliases[lower];
	if (alias !== undefined)
		return {
			expression: { kind: "relative_day", offsetDays: alias },
			diagnostics: [],
		};
	for (const delimiter of profile.rangeDelimiters) {
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
	for (const rule of profile.dateRecognitionRules) {
		const match = new RegExp(rule.pattern, "u").exec(input);
		if (!match?.groups) continue;
		const year = match.groups[rule.yearGroup];
		const month = match.groups[rule.monthGroup];
		const day = match.groups[rule.dayGroup];
		if (!year || !month || !day) continue;
		const time = rule.timeGroup ? match.groups[rule.timeGroup] : undefined;
		return {
			expression: {
				kind: "absolute_instant",
				instant: time
					? `${year}-${month}-${day}T${time}`
					: `${year}-${month}-${day}T00:00:00.000Z`,
				precision: rule.precision,
			},
			diagnostics: [],
		};
	}
	for (const format of profile.dateTimeFormats ?? []) {
		const generated = buildDatePatternString(format.tokens, format.separators, format.options);
		const match = new RegExp(generated.pattern, "u").exec(input);
		if (!match?.groups) continue;
		const groups = match.groups;
		const year = groups.yyyy ?? groups.yy;
		const month = groups.mm_name
			? buildMonthNameMap(format.options?.monthNames)[groups.mm_name.toLocaleLowerCase()]
			: Number(groups.mm);
		const day = Number(groups.dd);
		if (!year || !month || !day) continue;
		let hour = groups.hh ? Number(groups.hh) : 0;
		const minute = groups.min ? Number(groups.min) : 0;
		const second = groups.ss ? Number(groups.ss) : 0;
		if (!format.options?.is24Hour && groups.ampm) {
			const period = buildDayPeriodMap(format.options?.dayPeriods).get(groups.ampm.toLocaleLowerCase());
			if (period === "pm" && hour < 12) hour += 12;
			if (period === "am" && hour === 12) hour = 0;
		}
		const date = `${String(year).length === 2 ? `20${year}` : year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
		const instant = groups.tz ? `${date}T${time}${groups.tz}` : `${date}T${time}.000Z`;
		if (Number.isNaN(new Date(instant).getTime())) continue;
		return { expression: { kind: "absolute_instant", instant, precision: format.tokens.includes("HH") ? "second" : "day" }, diagnostics: [] };
	}
	const tokens = lower.split(/\s+/);
	const direction =
		profile.directionAliases[tokens[0] ?? ""] ??
		profile.directionAliases[tokens.at(-1) ?? ""];
	const numericIndex =
		direction === "prospective" && profile.directionAliases[tokens[0] ?? ""]
			? 1
			: 0;
	const amount = Number(tokens[numericIndex]);
	const unitToken = tokens[numericIndex + 1];
	const unit = unitToken ? profile.unitAliases[unitToken] : undefined;
	if (Number.isFinite(amount) && unit)
		return {
			expression: {
				kind: "relative",
				direction: direction ?? "static_approximate",
				amount,
				unit,
			},
			diagnostics: [],
		};
	return { diagnostics: [`Unable to recognize temporal expression '${text}'`] };
}

export function temporalUnitIsTimeUnit(unit: TimePrecisionLevel): boolean {
	return TIME_UNITS.includes(unit as TimeUnit);
}
