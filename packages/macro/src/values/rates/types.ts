import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { CurrencyFormatConfig, CurrencyGrammarResult } from "../currency";
import type { BaseValueGrammarConfig } from "../numeric";
import type { OperatorConfig, OperatorMatch } from "../operators";
import type {
	QuantityConsumerPolicy,
	QuantityGrammarConfig,
	SingleQuantity,
} from "../quantity";
import type { RateToken, ValueFormatConfig } from "../token-spec";

export interface CompoundRateDenominator {
	readonly unit: string;
	readonly magnitude: number;
	readonly quantity?: SingleQuantity;
	readonly rawText: string;
}

export type CompoundRateNumerator =
	| { readonly type: "quantity"; readonly quantity: SingleQuantity }
	| { readonly type: "currency"; readonly currency: CurrencyGrammarResult };

export interface CompoundRateValue {
	readonly kind: "rate";
	readonly numerator: CompoundRateNumerator;
	readonly denominators: readonly CompoundRateDenominator[];
	readonly operator?: OperatorMatch;
	readonly rawText: string;
}

export interface CompoundRateConfig extends BaseValueGrammarConfig {
	readonly templates?: readonly (ValueFormatConfig<RateToken> | string)[];
	readonly quantityConfig?: QuantityGrammarConfig;
	readonly currencyConfig?: CurrencyFormatConfig;
	readonly operatorConfig?: OperatorConfig;
	/** Rate division delimiters (e.g. ["/", "per", "por", "pro", "je", "每"]) */
	readonly rateDelimiters?: readonly string[];
	readonly locales?: string | readonly string[];
}

export interface CompoundRateConsumerPolicy {
	readonly allowOperator?: boolean;
	readonly maxDenominators?: number;
	readonly quantityPolicy?: QuantityConsumerPolicy;
}

export interface CompoundRateDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface CompoundRateResolution {
	readonly value?: CompoundRateValue;
	readonly diagnostics: readonly CompoundRateDiagnostic[];
}
