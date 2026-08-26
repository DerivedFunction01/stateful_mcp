import { detectConditional } from "./conditional";
import { tryEventAnchor } from "./event-anchor";
import { validateAndResolve } from "./grammar-validation";
import { tryInterval } from "./interval";
import { createParseContext } from "./parse-context";
import { tryRecurrence } from "./recurrence";
import { tryShorthand } from "./shorthand";
import { tryTemplates } from "./templates";
import type {
	CadenceScheduleResolution,
	FrequencyConsumerPolicy,
	FrequencyGrammarConfig,
} from "./types";

/**
 * Parses a free-text frequency, cadence, rate schedule, or shorthand into a structured CadenceSchedule.
 * Zero hardcoded language fallbacks. If aliases/connectors/templates are not configured, nothing is parsed.
 */
export function evaluateCadenceGrammar<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	input: string,
	config: Partial<FrequencyGrammarConfig<TAnchor, TUnit>> = {},
	policy: FrequencyConsumerPolicy<TAnchor, TUnit> = {},
): CadenceScheduleResolution<TAnchor, TUnit> {
	const ctx = createParseContext(input, config, policy);

	if (!ctx.rawText) {
		return {
			diagnostics: [
				{
					code: "empty_input",
					messageKey: "errors.frequencyEmpty",
				},
			],
		};
	}

	detectConditional(ctx);

	const matched =
		tryShorthand(ctx) ??
		tryTemplates(ctx) ??
		tryInterval(ctx) ??
		tryEventAnchor(ctx) ??
		tryRecurrence(ctx);

	if (matched) {
		return matched;
	}

	// 7. If only PRN / Conditional was found without explicit interval (e.g. "prn pain")
	if (ctx.isConditional) {
		const candidate = {
			cadenceType: "one_time" as any,
			isConditional: true,
			...(ctx.conditionReason ? { condition: ctx.conditionReason } : {}),
			rawText: ctx.rawText,
		};
		return validateAndResolve(candidate, policy, ctx.diagnostics);
	}

	return {
		diagnostics: [
			{
				code: "unrecognized_cadence",
				messageKey: "errors.frequencyUnrecognized",
				messageParams: { rawText: ctx.rawText },
			},
		],
	};
}
