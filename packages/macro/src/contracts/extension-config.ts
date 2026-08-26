import type { ErrorDescriptor } from "@stateful-mcp/macro-protocol";
import type { ConceptSeed, ExpressionSeed } from "../resources/contracts";
import type {
	AliasDefinition,
	AliasResolver,
	CompiledAliasRegistry,
} from "../values/aliases";
import type { MultiUnitCanonicalTarget } from "../values/compound";
import type {
	CurrencyConsumerPolicy,
	CurrencyFormatConfig,
} from "../values/currency";
import type {
	DateTimeFormatConfig,
	DateTimeFormatRegistry,
	RelativeDisambiguationPolicy,
	RelativeTemporalConfig,
	RelativeTemporalDefinition,
	RelativeTemporalSlot,
	TemporalModifierKind,
	TwoDigitYearCenturyConfig,
} from "../values/date-time";
import type {
	FrequencyConsumerPolicy,
	FrequencyGrammarConfig,
} from "../values/frequency";
import type {
	FundamentalCompileResult,
	FundamentalGroup,
} from "../values/fundamentals";
import type { NumericParseOptions } from "../values/numeric";
import type {
	QuantityConsumerPolicy,
	QuantityGrammarConfig,
	QuantityStatisticsPolicy,
} from "../values/quantity";
import type {
	CompoundRateConfig,
	CompoundRateConsumerPolicy,
} from "../values/rates";
import type { RecipeCompileResult, ValueRecipe } from "../values/recipes";
import type { MacroSyntax } from "./syntax";
import type { NumericBounds } from "./values";

export type WordBoundaryPolicy =
	| "standard"
	| "strict-whitespace"
	| "loose-substring"
	| "custom";

export type DigitNormalizationPolicy = "auto" | "ascii-only" | "custom";

export interface LocalizationPolicyConfig {
	readonly locale?: string;
	readonly boundaryPolicy?: WordBoundaryPolicy;
	readonly customBoundaryRegex?: {
		readonly before?: string;
		readonly after?: string;
	};
	readonly digitPolicy?: DigitNormalizationPolicy;
	readonly customDigitMap?: Readonly<Record<string, string>>;
	readonly quotePairs?: readonly (readonly [open: string, close: string])[];
	readonly groupBrackets?: readonly (readonly [open: string, close: string])[];
}

export interface NumberWordScale {
	readonly word: string;
	readonly value: number;
	readonly type: "minor" | "major";
}

export interface NumberWordConfig {
	readonly atoms: Readonly<Record<string, string>>;
	readonly scales: readonly NumberWordScale[];
	readonly conjunctions?: readonly string[];
	readonly useWordBoundaries?: boolean;
}

export interface OrdinalConfig {
	readonly ordinalAtoms?: Readonly<Record<string, string | readonly string[]>>;
	readonly suffix?: string;
	readonly prefix?: string;
	readonly applyToFinalOnly?: boolean;
}

export interface ExtendedNumberWordConfig extends NumberWordConfig {
	readonly ordinals?: OrdinalConfig;
}

export type {
	CurrencyFormatConfig,
	MultiUnitCanonicalTarget,
	QuantityStatisticsPolicy,
	RelativeDisambiguationPolicy,
	RelativeTemporalConfig,
	RelativeTemporalDefinition,
	RelativeTemporalSlot,
	TemporalModifierKind,
	TwoDigitYearCenturyConfig,
};

export interface UserMacroProfileValues {
	readonly numeric?: Partial<NumericParseOptions>;
	readonly dateTime?: Partial<DateTimeFormatRegistry>;
	readonly date?: Partial<DateTimeFormatConfig>;
	readonly relativeTemporal?: Partial<RelativeTemporalConfig>;
	readonly frequency?: Partial<FrequencyGrammarConfig>;
	readonly quantity?: Partial<QuantityGrammarConfig>;
	readonly currency?: Partial<CurrencyFormatConfig>;
	readonly rates?: Partial<CompoundRateConfig>;
	readonly [customDomain: string]: unknown;
}

export interface UserMacroProfile {
	readonly id?: string;
	readonly extends?: string;
	readonly syntax?: Partial<MacroSyntax>;
	readonly locale?: string;
	readonly localization?: LocalizationPolicyConfig;
	readonly numberWords?: ExtendedNumberWordConfig;
	readonly values?: UserMacroProfileValues;
	readonly excludePrefixes?: readonly string[];
	/** Master general spelling aliases (e.g. British vs US spellings, standard SI/Imperial) */
	readonly unitAliases?: Readonly<Record<string, readonly string[]>>;
	/** Universal range delimiters (e.g. ["-", "to", "/"]) */
	readonly rangeDelimiters?: readonly string[];
	/** Universal operator aliases (e.g. { "gte": [">=", "at least"], "gt": [">", "greater than"] }) */
	readonly operatorAliases?: Readonly<Record<string, readonly string[]>>;
	/** Universal statistical qualifiers (e.g. { "mean": ["mean", "average", "avg"] }) */
	readonly statisticalAliases?: Readonly<Record<string, readonly string[]>>;
	readonly aliases?: readonly AliasDefinition[];
	readonly aliasResolvers?: Readonly<Record<string, AliasResolver>>;
	readonly fundamentals?: readonly FundamentalGroup[];
	readonly recipes?: readonly ValueRecipe[];
}

