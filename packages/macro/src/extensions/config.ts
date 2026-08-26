import type {
	CompiledArgumentPolicy,
	CompiledDomainGrammar,
	ExtensionDomainConfig,
	LocalizationPolicyConfig,
	MacroArgumentPolicy,
	UserMacroProfile,
} from "../contracts/extension-config";
import type { NumericBounds } from "../contracts/values";
import type { AliasResolver } from "../values/aliases";
import { compileAliasRegistry } from "../values/aliases";
import type {
	CurrencyDefinition,
	CurrencyFormatConfig,
} from "../values/currency";
import type { DateTimeFormatConfig } from "../values/date-time";
import { compileFundamentalGroups } from "../values/fundamentals";
import type {
	QuantityConsumerPolicy,
	QuantityGrammarConfig,
} from "../values/quantity";
import { compileValueRecipes } from "../values/recipes";
import { escapeRegex } from "../values/regex";

export type ExtensionConfig = Readonly<Record<string, unknown>>;

export interface DomainConfigCompileOptions {
	/** Runtime terminal IDs available to recipe nodes. */
	readonly terminalIds?: ReadonlySet<string>;
	/** Runtime output-builder IDs available to structured recipe roots. */
	readonly outputBuilderIds?: ReadonlySet<string>;
	/** Scoped alias resolvers supplied by the active runtime. */
	readonly aliasResolvers?: Readonly<Record<string, AliasResolver>>;
}

export function resolveExtensionConfig(
	defaults: Readonly<Record<string, unknown>> | undefined,
	overrides: Readonly<Record<string, unknown>> | undefined,
): ExtensionConfig {
	return deepFreeze(
		mergeRecords(defaults ?? {}, overrides ?? {}),
	) as ExtensionConfig;
}

