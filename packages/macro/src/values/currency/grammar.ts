import { EMPTY_DIAGNOSTICS } from "../numeric";
import { STANDARD_CURRENCY_CATALOG } from "./catalog";
import { parseDenominationChain } from "./denominations";
import { matchSymbolAndNumber } from "./matching";
import type {
	CurrencyConsumerPolicy,
	CurrencyFormatConfig,
	CurrencyGrammarResult,
	CurrencyResolution,
} from "./types";
import { toSubunits } from "./value";

export function evaluateCurrencyGrammar(
	input: string,
	config: CurrencyFormatConfig = {},
	policy: CurrencyConsumerPolicy = {},
): CurrencyResolution {
	const rawText = input.trim();
	if (!rawText)
		return {
			diagnostics: [
				{ code: "EMPTY_CURRENCY", messageKey: "errors.currencyEmpty" },
			],
		};

	const catalog = config.definitions ?? STANDARD_CURRENCY_CATALOG;
	const decimal = config.decimalSeparator ?? ".";
	const denominationResult = parseDenominationChain(rawText, catalog, config);
	if (denominationResult) {
		const { amount, currency, symbol } = denominationResult;
		if (
			policy.allowedCurrencies &&
			!policy.allowedCurrencies.includes(currency)
		)
			return {
				diagnostics: [
					{
						code: "CURRENCY_NOT_ALLOWED",
						messageKey: "errors.currencyNotAllowed",
						messageParams: { currency },
					},
				],
			};
		if (policy.allowNegative === false && amount < 0)
			return {
				diagnostics: [
					{
						code: "NEGATIVE_NOT_ALLOWED",
						messageKey: "errors.currencyNegativeNotAllowed",
					},
				],
			};
		const decimals = catalog.find((c) => c.code === currency)?.decimals ?? 2;
		return {
			value: {
				amount,
				currency,
				subunits: toSubunits(amount, decimals),
				symbol,
				rawText,
			},
			diagnostics: EMPTY_DIAGNOSTICS,
		};
	}

	const isParenthesized = /^\s*\((.*)\)\s*$/u.test(rawText);
	const unwrapped = isParenthesized
		? rawText.replace(/^\s*\(|\)\s*$/gu, "").trim()
		: rawText;
	const isNegativeSign = /^\s*-\s*/u.test(unwrapped);
	const textWithoutSign = unwrapped.replace(/^\s*-\s*/u, "").trim();
	const isNegative = isParenthesized || isNegativeSign;
	const symbolMatch = matchSymbolAndNumber(
		textWithoutSign,
		catalog,
		config,
		decimal,
	);
	if (!symbolMatch)
		return {
			diagnostics: [
				{
					code: "INVALID_CURRENCY",
					messageKey: "errors.currencyParseFailed",
					messageParams: { rawText },
				},
			],
		};

	const finalAmount = isNegative ? -symbolMatch.amount : symbolMatch.amount;
	const currency = symbolMatch.currency;
	if (policy.allowedCurrencies && !policy.allowedCurrencies.includes(currency))
		return {
			diagnostics: [
				{
					code: "CURRENCY_NOT_ALLOWED",
					messageKey: "errors.currencyNotAllowed",
					messageParams: { currency },
				},
			],
		};
	if (policy.allowNegative === false && finalAmount < 0)
		return {
			diagnostics: [
				{
					code: "NEGATIVE_NOT_ALLOWED",
					messageKey: "errors.currencyNegativeNotAllowed",
				},
			],
		};
	const decimals = catalog.find((c) => c.code === currency)?.decimals ?? 2;
	const curVal: CurrencyGrammarResult = {
		amount: finalAmount,
		currency,
		subunits: toSubunits(finalAmount, decimals),
		symbol: symbolMatch.symbol,
		rawText,
	};
	return { value: curVal, diagnostics: EMPTY_DIAGNOSTICS };
}