export interface MacroArgumentPolicy {
	/** Sub-allowlist of units for this specific argument */
	readonly allowedUnits?: readonly string[];
	/** Sub-allowlist of currencies for this specific argument */
	readonly allowedCurrencies?: readonly string[];
	/** Canonical target unit resolution for multi-unit chains */
	readonly targetCanonicalUnit?: MultiUnitCanonicalTarget;
	/** Reference to a named bound in extension bounds or an inline NumericBounds */
	readonly bounds?: string | NumericBounds;
	/** Whether ranges (e.g. '120-140') are permitted */
	readonly allowRange?: boolean;
	/** Custom range delimiters for this argument */
	readonly rangeDelimiters?: readonly string[];
	/** Overridden parameter path (defaults to {extId}.{macroName}.{argId}) */
	readonly path?: string;
	/** Statistics policy */
	readonly statistics?: QuantityStatisticsPolicy;
	/** Whether operators are allowed */
	readonly allowOperator?: boolean;
	/** Whether data point counts are allowed */
	readonly allowDataPointCount?: boolean;
	readonly frequency?: FrequencyConsumerPolicy;
	readonly rate?: CompoundRateConsumerPolicy;
	readonly currency?: CurrencyConsumerPolicy;
	/** Explicit value recipes accepted by this argument. */
	readonly enabledRecipes?: readonly string[];
	/** Consumer-specific ordering overrides for enabled recipes. */
	readonly priorityOverrides?: Readonly<Record<string, number>>;
}

export interface MacroPolicyConfig {
	readonly arguments?: Readonly<Record<string, MacroArgumentPolicy>>;
}

export interface ExtensionDomainConfig {
	readonly id: string;
	readonly version: string;

	/** Seed files relative to extension root */
	readonly seeds?: readonly string[];

	/** Inline concepts to seed dynamically */
	readonly concepts?: readonly ConceptSeed[];

	/** Inline expressions to seed dynamically */
	readonly expressions?: readonly ExpressionSeed[];

	/** Specialized domain units not present in global profile */
	readonly domainUnits?: Readonly<Record<string, readonly string[]>>;

	/** Specialized domain localization policies */
	readonly localization?: LocalizationPolicyConfig;

	/** Specialized domain written number word definitions */
	readonly numberWords?: ExtendedNumberWordConfig;

	/** Specialized domain currency formatting */
	readonly currency?: CurrencyFormatConfig;

	/** Domain range delimiters */
	readonly rangeDelimiters?: readonly string[];

	/** Domain operator aliases */
	readonly operatorAliases?: Readonly<Record<string, readonly string[]>>;

	/** Domain statistical qualifiers */
	readonly statisticalAliases?: Readonly<Record<string, readonly string[]>>;

	/** Reusable named bounds pool */
	readonly bounds?: Readonly<Record<string, NumericBounds>>;

	/** Text prefixes to exclude via negative lookbehind */
	readonly excludePrefixes?: readonly string[];

	/** Scoped policies per macro */
	readonly macros?: Readonly<Record<string, MacroPolicyConfig>>;

	/** Optional domain-level overrides for profile fundamentals */
	readonly overrides?: Partial<UserMacroProfile>;
	readonly aliases?: readonly AliasDefinition[];
	readonly aliasResolvers?: Readonly<Record<string, AliasResolver>>;
	readonly fundamentals?: readonly FundamentalGroup[];
	readonly recipes?: readonly ValueRecipe[];
}

export interface CompiledDomainGrammar {
	readonly valid: boolean;
	readonly diagnostics: readonly (ErrorDescriptor & {
		readonly errorCode?: string;
		readonly recipeId?: string;
		readonly groupId?: string;
		readonly variantId?: string;
	})[];
	readonly quantity: QuantityGrammarConfig;
	readonly frequency?: FrequencyGrammarConfig;
	readonly rates?: CompoundRateConfig;
	readonly date?: DateTimeFormatConfig;
	readonly dateTime?: DateTimeFormatRegistry;
	readonly relativeTemporal?: RelativeTemporalConfig;
	readonly currency?: CurrencyFormatConfig;
	readonly localization?: LocalizationPolicyConfig;
	readonly numberWords?: ExtendedNumberWordConfig;
	readonly fundamentals?: FundamentalCompileResult;
	readonly aliases?: CompiledAliasRegistry;
	readonly recipes?: RecipeCompileResult;
	readonly bounds: Readonly<Record<string, NumericBounds>>;
	readonly excludePrefixes: readonly string[];
	readonly excludePrefixRegexPattern?: string;
}

export interface CompiledArgumentPolicy {
	readonly path: string;
	readonly policy: QuantityConsumerPolicy;
	readonly quantityConsumerPolicy: QuantityConsumerPolicy;
	readonly allowedCurrencies?: readonly string[];
	readonly targetCanonicalUnit?: MultiUnitCanonicalTarget;
	readonly bounds?: NumericBounds;
	readonly rangeDelimiters?: readonly string[];
	readonly enabledRecipes?: readonly string[];
	readonly priorityOverrides?: Readonly<Record<string, number>>;
	readonly frequencyConsumerPolicy?: FrequencyConsumerPolicy;
	readonly rateConsumerPolicy?: CompoundRateConsumerPolicy;
	readonly currencyConsumerPolicy?: CurrencyConsumerPolicy;
}
