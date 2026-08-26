import { checkNumericBounds, parseNumericValue } from "../numeric";
import { resolveOperator } from "../operators";
import type { QuantityGrammarResult } from "../quantity";
import { evaluateQuantityGrammar, resolveUnitAlias } from "../quantity";
import type { TerminalParser } from "../recipes";
import { resolveStatisticalQualifier } from "../statistics";
import { diagnostics, result } from "./shared";
import type { BuiltinTerminalOptions } from "./types";

export function createQuantityTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	return {
		number: (_id, input, request) => {
			const parsed = parseNumericValue(
				input,
				(request?.grammar ?? grammar).quantity.numericConfig,
			);
			return result(parsed.parsed, parsed.diagnostics);
		},
		quantity: (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const parsed = evaluateQuantityGrammar(
				input,
				activeGrammar.quantity,
				request?.policy?.quantityConsumerPolicy ?? {},
			);
			if (
				parsed.value &&
				request?.policy?.bounds &&
				!checkNumericBounds(
					parsed.value.primaryQuantity.magnitude,
					request.policy.bounds,
				)
			) {
				return {
					valid: false,
					diagnostics: [
						{
							errorCode: "NUMERIC_BOUNDS",
							messageKey: "values.numeric.outOfBounds",
							messageParams: request.policy.path
								? { argumentId: request.policy.path }
								: undefined,
						},
					],
				};
			}
			return result(parsed.value, parsed.diagnostics);
		},
		"quantity-amount": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const parsed = parseNumericValue(input, config);
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"quantity-unit": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const resolved = resolveUnitAlias(
				input,
				config.unitAliases,
				config.locales,
			);
			return resolved
				? {
						valid: true,
						value: resolved.canonicalUnit,
						canonicalValue: resolved.canonicalUnit,
						displayValue: resolved.matchedAlias,
						metadata: { matchedAlias: resolved.matchedAlias },
					}
				: { valid: false, stable: true };
		},
		"quantity-packaging": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			if (Array.isArray(config.packagingClassifiers)) {
				return config.packagingClassifiers.some(
					(alias) =>
						alias.toLocaleLowerCase(config.locales as string) === normalized,
				)
					? result(input.trim(), [])
					: { valid: false, stable: true };
			}
			const entries = Object.entries(config.packagingClassifiers ?? {}) as [
				string,
				readonly string[],
			][];
			for (const [canonical, aliases] of entries) {
				if (
					canonical.toLocaleLowerCase(config.locales as string) ===
						normalized ||
					(typeof aliases !== "string" &&
						aliases.some(
							(alias) =>
								alias.toLocaleLowerCase(config.locales as string) ===
								normalized,
						))
				)
					return result(canonical, []);
			}
			return { valid: false, stable: true };
		},
		"quantity-filler": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			return config.fillerConnectors?.some(
				(alias) =>
					alias.toLocaleLowerCase(config.locales as string) === normalized,
			)
				? result(input.trim(), [])
				: { valid: false, stable: true };
		},
		unit: (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const resolved = resolveUnitAlias(
				input,
				activeGrammar.quantity.unitAliases,
				activeGrammar.quantity.locales,
			);
			return resolved
				? {
						valid: true,
						canonicalValue: resolved.canonicalUnit,
						displayValue: resolved.matchedAlias,
						metadata: { matchedAlias: resolved.matchedAlias },
						stable: true,
					}
				: { valid: false, stable: true };
		},
		operator: (_id, input, request) => {
			const operator = resolveOperator(
				input,
				(request?.grammar ?? grammar).quantity.operatorConfig ?? {},
			);
			return operator
				? {
						valid: true,
						canonicalValue: operator,
						displayValue: input.trim(),
						stable: true,
					}
				: { valid: false, stable: true };
		},
		statistic: (_id, input, request) => {
			const statistic = resolveStatisticalQualifier(
				input,
				(request?.grammar ?? grammar).quantity.statisticalConfig ?? {},
				request?.policy?.quantityConsumerPolicy?.statisticsPolicy,
			);
			return statistic.qualifier
				? {
						valid: true,
						canonicalValue: statistic.qualifier,
						displayValue: input.trim(),
						stable: true,
					}
				: {
						valid: false,
						diagnostics: diagnostics(statistic.diagnostics),
						stable: true,
					};
		},
		"rate-denominator": (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const parsed = evaluateQuantityGrammar(
				input,
				activeGrammar.quantity,
				request?.policy?.quantityConsumerPolicy ?? {},
			);
			if (parsed.value) {
				return {
					valid: true,
					value: parsed.value,
					canonicalValue: parsed.value,
					stable: true,
				};
			}
			const unit = resolveUnitAlias(input, activeGrammar.quantity.unitAliases);
			if (unit) {
				const fallback: QuantityGrammarResult = {
					primaryQuantity: {
						magnitude: 1,
						unit: unit.canonicalUnit,
						rawText: input.trim(),
					},
					rawText: input.trim(),
				};
				return {
					valid: true,
					value: fallback,
					canonicalValue: fallback,
					stable: true,
				};
			}
			return {
				valid: false,
				diagnostics: parsed.diagnostics.map((d) => ({
					errorCode: d.code,
					messageKey: d.messageKey ?? "values.terminal.invalid",
					messageParams: d.messageParams,
				})),
				stable: true,
			};
		},
	};
}
