import { EMPTY_DIAGNOSTICS } from "../numeric";
import {
	type ExtractedOperatorResult,
	extractOperator,
	type OperatorMatch,
} from "../operators";
import { splitByDelimiters } from "../token-matcher";
import { parseRateDenominator } from "./denominator";
import { parseRateNumerator } from "./numerator";
import type {
	CompoundRateConfig,
	CompoundRateConsumerPolicy,
	CompoundRateDenominator,
	CompoundRateNumerator,
	CompoundRateResolution,
	CompoundRateValue,
} from "./types";

export function evaluateRateGrammar(
	input: string,
	config: CompoundRateConfig = {},
	policy: CompoundRateConsumerPolicy = {},
): CompoundRateResolution {
	const rawText = input.trim();
	if (!rawText)
		return {
			diagnostics: [{ code: "invalid_rate", messageKey: "errors.rateEmpty" }],
		};
	let text = rawText;
	let operatorMatch: OperatorMatch | undefined;
	if (config.operatorConfig) {
		const opRes: ExtractedOperatorResult = extractOperator(
			text,
			config.operatorConfig,
		);
		if (opRes.operatorMatch) {
			if (policy.allowOperator === false)
				return {
					diagnostics: [
						{
							code: "operator_not_allowed",
							messageKey: "errors.rateOperatorNotAllowed",
							messageParams: { operator: opRes.operatorMatch.rawText },
						},
					],
				};
			operatorMatch = opRes.operatorMatch;
			text = opRes.remainderText;
		}
	}
	const rateDelimiters = config.rateDelimiters ?? [];
	const segments =
		rateDelimiters.length > 0
			? (splitByDelimiters(text, rateDelimiters)?.parts ?? [text])
			: [text];
	if (segments.length < 2)
		return {
			diagnostics: [
				{
					code: "not_a_rate",
					messageKey: "errors.rateMissingDelimiters",
					messageParams: { rawText },
				},
			],
		};
	if (
		policy.maxDenominators !== undefined &&
		segments.length - 1 > policy.maxDenominators
	)
		return {
			diagnostics: [
				{
					code: "too_many_denominators",
					messageKey: "errors.rateTooManyDenominators",
					messageParams: {
						count: segments.length - 1,
						max: policy.maxDenominators,
					},
				},
			],
		};
	const numSegment = segments[0]?.trim();
	if (!numSegment)
		return {
			diagnostics: [
				{ code: "invalid_numerator", messageKey: "errors.rateNumeratorEmpty" },
			],
		};
	const numerator: CompoundRateNumerator | undefined = parseRateNumerator(
		numSegment,
		config,
		policy,
	);
	if (!numerator)
		return {
			diagnostics: [
				{
					code: "invalid_numerator",
					messageKey: "errors.rateNumeratorInvalid",
					messageParams: { segment: numSegment },
				},
			],
		};
	const denominators: CompoundRateDenominator[] = [];
	for (let i = 1; i < segments.length; i++) {
		const denSeg = segments[i]?.trim();
		if (!denSeg)
			return {
				diagnostics: [
					{
						code: "invalid_denominator",
						messageKey: "errors.rateDenominatorEmpty",
						messageParams: { index: i },
					},
				],
			};
		const denominator = parseRateDenominator(denSeg, config);
		if (denominator) denominators.push(denominator);
	}
	const rateValue: CompoundRateValue = {
		kind: "rate",
		numerator,
		denominators,
		...(operatorMatch ? { operator: operatorMatch } : {}),
		rawText,
	};
	return { value: rateValue, diagnostics: EMPTY_DIAGNOSTICS };
}
