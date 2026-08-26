import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { NumericBounds } from "../../contracts/values";

export interface ParsedNumber {
	readonly value: number;
	readonly sign: 1 | -1;
	readonly integerPart?: number;
	readonly fraction?: {
		readonly numerator: number;
		readonly denominator: number;
	};
	readonly exponent?: number;
	readonly rawText: string;
	readonly kind:
		| "integer"
		| "decimal"
		| "fraction"
		| "mixed_fraction"
		| "scientific";
}

export const NUMERIC_FORMS = [
	"integer",
	"decimal",
	"fraction",
	"mixed_fraction",
	"scientific",
] as const;
export type NumericForm = (typeof NUMERIC_FORMS)[number];

export interface FractionConstraints {
	readonly allowImproper?: boolean;
	readonly denominator?: {
		readonly exact?: number;
		readonly min?: number;
		readonly max?: number;
	};
}

export interface NumericParseOptions {
	readonly decimalPoint?: string;
	readonly decimalSeparator?: string;
	readonly thousandsSeparator?: string;
	readonly allowFractions?: boolean;
	readonly allowMixedFractions?: boolean;
	readonly allowScientific?: boolean;
	readonly allowNegative?: boolean;
	readonly bounds?: NumericBounds;
	readonly locales?: string | readonly string[];
	/** When supplied, only these syntactic forms are recognized. */
	readonly allowedForms?: readonly NumericForm[];
	readonly fractionConstraints?: FractionConstraints;
}

export interface NumericDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export const EMPTY_DIAGNOSTICS: readonly any[] = Object.freeze([]);

export interface NumericParseResult {
	readonly parsed?: ParsedNumber;
	readonly diagnostics: readonly NumericDiagnostic[];
}

export interface BaseValueGrammarConfig {
	readonly numericConfig?: NumericParseOptions;
	readonly locales?: string | readonly string[];
}

export interface NumericFormatOptions {
	integerDigits?: number;
	decimalDigits?: number;
	thousandsSeparator?: string;
	decimalPoint?: string;
	decimalSeparator?: string;
	allowNegative?: boolean;
	allowFractions?: boolean;
	allowMixedFractions?: boolean;
	allowScientific?: boolean;
	exact?: boolean;
	leadingMin?: number;
	leadingMax?: number;
	currencySymbols?: readonly string[];
	currencyPosition?: "prefix" | "suffix";
	negativeStyle?: "sign" | "parens" | "both";
	groupName?: string;
	wrap?: boolean;
}