export function compileDomainConfig(
	profile?: UserMacroProfile,
	config?: ExtensionDomainConfig,
	options: DomainConfigCompileOptions = {},
): CompiledDomainGrammar {
	const decimalSeparator: "." | "," | undefined = (config?.overrides?.values
		?.numeric?.decimalSeparator ??
		profile?.values?.numeric?.decimalSeparator) as "." | "," | undefined;

	const combinedUnitAliases: Record<string, string[]> = {};
	if (profile?.unitAliases) {
		for (const [unit, aliases] of Object.entries(profile.unitAliases)) {
			combinedUnitAliases[unit] = [...aliases];
		}
	}
	if (config?.domainUnits) {
		for (const [unit, aliases] of Object.entries(config.domainUnits)) {
			if (combinedUnitAliases[unit]) {
				combinedUnitAliases[unit] = Array.from(
					new Set([...combinedUnitAliases[unit], ...aliases]),
				);
			} else {
				combinedUnitAliases[unit] = [...aliases];
			}
		}
	}

	const combinedRangeDelimiters = Array.from(
		new Set([
			...(profile?.rangeDelimiters ?? []),
			...(config?.rangeDelimiters ?? []),
			...(config?.overrides?.rangeDelimiters ?? []),
		]),
	);

	const combinedOperatorAliases: Record<string, string[]> = {};
	if (profile?.operatorAliases) {
		for (const [key, aliases] of Object.entries(profile.operatorAliases)) {
			combinedOperatorAliases[key] = [...aliases];
		}
	}
	if (config?.operatorAliases) {
		for (const [key, aliases] of Object.entries(config.operatorAliases)) {
			if (combinedOperatorAliases[key]) {
				combinedOperatorAliases[key] = Array.from(
					new Set([...combinedOperatorAliases[key], ...aliases]),
				);
			} else {
				combinedOperatorAliases[key] = [...aliases];
			}
		}
	}
	if (config?.overrides?.operatorAliases) {
		for (const [key, aliases] of Object.entries(
			config.overrides.operatorAliases,
		)) {
			if (combinedOperatorAliases[key]) {
				combinedOperatorAliases[key] = Array.from(
					new Set([...combinedOperatorAliases[key], ...aliases]),
				);
			} else {
				combinedOperatorAliases[key] = [...aliases];
			}
		}
	}

	const combinedStatisticalAliases: Record<string, string[]> = {};
	if (profile?.statisticalAliases) {
		for (const [key, aliases] of Object.entries(profile.statisticalAliases)) {
			combinedStatisticalAliases[key] = [...aliases];
		}
	}
	if (config?.statisticalAliases) {
		for (const [key, aliases] of Object.entries(config.statisticalAliases)) {
			if (combinedStatisticalAliases[key]) {
				combinedStatisticalAliases[key] = Array.from(
					new Set([...combinedStatisticalAliases[key], ...aliases]),
				);
			} else {
				combinedStatisticalAliases[key] = [...aliases];
			}
		}
	}
	if (config?.overrides?.statisticalAliases) {
		for (const [key, aliases] of Object.entries(
			config.overrides.statisticalAliases,
		)) {
			if (combinedStatisticalAliases[key]) {
				combinedStatisticalAliases[key] = Array.from(
					new Set([...combinedStatisticalAliases[key], ...aliases]),
				);
			} else {
				combinedStatisticalAliases[key] = [...aliases];
			}
		}
	}

	const numeric = {
		...(profile?.values?.numeric ?? {}),
		...(config?.overrides?.values?.numeric ?? {}),
	};
	const quantity: QuantityGrammarConfig = {
		...numeric,
		...(profile?.values?.quantity ?? {}),
		...(config?.overrides?.values?.quantity ?? {}),
		unitAliases: combinedUnitAliases,
		rangeDelimiters: combinedRangeDelimiters,
		...(decimalSeparator ? { decimalSeparator } : {}),
		...(Object.keys(combinedOperatorAliases).length
			? { operatorConfig: { operators: combinedOperatorAliases } }
			: {}),
		...(Object.keys(combinedStatisticalAliases).length
			? { statisticalConfig: { qualifiers: combinedStatisticalAliases } }
			: {}),
	};
	const frequency = {
		...(profile?.values?.frequency ?? {}),
		...(config?.overrides?.values?.frequency ?? {}),
	};
	const rates = {
		...(profile?.values?.rates ?? {}),
		...(config?.overrides?.values?.rates ?? {}),
	};

	const date = (config?.overrides?.values?.date ?? profile?.values?.date) as
		| DateTimeFormatConfig
		| undefined;
	const dateTime = (config?.overrides?.values?.dateTime ??
		profile?.values?.dateTime) as CompiledDomainGrammar["dateTime"] | undefined;
	const relativeTemporal = (config?.overrides?.values?.relativeTemporal ??
		profile?.values?.relativeTemporal) as
		| CompiledDomainGrammar["relativeTemporal"]
		| undefined;

	// Merge currency configuration
	let currency: CurrencyFormatConfig | undefined;
	const profileCurrency =
		config?.overrides?.values?.currency ?? profile?.values?.currency;
	const domainCurrency = config?.currency;
	const overrideCurrency = config?.overrides?.values?.currency;

	if (profileCurrency || domainCurrency || overrideCurrency) {
		const combinedCurrencies: Record<string, string[]> = {};
		for (const src of [
			profileCurrency?.currencies,
			domainCurrency?.currencies,
			overrideCurrency?.currencies,
		]) {
			if (!src) continue;
			for (const [code, aliases] of Object.entries(src)) {
				if (combinedCurrencies[code]) {
					combinedCurrencies[code] = Array.from(
						new Set([...combinedCurrencies[code], ...aliases]),
					);
				} else {
					combinedCurrencies[code] = [...aliases];
				}
			}
		}

		const combinedDefinitions: CurrencyDefinition[] = [
			...(profileCurrency?.definitions ?? []),
			...(domainCurrency?.definitions ?? []),
			...(overrideCurrency?.definitions ?? []),
		];

		const combinedChainDelimiters = Array.from(
			new Set([
				...(profileCurrency?.chainDelimiters ?? []),
				...(domainCurrency?.chainDelimiters ?? []),
				...(overrideCurrency?.chainDelimiters ?? []),
			]),
		);

		currency = {
			defaultCurrency:
				overrideCurrency?.defaultCurrency ??
				domainCurrency?.defaultCurrency ??
				profileCurrency?.defaultCurrency,
			position:
				overrideCurrency?.position ??
				domainCurrency?.position ??
				profileCurrency?.position,
			negativeStyle:
				overrideCurrency?.negativeStyle ??
				domainCurrency?.negativeStyle ??
				profileCurrency?.negativeStyle,
			thousandsSeparator:
				overrideCurrency?.thousandsSeparator ??
				domainCurrency?.thousandsSeparator ??
				profileCurrency?.thousandsSeparator,
			decimalSeparator: (overrideCurrency?.decimalSeparator ??
				domainCurrency?.decimalSeparator ??
				profileCurrency?.decimalSeparator ??
				decimalSeparator) as "." | "," | undefined,
			...(Object.keys(combinedCurrencies).length
				? { currencies: combinedCurrencies }
				: {}),
			...(combinedDefinitions.length
				? { definitions: combinedDefinitions }
				: {}),
			...(combinedChainDelimiters.length
				? { chainDelimiters: combinedChainDelimiters }
				: {}),
		};
	}

	// Merge localization configuration
	const profileLocalization = profile?.localization;
	const domainLocalization = config?.localization;
	const overrideLocalization = config?.overrides?.localization;

	let localization: LocalizationPolicyConfig | undefined;
	if (
		profileLocalization ||
		domainLocalization ||
		overrideLocalization ||
		profile?.locale
	) {
		localization = {
			locale:
				overrideLocalization?.locale ??
				domainLocalization?.locale ??
				profileLocalization?.locale ??
				profile?.locale,
			boundaryPolicy:
				overrideLocalization?.boundaryPolicy ??
				domainLocalization?.boundaryPolicy ??
				profileLocalization?.boundaryPolicy ??
				"standard",
			customBoundaryRegex:
				overrideLocalization?.customBoundaryRegex ??
				domainLocalization?.customBoundaryRegex ??
				profileLocalization?.customBoundaryRegex,
			digitPolicy:
				overrideLocalization?.digitPolicy ??
				domainLocalization?.digitPolicy ??
				profileLocalization?.digitPolicy ??
				"auto",
			customDigitMap: {
				...(profileLocalization?.customDigitMap ?? {}),
				...(domainLocalization?.customDigitMap ?? {}),
				...(overrideLocalization?.customDigitMap ?? {}),
			},
			quotePairs:
				overrideLocalization?.quotePairs ??
				domainLocalization?.quotePairs ??
				profileLocalization?.quotePairs,
			groupBrackets:
				overrideLocalization?.groupBrackets ??
				domainLocalization?.groupBrackets ??
				profileLocalization?.groupBrackets,
		};
	}

	// Merge number words
	const numberWords =
		config?.overrides?.numberWords ??
		config?.numberWords ??
		profile?.numberWords;

	const excludePrefixes = Array.from(
		new Set([
			...(profile?.excludePrefixes ?? []),
			...(config?.excludePrefixes ?? []),
		]),
	);

	const excludePrefixRegexPattern = excludePrefixes.length
		? excludePrefixes.map((p) => `(?<!${escapeRegex(p)})`).join("")
		: undefined;

	const bounds: Record<string, NumericBounds> = {
		...(config?.bounds ?? {}),
	};

	const fundamentals = [
		...(profile?.fundamentals ?? []),
		...(config?.fundamentals ?? []),
		...(config?.overrides?.fundamentals ?? []),
	];
	const aliases = [
		...(profile?.aliases ?? []),
		...(config?.aliases ?? []),
		...(config?.overrides?.aliases ?? []),
	];
	const aliasResolvers = {
		...(profile?.aliasResolvers ?? {}),
		...(config?.aliasResolvers ?? {}),
		...(options.aliasResolvers ?? {}),
	};
	const fundamentalCompilation = compileFundamentalGroups(fundamentals);
	const aliasCompilation = compileAliasRegistry(aliases, aliasResolvers);
	const recipeCompilation = compileValueRecipes(
		fundamentals,
		[
			...(profile?.recipes ?? []),
			...(config?.recipes ?? []),
			...(config?.overrides?.recipes ?? []),
		],
		{
			terminalIds: options.terminalIds,
			outputBuilderIds: options.outputBuilderIds,
		},
	);
	const diagnostics = Object.freeze([
		...fundamentalCompilation.diagnostics,
		...aliasCompilation.diagnostics,
		...recipeCompilation.diagnostics,
	]);

	return {
		valid: diagnostics.length === 0,
		diagnostics,
		quantity:
			fundamentals.length > 0
				? { ...quantity, fundamentalGroups: fundamentals }
				: quantity,
		...(Object.keys(frequency).length ? { frequency } : {}),
		...(Object.keys(rates).length ? { rates } : {}),
		date,
		dateTime,
		relativeTemporal,
		currency,
		localization,
		numberWords,
		bounds,
		excludePrefixes,
		excludePrefixRegexPattern,
		fundamentals: fundamentalCompilation,
		aliases: aliasCompilation,
		recipes: recipeCompilation,
	};
}

