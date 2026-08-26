import type { CurrencyFormatConfig } from "../currency";
import { evaluateCurrencyGrammar } from "../currency";
import { parseNumericValue } from "../numeric";
import type { TerminalParser } from "../recipes";
import { result } from "./shared";
import type { BuiltinTerminalOptions } from "./types";

export function createCurrencyTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	return {
		currency: (_id, input, request) => {
			const parsed = evaluateCurrencyGrammar(
				input,
				(request?.grammar ?? grammar).currency ?? {},
			);
			return result(parsed.value, parsed.diagnostics);
		},
		"currency-marker": (_id, input, request) => {
			const config: CurrencyFormatConfig =
				(request?.grammar ?? grammar).currency ?? {};
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			for (const definition of config.definitions ?? []) {
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
			const parsed = parseNumericValue(input, config ?? {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
	};
}
