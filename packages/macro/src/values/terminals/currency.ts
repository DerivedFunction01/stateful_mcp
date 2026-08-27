import {
	type CurrencyFormatConfig,
	createCurrencyOutputBuilders,
	STANDARD_CURRENCY_CATALOG,
} from "../currency";
import { parseNumericValue } from "../numeric";
import { parseValueRecipes, type TerminalParser } from "../recipes";
import { result } from "./shared";
import type { BuiltinTerminalOptions } from "./types";

export function createCurrencyTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	const terminals: Record<string, TerminalParser> = {
		currency: (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const currencyRecipes = (activeGrammar.recipes?.recipes ?? []).filter(
				(recipe) => recipe.id.startsWith("currency.template."),
			);
			const config = activeGrammar.currency ?? {};
			const parsed = parseValueRecipes(
				input,
				currencyRecipes,
				{ enabledRecipes: currencyRecipes.map((recipe) => recipe.id) },
				(consumerId, value, nestedRequest) => {
					const parser = terminals[consumerId];
					return parser
						? parser(consumerId, value, {
								...nestedRequest,
								consumerId,
								input: value,
								grammar: activeGrammar,
								policy: request?.policy,
							})
						: { valid: false };
				},
				createCurrencyOutputBuilders(config),
				{ grammar: activeGrammar, policy: request?.policy },
			);
			const selected = parsed.selected;
			return selected
				? {
						valid: true,
						value: selected.canonicalValue,
						canonicalValue: selected.canonicalValue,
						displayValue: selected.displayValue,
					}
				: { valid: false, stable: true };
		},
		"currency-marker": (_id, input, request) => {
			const config: CurrencyFormatConfig =
				(request?.grammar ?? grammar).currency ?? {};
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			for (const definition of config.definitions ??
				STANDARD_CURRENCY_CATALOG) {
				if (
					definition.code.toLocaleLowerCase(config.locales as string) ===
					normalized
				) {
					return {
						valid: true,
						value: {
							code: definition.code,
							symbol: definition.symbols?.[0] ?? definition.code,
						},
						canonicalValue: {
							code: definition.code,
							symbol: definition.symbols?.[0] ?? definition.code,
						},
						stable: true,
					};
				}
				for (const symbol of definition.symbols ?? []) {
					if (
						symbol.toLocaleLowerCase(config.locales as string) === normalized
					) {
						return {
							valid: true,
							value: { code: definition.code, symbol },
							canonicalValue: { code: definition.code, symbol },
							stable: true,
						};
					}
				}
			}
			for (const [code, aliases] of Object.entries(config.currencies ?? {})) {
				if (code.toLocaleLowerCase(config.locales as string) === normalized) {
					return {
						valid: true,
						value: { code, symbol: aliases[0] ?? code },
						canonicalValue: { code, symbol: aliases[0] ?? code },
						stable: true,
					};
				}
				for (const alias of aliases) {
					if (
						alias.toLocaleLowerCase(config.locales as string) === normalized
					) {
						return {
							valid: true,
							value: { code, symbol: alias },
							canonicalValue: { code, symbol: alias },
							stable: true,
						};
					}
				}
			}
			return { valid: false, stable: true };
		},
		"currency-amount": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).currency;
			const parsed = parseNumericValue(input, {
				...(config?.numericConfig ?? {}),
				...(config ?? {}),
			});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"rate-delimiter": (_id, input, request) => {
			const delimiters =
				(request?.grammar ?? grammar).rates?.rateDelimiters ?? [];
			return delimiters.some(
				(delimiter) =>
					delimiter.toLocaleLowerCase() === input.trim().toLocaleLowerCase(),
			)
				? result(input.trim(), [])
				: { valid: false, stable: true };
		},
	};
	return terminals;
}
