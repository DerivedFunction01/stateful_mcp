import type { CurrencyValue, ValueEvidence } from "../../contracts/values";

export function toSubunits(amount: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(amount * factor);
}

export function createCurrencyValue(
	amount: number,
	currency: string,
	options: {
		symbol?: string;
		decimals?: number;
		rawText?: string;
		evidence?: ValueEvidence[];
	} = {},
): CurrencyValue {
	const decimals = options.decimals ?? 2;
	return {
		kind: "currency",
		amount,
		currency,
		subunits: toSubunits(amount, decimals),
		symbol: options.symbol,
		rawText: options.rawText,
		formatted: options.symbol
			? `${options.symbol}${amount.toFixed(decimals)}`
			: `${amount.toFixed(decimals)} ${currency}`,
		evidence: options.evidence,
	};
}
