import { formatNumericValue } from "../numeric";
import { escapeRegex } from "../regex";
import { STANDARD_CURRENCY_CATALOG } from "./catalog";
import type { CurrencyFormatConfig } from "./types";

export function formatCurrencyValue(
	amount: number,
	currency: string,
	config: CurrencyFormatConfig = {},
): string {
	const definition = (config.definitions ?? STANDARD_CURRENCY_CATALOG).find(
		(item) => item.code === currency,
	);
	const symbol =
		definition?.symbols?.[0] ?? config.currencies?.[currency]?.[0] ?? currency;
	return formatNumericValue(amount, {
		decimalDigits: definition?.decimals ?? 2,
		exact: true,
		decimalPoint: config.decimalSeparator,
		thousandsSeparator: config.thousandsSeparator,
		currencySymbols: [symbol],
		currencyPosition: config.position === "suffix" ? "suffix" : "prefix",
		negativeStyle: config.negativeStyle,
	});
}

export function buildCurrencyPatternString(config: CurrencyFormatConfig = {}): {
	pattern: string;
	groupNames: string[];
} {
	const allSymbols = new Set<string>();
	for (const def of config.definitions ?? STANDARD_CURRENCY_CATALOG) {
		for (const s of def.symbols ?? []) allSymbols.add(s);
	}
	if (config.currencies) {
		for (const [code, aliases] of Object.entries(config.currencies)) {
			allSymbols.add(code);
			for (const a of aliases) allSymbols.add(a);
		}
	}
	if (allSymbols.size === 0) return { pattern: "", groupNames: [] };

	const sortedSymbols = Array.from(allSymbols).sort(
		(a, b) => b.length - a.length,
	);
	const symbolPattern = `(?<currency>${sortedSymbols.map(escapeRegex).join("|")})`;
	const dec = config.decimalSeparator === "," ? "," : "\\.";
	const thousand = config.thousandsSeparator
		? escapeRegex(config.thousandsSeparator)
		: ",";
	const numPattern = `(?<amount>(?:\\d{1,3}(?:${thousand}\\d{3})+|\\d+)(?:${dec}\\d+)?)`;
	const prefixForm = `${symbolPattern}\\s*${numPattern}`;
	const suffixForm = `${numPattern}\\s*${symbolPattern}`;

	let body: string;
	const pos = config.position ?? "both";
	if (pos === "prefix") body = prefixForm;
	else if (pos === "suffix") body = suffixForm;
	else body = `(?:${prefixForm}|${suffixForm})`;

	const neg = config.negativeStyle ?? "both";
	let fullPattern: string;
	if (neg === "parens") fullPattern = `(?:\\(\\s*${body}\\s*\\)|${body})`;
	else if (neg === "both")
		fullPattern = `(?:(?<negative_parens>\\(\\s*${body}\\s*\\))|(?<negative_sign>-\\s*)?${body})`;
	else fullPattern = `(?<negative_sign>-\\s*)?${body}`;

	return {
		pattern: `(?<![\\p{L}\\p{N}])${fullPattern}(?![\\p{L}\\p{N}])`,
		groupNames: ["currency", "amount", "negative_parens", "negative_sign"],
	};
}
