import { escapeRegex } from "../regex";
import { validateAndResolve } from "./grammar-validation";
import type { CadenceParseContext } from "./parse-context";
import type { CadenceSchedule, CadenceScheduleResolution } from "./types";

/**
 * 6. Match Recurrence Schedules (e.g. "3 times a day", "twice daily",
 * "100 req/sec", "2x/day").
 * 6a. Multiplier word/alias + connector/space + period.
 * 6b. Count + connector + period.
 */
export function tryRecurrence<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	ctx: CadenceParseContext<TAnchor, TUnit>,
): CadenceScheduleResolution<TAnchor, TUnit> | undefined {
	const {
		multiplierAliases,
		recurrenceConnectors,
		workingText,
		isConditional,
		conditionReason,
		rawText,
		diagnostics,
		policy,
		resolveMultiplier,
		resolveTimeUnit,
	} = ctx;

	// 6a. Multiplier word/alias + connector/space + period (e.g. "twice a week", "once daily", "thrice monthly")
	for (const [countStr, mAliases] of Object.entries(multiplierAliases)) {
		const sortedMAliases = [...mAliases].sort((a, b) => b.length - a.length);
		for (const mAlias of sortedMAliases) {
			const isMSymbol = /^[^a-zA-Z0-9\s]+$/u.test(mAlias);
			const mPrefix = isMSymbol
				? `^${escapeRegex(mAlias)}\\s*`
				: `^${escapeRegex(mAlias)}(?:\\s+|$)`;

			// Direct match against single word period if period is already daily/monthly etc.
			// Or via connector (e.g. "twice a week", "once daily")
			const sortedConnectors = [...recurrenceConnectors].sort(
				(a, b) => b.length - a.length,
			);
			const connPatterns = sortedConnectors.map((c) => {
				const isCSymbol = /^[^a-zA-Z0-9\s]+$/u.test(c);
				return isCSymbol
					? `\\s*${escapeRegex(c)}\\s*`
					: `\\s+${escapeRegex(c)}\\s+`;
			});

			const combinedConnPattern =
				connPatterns.length > 0 ? `(?:${connPatterns.join("|")}|\\s+)` : "\\s+";

			const mRegex = new RegExp(
				`^${escapeRegex(mAlias)}${combinedConnPattern}(?<period>[\\p{L}]+)$`,
				"iu",
			);
			const mMatch = workingText.match(mRegex);
			if (mMatch?.groups?.period) {
				const period = resolveTimeUnit(mMatch.groups.period);
				if (period) {
					const candidate: CadenceSchedule<TAnchor, TUnit> = {
						cadenceType: "recurrence" as any,
						recurrence: { count: Number(countStr), period },
						...(isConditional ? { isConditional: true } : {}),
						...(conditionReason ? { condition: conditionReason } : {}),
						rawText,
					};
					return validateAndResolve(candidate, policy, diagnostics);
				}
			}
		}
	}

	// 6b. Count + connector + period (e.g. "3 times a day", "2x/day", "100 / sec")
	const sortedConnectors = [...recurrenceConnectors].sort(
		(a, b) => b.length - a.length,
	);
	for (const connector of sortedConnectors) {
		const isCSymbol = /^[^a-zA-Z0-9\s]+$/u.test(connector);
		const connPattern = isCSymbol
			? `\\s*${escapeRegex(connector)}\\s*`
			: `\\s+${escapeRegex(connector)}\\s+`;

		const recRegex = new RegExp(
			`^(?<count>[\\d\\p{Nd}]+|[\\p{L}]+(?:\\s*x)?)${connPattern}(?<period>[\\p{L}]+)$`,
			"iu",
		);
		const match = workingText.match(recRegex);
		if (match?.groups?.count && match.groups.period) {
			const count = resolveMultiplier(match.groups.count);
			const period = resolveTimeUnit(match.groups.period);
			if (count !== undefined && period) {
				const candidate: CadenceSchedule<TAnchor, TUnit> = {
					cadenceType: "recurrence" as any,
					recurrence: { count, period },
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
