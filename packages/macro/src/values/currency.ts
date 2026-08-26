import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { CurrencyValue, ValueEvidence } from "../contracts/values";
import {
	EMPTY_DIAGNOSTICS,
	formatNumericValue,
	parseNumericValue,
} from "./numeric";
import { escapeRegex } from "./regex";

export interface CurrencyDenomination {
	readonly id: string;
	readonly factor: number;
	readonly aliases: readonly string[];
}

export interface CurrencyDefinition {
	readonly code: string;
	readonly decimals?: number;
	readonly symbols?: readonly string[];
	readonly denominations?: readonly CurrencyDenomination[];
}

import type { BaseValueGrammarConfig } from "./numeric";
import type { CurrencyToken, ValueFormatConfig } from "./token-spec";

export interface CurrencyFormatConfig extends BaseValueGrammarConfig {
	/** Format templates for currency e.g. ["SYM AMOUNT", "AMOUNT SYM", "CODE AMOUNT"] */
	readonly templates?: readonly (ValueFormatConfig<CurrencyToken> | string)[];
	readonly defaultCurrency?: string;
	readonly currencies?: Readonly<Record<string, readonly string[]>>;
	readonly definitions?: readonly CurrencyDefinition[];
	readonly chainDelimiters?: readonly string[];
	readonly position?: "prefix" | "suffix" | "both";
	readonly negativeStyle?: "sign" | "parens" | "both";
	readonly thousandsSeparator?: string;
	readonly decimalSeparator?: "." | ",";
	readonly allowSpace?: boolean;
}

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

export interface CurrencyConsumerPolicy {
	readonly allowedCurrencies?: readonly string[];
	readonly allowNegative?: boolean;
}

export interface CurrencyGrammarResult {
	amount: number;
	currency: string;
	subunits?: number;
	symbol?: string;
	rawText: string;
}

export interface CurrencyDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface CurrencyResolution {
	value?: CurrencyGrammarResult;
	readonly diagnostics: readonly CurrencyDiagnostic[];
}

export const STANDARD_CURRENCY_CATALOG: readonly CurrencyDefinition[] = [
	{ code: "USD", decimals: 2 },
	{ code: "EUR", decimals: 2 },
	{ code: "GBP", decimals: 2 },
	{ code: "JPY", decimals: 0 },
	{ code: "CNY", decimals: 2 },
	{ code: "CAD", decimals: 2 },
	{ code: "AUD", decimals: 2 },
	{ code: "CHF", decimals: 2 },
	{ code: "INR", decimals: 2 },
	{ code: "RUB", decimals: 2 },
	{ code: "BRL", decimals: 2 },
	{ code: "KRW", decimals: 0 },
	{ code: "MXN", decimals: 2 },
	{ code: "SEK", decimals: 2 },
	{ code: "NZD", decimals: 2 },
	{ code: "SGD", decimals: 2 },
	{ code: "HKD", decimals: 2 },
	{ code: "NOK", decimals: 2 },
	{ code: "TRY", decimals: 2 },
	{ code: "ZAR", decimals: 2 },
	{ code: "SAR", decimals: 2 },
	{ code: "AED", decimals: 2 },
];

export function toSubunits(amount: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(amount * factor);
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
	if (allSymbols.size === 0) {
		return { pattern: "", groupNames: [] };
	}

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
	if (neg === "parens") {
		fullPattern = `(?:\\(\\s*${body}\\s*\\)|${body})`;
	} else if (neg === "both") {
		fullPattern = `(?:(?<negative_parens>\\(\\s*${body}\\s*\\))|(?<negative_sign>-\\s*)?${body})`;
	} else {
		fullPattern = `(?<negative_sign>-\\s*)?${body}`;
	}

	return {
		pattern: `(?<![\\p{L}\\p{N}])${fullPattern}(?![\\p{L}\\p{N}])`,
		groupNames: ["currency", "amount", "negative_parens", "negative_sign"],
	};
}

