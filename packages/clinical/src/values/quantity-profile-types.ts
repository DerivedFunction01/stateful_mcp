import type {
	MeasurementOperator,
	MeasurementUnitAnchor,
	ValueType,
} from "../schemas/schemas-interface/measurement";
import type { NumberWordConfig } from "./utils/number-word-normalizer";

export type TextDirection = "ltr" | "rtl" | "auto";
export type WordBoundaryPolicy = "unicode" | "ascii" | "none";
export type MeasurementWordBoundaryMode = "none" | "before" | "after" | "both";
export type UnitOrderMode = "suffix" | "prefix" | "flexible";
export type DistributiveUpperSymbolPolicy =
	| "prohibited"
	| "optional"
	| "required";

export interface DistributivePrefixConfig {
	symbol: string;
	symbolAliases?: readonly string[];
	prefixSeparator?: "none" | "colon" | "equals" | "flexible";
	upperBoundSymbolPolicy?: DistributiveUpperSymbolPolicy;
}

export interface QuantityOrderingConfig {
	unitOrder: UnitOrderMode;
	distributivePrefix?: DistributivePrefixConfig;
	rangePattern:
		| "distributive_suffix"
		| "repeat_suffix"
		| "distributive_prefix"
		| "repeat_prefix"
		| "flexible";
}

export interface CompoundUnitPattern {
	patternId: string;
	regexPattern: string;
	primaryUnit: string;
	secondaryUnit: string;
}

export interface QuantityGrammarProfile {
	profileId: string;
	label: string;
	version: number;
	direction?: TextDirection;
	wordBoundaryPolicy?: WordBoundaryPolicy;
	measurementWordBoundary?: MeasurementWordBoundaryMode;
	dimension?: MeasurementUnitAnchor;

	// Number formatting
	decimalSeparator: "." | ",";
	thousandsSeparator: "," | "." | " " | "none";
	numberWords?: NumberWordConfig;

	// Lexical atoms & aliases
	unitAliases: Record<string, string>;
	unitDisplayOverrides?: Record<string, string>;
	operatorAliases: Record<string, MeasurementOperator>;
	statisticalAliases?: Record<string, ValueType>;
	approximateAliases?: string[];
	rangeDelimiters: string[];

	// Structural ordering
	ordering: QuantityOrderingConfig;
	compoundPatterns?: readonly CompoundUnitPattern[];
}
