import { escapeRegex } from "../regex";
import type { CurrencyDefinition, CurrencyFormatConfig } from "./types";

export function parseDenominationChain(
	text: string,
	catalog: readonly CurrencyDefinition[],
	config: CurrencyFormatConfig,
): { amount: number; currency: string; symbol?: string } | undefined {
	const activeCatalog = config.definitions ?? catalog;
	const dec = config.decimalSeparator === "," ? "," : "\\.";
	const connectors = (config.chainDelimiters ?? []).map(escapeRegex);
	const connectorPrefix = connectors.length
		? `(?:^|\\s+|(?:${connectors.join("|")})\\s*)`
		: `(?:^|\\s+)`;
	const segmentRegex = new RegExp(
		`${connectorPrefix}([+-]?\\d+(?:${dec}\\d+)?)\\s*([\\p{L}\\p{Sc}\\p{N}_]+)`,
		"gu",
	);
	const matches = Array.from(text.matchAll(segmentRegex));
	if (matches.length === 0) return undefined;
	let detectedCurrency: string | undefined;
	let totalAmount = 0;
	for (const match of matches) {
		const valueStr = match[1]!;
		const rawUnit = match[2]!;
		const value = Number(
			config.decimalSeparator === "," ? valueStr.replace(",", ".") : valueStr,
		);
		if (!Number.isFinite(value)) return undefined;
		let matched = false;
		for (const def of activeCatalog) {
			for (const denom of def.denominations ?? []) {
				if (
					denom.aliases.some(
						(a) => a.toLocaleLowerCase() === rawUnit.toLocaleLowerCase(),
					)
				) {
					if (detectedCurrency && detectedCurrency !== def.code)
						return undefined;
					detectedCurrency = def.code;
					totalAmount += value * denom.factor;
					matched = true;
					break;
				}
			}
			if (matched) break;
		}
		if (!matched) return undefined;
	}
	if (!detectedCurrency) return undefined;
	const def = activeCatalog.find((c) => c.code === detectedCurrency);
	return {
		amount: Math.round(totalAmount * 1e6) / 1e6,
		currency: detectedCurrency,
		symbol: def?.symbols?.[0],
	};
}
