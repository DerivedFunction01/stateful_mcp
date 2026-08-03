import type { TimePrecisionLevel } from "../schemas/schemas-interface/time";
import type { TemporalExpression } from "./temporal-expression";
import {
	createTemporalSyntaxProfile,
	type TemporalSyntaxProfile,
} from "./temporal-syntax-profile";

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
	return [
		"second",
		"minute",
		"hour",
		"day",
		"week",
		"month",
		"year",
		"quarter",
		"decade",
	].includes(unit);
}
