/**
 * @typedef {Object} NumericRegexOptions
 * @property {number} [integerDigits] Exact or maximum number of digits allowed before the decimal point
 * @property {number} [decimalDigits] Maximum number of digits allowed after the decimal point (default: undefined/infinite)
 * @property {string} [thousandsSeparator] Character used as the thousands separator (e.g., ',', ' ', '.')
 * @property {string} [decimalPoint] Character used as the decimal point (default: '.')
 * @property {boolean} [allowNegative] Whether the number can be negative (default: true)
 * @property {boolean} [exact] Whether the match must cover the entire string (^ and $) (default: false)
 * @property {number} [leadingMin] Minimum value for the optional leading digit range (e.g., 0)
 * @property {number} [leadingMax] Maximum value for the optional leading digit range (e.g., 1)
 * @property {string[]} [currencySymbols] List of accepted currency symbols/codes (e.g. ['$', '€', '£'], or ['USD', 'EUR']).
 * @property {'prefix'|'suffix'} [currencyPosition] Where the currency symbol sits relative to the number (default: 'prefix')
 * @property {'sign'|'parens'|'both'} [negativeStyle] How negative numbers may be notated when allowNegative is true:
 *   - 'sign': plain minus sign, e.g. -100, -$100, $-100 (default)
 *   - 'parens': accounting-style parentheses, e.g. (100), ($100), $(100)
 *   - 'both': accepts either style
 */

/**
 * Generates a regular expression for validating and matching formatted numeric strings,
 * with support for currency symbols and accounting-style (parenthesized) negatives.
 * @param {NumericRegexOptions} [options]
 * @returns {RegExp}
 */
function generateNumericRegex(options = {}) {
	// Apply smart heuristic defaults
	const resolvedOptions = {
		decimalDigits:
			options.integerDigits !== undefined && options.decimalDigits === undefined
				? 0
				: options.decimalDigits,
		allowNegative: !(
			options.integerDigits !== undefined && options.allowNegative === undefined
		),
		...options,
	};

	const {
		integerDigits,
		decimalDigits,
		thousandsSeparator,
		decimalPoint = ".",
		allowNegative,
		exact = false,
		leadingMin,
		leadingMax,
		currencySymbols,
		currencyPosition = "prefix",
		negativeStyle = "sign",
	} = resolvedOptions;

	const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedDecimal = escapeRegExp(decimalPoint);

	// -------------------------------------------------------------------------
	// Unsigned integer pattern
	// -------------------------------------------------------------------------
	let leadingPattern = "";
	if (leadingMin !== undefined && leadingMax !== undefined) {
		leadingPattern = `[${leadingMin}-${leadingMax}]?`;
	}

	let intPattern;
	if (integerDigits !== undefined) {
		if (thousandsSeparator) {
			intPattern = `${leadingPattern}\\d{1,${integerDigits}}`;
		} else {
			intPattern = `${leadingPattern}\\d{${integerDigits}}`;
		}
	} else {
		if (thousandsSeparator) {
			const escapedSep = escapeRegExp(thousandsSeparator);
			intPattern = `(?:\\d{1,3}(?:${escapedSep}\\d{3})+|${leadingPattern}\\d+)`;
		} else {
			intPattern = `${leadingPattern}\\d+`;
		}
	}

	// -------------------------------------------------------------------------
	// Decimal pattern & lookahead
	// -------------------------------------------------------------------------
	let decimalPattern = "";
	let decimalLookahead = "";
	if (decimalDigits === 0) {
		decimalPattern = "";
		if (exact) {
			decimalLookahead = `(?!${escapedDecimal})`;
		}
	} else if (decimalDigits !== undefined) {
		decimalPattern = `(?:${escapedDecimal}\\d{1,${decimalDigits}})?`;
		if (exact) {
			decimalLookahead = `(?!(?:.*${escapedDecimal}\\d{${decimalDigits + 1}}))`;
		}
	} else {
		decimalPattern = `(?:${escapedDecimal}\\d+)?`;
	}

	const numPattern = `${intPattern}${decimalPattern}`;

	// -------------------------------------------------------------------------
	// Currency handling (currencyRequired is fixed to false)
	// -------------------------------------------------------------------------
	const hasCurrency =
		Array.isArray(currencySymbols) && currencySymbols.length > 0;
	let curCore = "";
	if (hasCurrency) {
		const escapedSymbols = currencySymbols.map(escapeRegExp);
		curCore = `(?:${escapedSymbols.join("|")})`;
	}

	const curUnit = hasCurrency ? `${curCore}?` : "";
	const currencyIsPrefix = hasCurrency && currencyPosition === "prefix";
	const currencyIsSuffix = hasCurrency && currencyPosition === "suffix";

	const suffixCur = currencyIsSuffix ? curUnit : "";

	// -------------------------------------------------------------------------
	// Variant Construction (Sign-based vs Parenthesized)
	// -------------------------------------------------------------------------
	const variants = [];

	// 1. Sign-based / Positive prefixes (factored efficiently)
	let prefixPart = "";
	if (hasCurrency && currencyIsPrefix) {
		if (allowNegative) {
			const wantSign = negativeStyle === "sign" || negativeStyle === "both";
			if (wantSign) {
				prefixPart = `(?:-?${curUnit}|${curCore}-)?`;
			} else {
				prefixPart = curUnit;
			}
		} else {
			prefixPart = curUnit;
		}
	} else if (allowNegative) {
		prefixPart = "-?";
	}

	variants.push(`${prefixPart}${numPattern}${suffixCur}`);

	// 2. Parenthesized negative variants (if applicable)
	if (
		allowNegative &&
		(negativeStyle === "parens" || negativeStyle === "both")
	) {
		// Standard parens: (100), ($100), (100$)
		const innerCur = currencyIsPrefix ? curUnit : "";
		const innerSuffix = currencyIsSuffix ? curUnit : "";
		variants.push(`\\(${innerCur}${numPattern}${innerSuffix}\\)`);

		// Outside-currency parens: $(100) or (100)$
		if (currencyIsPrefix) {
			variants.push(`${curCore}?\\(${numPattern}\\)`);
		}
		if (currencyIsSuffix) {
			variants.push(`\\(${numPattern}\\)${curCore}?`);
		}
	}

	const uniqueVariants = Array.from(new Set(variants));
	const corePattern =
		uniqueVariants.length > 1
			? `(?:${uniqueVariants.join("|")})`
			: uniqueVariants[0];
	const finalPattern = exact
		? `^${corePattern}${decimalLookahead}$`
		: corePattern;

	return new RegExp(finalPattern, "g");
}

module.exports = { generateNumericRegex };
