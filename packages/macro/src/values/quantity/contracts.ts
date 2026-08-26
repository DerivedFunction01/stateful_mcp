import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { QuantityDimension, UnitId } from "../conversion/contracts";
import type { QuantityConversionRegistry } from "../conversion/conversion-registry";
import type { FundamentalGroup, RangeComponent } from "../fundamentals";
import type { BaseValueGrammarConfig, NumericParseOptions } from "../numeric";
import type { OperatorConfig, OperatorMatch } from "../operators";
import type { ValueRecipe } from "../recipes";
import type {
	StatisticalConfig,
	StatisticalConsumerPolicy,
	StatisticalQualifier,
} from "../statistics";
import type { QuantityToken, ValueFormatConfig } from "../token-spec";

export interface ConceptCountDetails {
	readonly conceptTerm: string;
	readonly conceptId?: string;
	readonly packagingUnit?: string;
	readonly fillerConnector?: string;
	readonly standardCode?: string;
	readonly metadata?: Record<string, unknown>;
}
export interface SingleQuantity {
	readonly magnitude: number;
	readonly unit: string;
	readonly canonicalUnit?: UnitId;
	readonly canonicalMagnitude?: number;
	readonly conceptDetails?: ConceptCountDetails;
	readonly rawText: string;
}
export type RangeDirection = "ascending" | "descending" | "equal";
export interface QuantityRange {
	readonly start: SingleQuantity;
	readonly end: SingleQuantity;
	readonly direction: RangeDirection;
	readonly isHeterogeneousUnits?: boolean;
	readonly chainedSteps?: readonly SingleQuantity[];
	readonly rawText: string;
}
export interface QuantityGrammarResult {
	readonly primaryQuantity: SingleQuantity;
	readonly range?: QuantityRange;
	readonly operator?: OperatorMatch;
	readonly statisticalQualifier?: StatisticalQualifier;
	readonly rawText: string;
}
export interface ConceptResolution {
	readonly conceptId: string;
	readonly canonicalTerm?: string;
	readonly packagingUnit?: string;
	readonly standardCode?: string;
	readonly metadata?: Record<string, unknown>;
}
export type ConceptResolver = (
	term: string,
	context?: {
		readonly packagingUnit?: string;
		readonly locales?: string | readonly string[];
	},
) => Promise<ConceptResolution | undefined> | ConceptResolution | undefined;
export interface QuantityGrammarConfig
	extends NumericParseOptions,
		BaseValueGrammarConfig {
	readonly templates?: readonly (ValueFormatConfig<QuantityToken> | string)[];
	readonly unitAliases?: Readonly<Record<string, readonly string[]>>;
	readonly packagingClassifiers?:
		| Readonly<Record<string, readonly string[]>>
		| readonly string[];
	readonly fillerConnectors?: readonly string[];
	readonly conceptResolver?: ConceptResolver;
	readonly rangeComponents?: readonly RangeComponent[];
	readonly operatorConfig?: OperatorConfig;
	readonly statisticalConfig?: StatisticalConfig;
	readonly conversionRegistry?: QuantityConversionRegistry;
	readonly locales?: string | readonly string[];
	readonly fundamentalGroups?: readonly FundamentalGroup[];
}
export interface AuthoredQuantityTemplateCompilation {
	readonly fundamentals: readonly FundamentalGroup[];
	readonly recipes: readonly ValueRecipe[];
}
export interface QuantityConsumerPolicy {
	readonly allowedUnits?: readonly string[];
	readonly allowedDimensions?: readonly QuantityDimension[];
	readonly allowedNamespaces?: readonly string[];
	readonly allowRange?: boolean;
	readonly allowDirectionalRange?: boolean;
	readonly allowChainedSteps?: boolean;
	readonly allowHeterogeneousUnits?: boolean;
	readonly allowOperator?: boolean;
	readonly statisticsPolicy?: StatisticalConsumerPolicy;
	readonly allowDataPointCount?: boolean;
}
export type QuantityStatisticsPolicy =
	| "accept"
	| "reject"
	| StatisticalConsumerPolicy;
export interface QuantityDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}
export interface QuantityGrammarResolution {
	readonly value?: QuantityGrammarResult;
	readonly diagnostics: readonly QuantityDiagnostic[];
}