export function resolveArgumentPolicy(
	extensionId: string,
	macroName: string,
	argumentId: string,
	grammar: CompiledDomainGrammar,
	policy?: MacroArgumentPolicy,
): CompiledArgumentPolicy {
	const path = policy?.path ?? `${extensionId}.${macroName}.${argumentId}`;
	const consumerPolicy: QuantityConsumerPolicy = {
		allowedUnits: policy?.allowedUnits,
		allowRange: policy?.allowRange ?? true,
		allowOperator: policy?.allowOperator ?? true,
		statisticsPolicy:
			typeof policy?.statistics === "object"
				? policy.statistics
				: policy?.statistics === "accept"
					? { policy: "accept_all" }
					: policy?.statistics === "reject"
						? { policy: "reject_all_statistics" }
						: undefined,
		allowDataPointCount: policy?.allowDataPointCount ?? false,
	};

	let resolvedBounds: NumericBounds | undefined;
	if (typeof policy?.bounds === "string") {
		resolvedBounds = grammar.bounds[policy.bounds];
	} else if (typeof policy?.bounds === "object" && policy.bounds !== null) {
		resolvedBounds = policy.bounds;
	}

	return {
		path,
		policy: consumerPolicy,
		quantityConsumerPolicy: consumerPolicy,
		allowedCurrencies: policy?.allowedCurrencies,
		targetCanonicalUnit: policy?.targetCanonicalUnit,
		bounds: resolvedBounds,
		rangeDelimiters: policy?.rangeDelimiters,
		enabledRecipes: policy?.enabledRecipes,
		priorityOverrides: policy?.priorityOverrides,
	};
}

function mergeRecords(
	defaults: Readonly<Record<string, unknown>>,
	overrides: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(defaults)) {
		result[key] = cloneValue(value);
	}
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) continue;
		const defaultValue = defaults[key];
		if (isRecord(defaultValue) && isRecord(value)) {
			result[key] = mergeRecords(defaultValue, value);
		} else {
			result[key] = cloneValue(value);
		}
	}
	return result;
}

function cloneValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(cloneValue);
	if (isRecord(value)) return mergeRecords(value, {});
	return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return Boolean(
		value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			Object.getPrototypeOf(value) === Object.prototype,
	);
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object") return value;
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) {
		if (child && typeof child === "object" && !Object.isFrozen(child)) {
			deepFreeze(child);
		}
	}
	return value;
}
