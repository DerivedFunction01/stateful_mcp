import { parseNumericValue } from "../numeric";
import type { CurrencyDefinition, CurrencyFormatConfig } from "./types";

export function matchSymbolAndNumber(
	text: string,
	catalog: readonly CurrencyDefinition[],
	config: CurrencyFormatConfig,
	decimalSeparator: string,
): { amount: number; currency: string; symbol: string } | undefined {
	const candidates: Array<{ symbol: string; code: string }> = [];
	for (const def of catalog) {
		for (const s of def.symbols ?? [])
			candidates.push({ symbol: s, code: def.code });
		candidates.push({ symbol: def.code, code: def.code });
	}
	if (config.currencies)
		for (const [code, aliases] of Object.entries(config.currencies))
			for (const a of aliases) candidates.push({ symbol: a, code });
	candidates.sort((a, b) => b.symbol.length - a.symbol.length);
	const lower = text.toLocaleLowerCase();
	for (const { symbol, code } of candidates) {
		const symLower = symbol.toLocaleLowerCase();
		if (lower.startsWith(symLower)) {
			const parsed = parseNumber(
				text.slice(symbol.length).trim(),
				decimalSeparator,
				config.thousandsSeparator,
			);
			if (parsed !== undefined)
				return { amount: parsed, currency: code, symbol };
		}
		if (lower.endsWith(symLower)) {
			const parsed = parseNumber(
				text.slice(0, text.length - symbol.length).trim(),
				decimalSeparator,
				config.thousandsSeparator,
			);
			if (parsed !== undefined)
				return { amount: parsed, currency: code, symbol };
		}
	}
	if (config.defaultCurrency) {
		const parsed = parseNumber(
			text,
			decimalSeparator,
			config.thousandsSeparator,
		);
		if (parsed !== undefined) {
			const def = catalog.find((c) => c.code === config.defaultCurrency);
			return {
				amount: parsed,
				currency: config.defaultCurrency,
				symbol: def?.symbols?.[0] ?? config.defaultCurrency,
			};
		}
	}
	return undefined;
}

function parseNumber(
	text: string,
	decimalSep: string,
	thousandsSep?: string,
): number | undefined {
	return parseNumericValue(text, {
		decimalPoint: decimalSep,
		thousandsSeparator: thousandsSep,
	}).parsed?.value;
}
