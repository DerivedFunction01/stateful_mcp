import {
	type CurrencyFormatConfig,
	type CurrencyGrammarResult,
	parseCurrency,
} from "./currency";
import {
	type ExtractedOperatorResult,
	extractOperator,
	type OperatorConfig,
	type OperatorMatch,
} from "./operators";
import {
	parseQuantity,
	type QuantityConsumerPolicy,
	type QuantityGrammarConfig,
	resolveUnitAlias,
	type SingleQuantity,
} from "./quantity";
import { splitByDelimiters } from "./token-matcher";

export interface CompoundRateDenominator {
	readonly unit: string;
	readonly magnitude: number; // usually 1, but e.g. "per 2 hours" -> 2
	readonly quantity?: SingleQuantity;
	readonly rawText: string;
}

export type CompoundRateNumerator =
	| { readonly type: "quantity"; readonly quantity: SingleQuantity }
	| { readonly type: "currency"; readonly currency: CurrencyGrammarResult };

export interface CompoundRateValue {
	readonly kind: "rate";
	readonly numerator: CompoundRateNumerator;
	readonly denominators: readonly CompoundRateDenominator[];
	readonly operator?: OperatorMatch;
	readonly rawText: string;
}

import type { BaseValueGrammarConfig } from "./numeric";
import type { RateToken, ValueFormatConfig } from "./token-spec";

export interface CompoundRateConfig extends BaseValueGrammarConfig {
	readonly templates?: readonly (ValueFormatConfig<RateToken> | string)[];
	readonly quantityConfig?: QuantityGrammarConfig;
	readonly currencyConfig?: CurrencyFormatConfig;
	readonly operatorConfig?: OperatorConfig;
	/** Rate division delimiters (e.g. ["/", "per", "por", "pro", "je", "每"]) */
	readonly rateDelimiters?: readonly string[];
	readonly locales?: string | readonly string[];
}

export interface CompoundRateConsumerPolicy {
	readonly allowOperator?: boolean;
	readonly maxDenominators?: number; // e.g. 2 for mg/kg/day
	readonly quantityPolicy?: QuantityConsumerPolicy;
}

export interface CompoundRateResolution {
	readonly value?: CompoundRateValue;
	readonly diagnostics: Array<{ code: string; message: string }>;
}

/**
 * Parses multi-divisor compound rates (e.g. "10 mg/kg/day", "0.5 mcg/kg/min", "$50/hr", ">= 100 km/h").
 * Does NOT inject hardcoded English words.
 */
export function parseCompoundRate(
	input: string,
	config: CompoundRateConfig = {},
	policy: CompoundRateConsumerPolicy = {},
): CompoundRateResolution {
	const rawText = input.trim();
	if (!rawText) {
		return {
			diagnostics: [
				{ code: "invalid_rate", message: "Rate expression is empty" },
			],
		};
	}

	let text = rawText;

	// 1. Extract Operator if configured
	let operatorMatch: OperatorMatch | undefined;
	if (config.operatorConfig) {
		const opRes: ExtractedOperatorResult = extractOperator(
			text,
			config.operatorConfig,
		);
		if (opRes.operatorMatch) {
			if (policy.allowOperator === false) {
				return {
					diagnostics: [
						{
							code: "operator_not_allowed",
							message: `Operator '${opRes.operatorMatch.rawText}' is not permitted for this rate`,
						},
					],
				};
			}
			operatorMatch = opRes.operatorMatch;
			text = opRes.remainderText;
		}
	}

	// 2. Split into Numerator and Denominators using configured rateDelimiters
	const rateDelimiters = config.rateDelimiters ?? ["/"];
	const segments =
		rateDelimiters.length > 0
			? (splitByDelimiters(text, rateDelimiters)?.parts ?? [text])
			: [text];

	if (segments.length < 2) {
		return {
			diagnostics: [
				{
					code: "not_a_rate",
					message: `Expression '${rawText}' does not contain rate division delimiters`,
				},
			],
		};
	}

	if (
		policy.maxDenominators !== undefined &&
		segments.length - 1 > policy.maxDenominators
	) {
		return {
			diagnostics: [
				{
					code: "too_many_denominators",
					message: `Rate has ${segments.length - 1} denominators, maximum allowed is ${policy.maxDenominators}`,
				},
			],
		};
	}

	// 3. Parse Numerator (try currency first, then quantity)
	const numSegment = segments[0]?.trim();
	if (!numSegment) {
		return {
			diagnostics: [
				{ code: "invalid_numerator", message: "Rate numerator is empty" },
			],
		};
	}

	let numerator: CompoundRateNumerator | undefined;

	// Try currency
	const curRes = parseCurrency(numSegment, config.currencyConfig ?? {});
	if (curRes.value) {
		numerator = { type: "currency", currency: curRes.value };
	} else {
		// Try quantity
		const qtyRes = parseQuantity(
			numSegment,
			config.quantityConfig ?? {},
			policy.quantityPolicy ?? { allowRange: false },
		);
		if (qtyRes.value) {
			numerator = {
				type: "quantity",
				quantity: qtyRes.value.primaryQuantity,
			};
		}
	}

	if (!numerator) {
		return {
			diagnostics: [
				{
					code: "invalid_numerator",
					message: `Unable to parse rate numerator '${numSegment}' as quantity or currency`,
				},
			],
		};
	}

	// 4. Parse Denominator Segments (e.g. "kg", "day", "2 hours", "hr")
	const denominators: CompoundRateDenominator[] = [];
	for (let i = 1; i < segments.length; i++) {
		const denSeg = segments[i]?.trim();
		if (!denSeg) {
			return {
				diagnostics: [
					{
						code: "invalid_denominator",
						message: `Rate denominator segment ${i} is empty`,
					},
				],
			};
		}

		// Try parsing denominator as a quantity first (handles "2 hours", "2hr", "2小时", "2,5 hr")
		let magnitude = 1;
		let unitStr = denSeg;

		const denQty = parseQuantity(denSeg, config.quantityConfig ?? {}, {
			allowRange: false,
		});

		if (denQty.value) {
			magnitude = denQty.value.primaryQuantity.magnitude;
			unitStr = denQty.value.primaryQuantity.unit;
		} else {
			const resolved = resolveUnitAlias(
				denSeg,
				config.quantityConfig?.unitAliases,
				config.locales,
			);
			unitStr = resolved?.canonicalUnit ?? denSeg;
		}

		denominators.push({
			unit: unitStr,
			magnitude,
			quantity: {
				magnitude,
				unit: unitStr,
				rawText: denSeg,
			},
			rawText: denSeg,
		});
	}

	const rateValue: CompoundRateValue = {
		kind: "rate",
		numerator,
		denominators,
		...(operatorMatch ? { operator: operatorMatch } : {}),
		rawText,
	};

	return {
		value: rateValue,
		diagnostics: [],
	};
}
