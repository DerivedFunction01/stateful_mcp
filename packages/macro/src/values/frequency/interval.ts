import { parseNumericValue } from "../numeric";
import { escapeRegex } from "../regex";
import { validateAndResolve } from "./grammar-validation";
import type { CadenceParseContext } from "./parse-context";
import type { CadenceSchedule, CadenceScheduleResolution } from "./types";

/**
 * 4. Match Interval Schedules with explicit interval prefix
 * (e.g. "every 4 hours", "cada 8 horas", "每4小时", "q4h").
 */
export function tryInterval<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	ctx: CadenceParseContext<TAnchor, TUnit>,
): CadenceScheduleResolution<TAnchor, TUnit> | undefined {
	const {
		config,
		intervalPrefixes,
		workingText,
		isConditional,
		conditionReason,
		rawText,
		diagnostics,
		policy,
		resolveTimeUnit,
	} = ctx;

	for (const prefix of intervalPrefixes) {
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(prefix);
		const prefixPattern = isSymbol
			? `^${escapeRegex(prefix)}\\s*`
			: `^${escapeRegex(prefix)}(?:\\s+|(?=[\\d\\p{Nd}]))`;

		const intRegex = new RegExp(
			`${prefixPattern}(?<low>[\\d\\p{Nd}]+(?:[.,][\\d\\p{Nd}]+)?)\\s*(?<unit>[\\p{L}]+)$`,
			"iu",
		);
		const match = workingText.match(intRegex);
		if (match?.groups?.low && match.groups.unit) {
			const lowRes = parseNumericValue(match.groups.low, config.numericConfig);
			const highRes = match.groups.high
				? parseNumericValue(match.groups.high, config.numericConfig)
				: undefined;
			const unit = resolveTimeUnit(match.groups.unit);
			if (lowRes.parsed && unit) {
				const candidate: CadenceSchedule<TAnchor, TUnit> = {
					cadenceType: "interval" as any,
					interval: {
						multiplier: lowRes.parsed.value,
						unit,
						...(highRes?.parsed
							? { upperMultiplier: highRes.parsed.value }
							: {}),
					},
					...(isConditional ? { isConditional: true } : {}),
					...(conditionReason ? { condition: conditionReason } : {}),
					rawText,
				};
				return validateAndResolve(candidate, policy, diagnostics);
			}
		}
	}
	return undefined;
}
