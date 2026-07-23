import type { NumericFieldFormatOptions } from "../../store/interfaces";
import { getCompiledRegex } from "../_compiled-regex";

export type { NumericFieldFormatOptions };

function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveDecimalDigits(
	options: NumericFieldFormatOptions,
): number | undefined {
	if (options.decimalDigits !== undefined) return options.decimalDigits;
	if (options.integerDigits !== undefined) return 0;
	return undefined;
}

function resolveAllowNegative(options: NumericFieldFormatOptions): boolean {
	if (options.allowNegative !== undefined) return options.allowNegative;
	return options.integerDigits === undefined;
}

export function buildNumericPatternString(
	options: NumericFieldFormatOptions = {},
): string {
	const {
		integerDigits,
		thousandsSeparator,
		decimalPoint = ".",
		allowNegative,
		exact = false,
		leadingMin,
		leadingMax,
		currencySymbols,
		currencyPosition = "prefix",
		negativeStyle = "sign",
		groupName,
		wrap = true,
	} = options;

	const decimalDigits = resolveDecimalDigits(options);
	const resolvedAllowNegative = resolveAllowNegative(options);

	const escapedDecimal = escapeRegExp(decimalPoint);

	let leadingPattern = "";
	if (leadingMin !== undefined && leadingMax !== undefined) {
		leadingPattern = `[${leadingMin}-${leadingMax}]?`;
	}

	let intPattern: string;
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

	const variants: string[] = [];

	let prefixPart = "";
	if (hasCurrency && currencyIsPrefix) {
		if (resolvedAllowNegative) {
			const wantSign = negativeStyle === "sign" || negativeStyle === "both";
			if (wantSign) {
				prefixPart = `(?:-?${curUnit}|${curCore}-)?`;
			} else {
				prefixPart = curUnit;
			}
		} else {
			prefixPart = curUnit;
		}
	} else if (resolvedAllowNegative) {
		prefixPart = "-?";
	}

	variants.push(`${prefixPart}${numPattern}${suffixCur}`);

	if (
		resolvedAllowNegative &&
		(negativeStyle === "parens" || negativeStyle === "both")
	) {
		const innerCur = currencyIsPrefix ? curUnit : "";
		const innerSuffix = currencyIsSuffix ? curUnit : "";
		variants.push(`\\(${innerCur}${numPattern}${innerSuffix}\\)`);

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

	if (!wrap) return finalPattern || "";
	if (groupName) return `(?<${groupName}>${finalPattern})`;
	return finalPattern || "";
}

export function compileNumericRegex(pattern: string, flags = "gi"): RegExp {
	return getCompiledRegex(pattern, flags);
}
