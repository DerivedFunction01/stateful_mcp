import type {
	CompiledArgumentPolicy,
	CompiledDomainGrammar,
	ExtensionDomainConfig,
	LocalizationPolicyConfig,
	MacroArgumentPolicy,
	UserMacroProfile,
} from "../contracts/extension-config";
import type { NumericBounds } from "../contracts/values";
import type {
	CurrencyDefinition,
	CurrencyFormatConfig,
} from "../values/currency";
import type {
	QuantityConsumerPolicy,
	QuantityGrammarConfig,
} from "../values/quantity";
import { escapeRegex } from "../values/regex";

export type ExtensionConfig = Readonly<Record<string, unknown>>;

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
): CompiledDomainGrammar {
	const decimalSeparator =
		config?.overrides?.decimalSeparator ?? profile?.decimalSeparator;

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

	const quantity: QuantityGrammarConfig = {
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

	const date = config?.overrides?.date ?? profile?.date;

	// Merge currency configuration
	let currency: CurrencyFormatConfig | undefined;
	const profileCurrency = profile?.currency;
	const domainCurrency = config?.currency;
	const overrideCurrency = config?.overrides?.currency;

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
			decimalSeparator:
				overrideCurrency?.decimalSeparator ??
				domainCurrency?.decimalSeparator ??
				profileCurrency?.decimalSeparator ??
				decimalSeparator,
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

	return {
		quantity,
		date,
		currency,
		localization,
		numberWords,
		bounds,
		excludePrefixes,
		excludePrefixRegexPattern,
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
			policy?.statistics === "accept"
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
