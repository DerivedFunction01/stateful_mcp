import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { BaseValueGrammarConfig } from "../numeric";
import type { CurrencyToken, ValueFormatConfig } from "../token-spec";

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
