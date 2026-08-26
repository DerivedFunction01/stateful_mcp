import type { NumericFormatOptions } from "./contracts";

/** Format a finite number using separators and precision. */
export function formatNumericValue(
	value: number,
	options: NumericFormatOptions = {},
): string {
	if (!Number.isFinite(value)) return String(value);
	const decimalPoint = options.decimalPoint ?? ".";
	const isNegative = value < 0 || Object.is(value, -0);
	const absolute = Math.abs(value);
	const numeric =
		options.decimalDigits === undefined
			? String(absolute)
			: absolute.toFixed(Math.max(0, options.decimalDigits));
	let [integer = "0", fraction] = numeric.split(".");
	if (!options.exact && fraction) fraction = fraction.replace(/0+$/u, "");
	if (options.thousandsSeparator) {
		integer = integer.replace(
			/\B(?=(\d{3})+(?!\d))/gu,
			options.thousandsSeparator,
		);
	}
	const body = fraction ? `${integer}${decimalPoint}${fraction}` : integer;
	let formatted = isNegative ? `-${body}` : body;
	if (isNegative && options.negativeStyle === "parens") formatted = `(${body})`;
	if (isNegative && options.negativeStyle === "both") formatted = `(-${body})`;
	const symbol = options.currencySymbols?.[0];
	if (symbol) {
		formatted =
			options.currencyPosition === "suffix"
				? `${formatted} ${symbol}`
				: `${symbol}${formatted}`;
	}
	return formatted;
}
