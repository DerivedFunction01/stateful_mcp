import { validateAndResolve } from "./grammar-validation";
import type { CadenceParseContext } from "./parse-context";
import type { CadenceSchedule, CadenceScheduleResolution } from "./types";

/**
 * 2. Direct Shorthand Lookup (e.g. "BID", "Q4H", "QHS", "DAILY").
 * Returns the resolved schedule envelope when a normalized alias matches, or
 * undefined to continue to the next branch.
 */
export function tryShorthand<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	ctx: CadenceParseContext<TAnchor, TUnit>,
): CadenceScheduleResolution<TAnchor, TUnit> | undefined {
	const {
		workingText,
		frequencyAliases,
		config,
		isConditional,
		conditionReason,
		rawText,
		diagnostics,
		policy,
	} = ctx;
	const normalizedLower = workingText
		.toLocaleLowerCase(config.locales as string)
		.replace(/[.\s]/g, "");
	for (const [aliasKey, aliasSchedule] of Object.entries(frequencyAliases)) {
		const normKey = aliasKey
			.toLocaleLowerCase(config.locales as string)
			.replace(/[.\s]/g, "");
		if (normalizedLower === normKey) {
			const candidate: CadenceSchedule<TAnchor, TUnit> = {
				cadenceType: (aliasSchedule.cadenceType ?? "interval") as any,
				...(aliasSchedule.interval ? { interval: aliasSchedule.interval } : {}),
				...(aliasSchedule.recurrence
					? { recurrence: aliasSchedule.recurrence }
					: {}),
				...(aliasSchedule.eventAnchor
					? { eventAnchor: aliasSchedule.eventAnchor }
					: {}),
				...(isConditional || aliasSchedule.isConditional
					? { isConditional: true }
					: {}),
				...(conditionReason || aliasSchedule.condition
					? { condition: conditionReason ?? aliasSchedule.condition }
					: {}),
				rawText,
			};
			return validateAndResolve(candidate, policy, diagnostics);
		}
	}
	return undefined;
}