export function evaluateCurrencyGrammar(
	input: string,
	config: CurrencyFormatConfig = {},
	policy: CurrencyConsumerPolicy = {},
): CurrencyResolution {
	const rawText = input.trim();
	if (!rawText)
		return {
			diagnostics: [
				{
					code: "EMPTY_CURRENCY",
					messageKey: "errors.currencyEmpty",
				},
			],
		};

	const catalog = config.definitions ?? STANDARD_CURRENCY_CATALOG;
	const decimal = config.decimalSeparator ?? ".";

	// 1. Try compound denomination matching: e.g. "3 dollars 25 cents" / "3 dollars and 25 cents"
	const denominationResult = parseDenominationChain(rawText, catalog, config);
	if (denominationResult) {
		const { amount, currency, symbol } = denominationResult;
		if (
			policy.allowedCurrencies &&
			!policy.allowedCurrencies.includes(currency)
		) {
			return {
				diagnostics: [
					{
						code: "CURRENCY_NOT_ALLOWED",
						messageKey: "errors.currencyNotAllowed",
						messageParams: { currency },
					},
				],
			};
		}
		if (policy.allowNegative === false && amount < 0) {
			return {
				diagnostics: [
					{
						code: "NEGATIVE_NOT_ALLOWED",
						messageKey: "errors.currencyNegativeNotAllowed",
					},
				],
			};
		}
		const def = catalog.find((c) => c.code === currency);
		const decimals = def?.decimals ?? 2;
		const curVal: CurrencyGrammarResult = {
			amount,
			currency,
			subunits: toSubunits(amount, decimals),
			symbol,
			rawText,
		};
		return {
			value: curVal,
			diagnostics: EMPTY_DIAGNOSTICS,
		};
	}

	// 2. Symbolic / formatted parsing: e.g. "$450.00", "€1,200.50", "($50.00)", "-$50"
	const isParenthesized = /^\s*\((.*)\)\s*$/u.test(rawText);
	const unwrapped = isParenthesized
		? rawText.replace(/^\s*\(|\)\s*$/gu, "").trim()
		: rawText;

	const isNegativeSign = /^\s*-\s*/u.test(unwrapped);
	const textWithoutSign = unwrapped.replace(/^\s*-\s*/u, "").trim();

	const isNegative = isParenthesized || isNegativeSign;

	// Resolve currency symbol and amount
	const symbolMatch = matchSymbolAndNumber(
		textWithoutSign,
		catalog,
		config,
		decimal,
	);
	if (!symbolMatch) {
		return {
			diagnostics: [
				{
					code: "INVALID_CURRENCY",
					messageKey: "errors.currencyParseFailed",
					messageParams: { rawText },
				},
			],
		};
	}

	const rawAmount = symbolMatch.amount;
	const finalAmount = isNegative ? -rawAmount : rawAmount;
	const currency = symbolMatch.currency;

	if (
		policy.allowedCurrencies &&
		!policy.allowedCurrencies.includes(currency)
	) {
		return {
			diagnostics: [
				{
					code: "CURRENCY_NOT_ALLOWED",
					messageKey: "errors.currencyNotAllowed",
					messageParams: { currency },
				},
			],
		};
	}

	if (policy.allowNegative === false && finalAmount < 0) {
		return {
			diagnostics: [
				{
					code: "NEGATIVE_NOT_ALLOWED",
					messageKey: "errors.currencyNegativeNotAllowed",
				},
			],
		};
	}

	const def = catalog.find((c) => c.code === currency);
	const decimals = def?.decimals ?? 2;

	const curVal: CurrencyGrammarResult = {
		amount: finalAmount,
		currency,
		subunits: toSubunits(finalAmount, decimals),
		symbol: symbolMatch.symbol,
		rawText,
	};

	return {
		value: curVal,
		diagnostics: EMPTY_DIAGNOSTICS,
	};
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

function matchSymbolAndNumber(
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
	if (config.currencies) {
		for (const [code, aliases] of Object.entries(config.currencies)) {
			for (const a of aliases) candidates.push({ symbol: a, code });
		}
	}
	candidates.sort((a, b) => b.symbol.length - a.symbol.length);

	const lower = text.toLocaleLowerCase();
	for (const { symbol, code } of candidates) {
		const symLower = symbol.toLocaleLowerCase();
		// Prefix match: "$ 100" or "$100"
		if (lower.startsWith(symLower)) {
			const remainder = text.slice(symbol.length).trim();
			const parsed = parseNumber(
				remainder,
				decimalSeparator,
				config.thousandsSeparator,
			);
			if (parsed !== undefined)
				return { amount: parsed, currency: code, symbol };
		}
		// Suffix match: "100 €" or "100€"
		if (lower.endsWith(symLower)) {
			const remainder = text.slice(0, text.length - symbol.length).trim();
			const parsed = parseNumber(
				remainder,
				decimalSeparator,
				config.thousandsSeparator,
			);
			if (parsed !== undefined)
				return { amount: parsed, currency: code, symbol };
		}
	}

	// Default fallback currency if no symbol matches and pure number is supplied
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
	const res = parseNumericValue(text, {
		decimalPoint: decimalSep,
		thousandsSeparator: thousandsSep,
	});
	return res.parsed?.value;
}

function parseDenominationChain(
	text: string,
	catalog: readonly CurrencyDefinition[],
	config: CurrencyFormatConfig,
): { amount: number; currency: string; symbol?: string } | undefined {
	const activeCatalog = config.definitions ?? catalog;

	// Build dynamic segment pattern using configured chain connectors and decimal separator
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
		const normalizedValueStr =
			config.decimalSeparator === "," ? valueStr.replace(",", ".") : valueStr;
		const value = Number(normalizedValueStr);
		if (!Number.isFinite(value)) return undefined;

		let matched = false;
		for (const def of activeCatalog) {
			for (const denom of def.denominations ?? []) {
				if (
					denom.aliases.some(
						(a) => a.toLocaleLowerCase() === rawUnit.toLocaleLowerCase(),
					)
				) {
					if (detectedCurrency && detectedCurrency !== def.code) {
						return undefined; // Mixed currency mismatch
					}
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
