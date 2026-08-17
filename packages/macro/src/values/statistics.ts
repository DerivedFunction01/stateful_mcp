import { type NumericParseOptions, parseNumericValue } from "./numeric";
import { escapeRegex } from "./regex";
import { flattenAndSortAliases } from "./token-matcher";

export const STATISTICAL_QUALIFIER_TYPES = [
	"mean",
	"median",
	"mode",
	"standard_deviation",
	"standard_error",
	"variance",
	"margin_of_error",
	"confidence_interval",
	"interquartile_range",
] as const;

export type StatisticalQualifierType =
	(typeof STATISTICAL_QUALIFIER_TYPES)[number];

export type StatisticalRole =
	| "central_tendency"
	| "dispersion_error"
	| "interval";

export const STATISTICAL_TYPE_TO_ROLE: Readonly<
	Record<StatisticalQualifierType, StatisticalRole>
> = {
	mean: "central_tendency",
	median: "central_tendency",
	mode: "central_tendency",
	standard_deviation: "dispersion_error",
	standard_error: "dispersion_error",
	variance: "dispersion_error",
	margin_of_error: "dispersion_error",
	confidence_interval: "interval",
	interquartile_range: "interval",
};

export interface StatisticalQualifier {
	readonly type: StatisticalQualifierType;
	readonly role: StatisticalRole;
	readonly confidenceLevel?: number; // e.g. 95 for 95% CI
	readonly rawText: string;
	readonly matchedAlias: string;
}

export interface StatisticalConsumerPolicy {
	/** Explicit allowlist of qualifier types permitted for this slot */
	readonly allowedQualifiers?: readonly StatisticalQualifierType[];
	/** Explicit allowlist of roles permitted (e.g. only central tendency) */
	readonly allowedRoles?: readonly StatisticalRole[];
	/** High-level behavior policy */
	readonly policy?:
		| "point_estimate_only" // Rejects dispersion_error & interval, accepts bare or central_tendency
		| "reject_all_statistics" // Strictly bare numbers only (rejects all qualifiers)
		| "dispersion_only" // Only accepts SD, SE, variance, margin_of_error
		| "interval_only" // Only accepts CI, IQR
		| "accept_all"; // Accepts any valid statistical metric
}

export interface StatisticalConfig {
	readonly qualifierAliases?: Readonly<
		Partial<Record<StatisticalQualifierType, readonly string[]>>
	>;
	readonly locales?: string | readonly string[];
}

export interface StatisticalDiagnostic {
	readonly code: string;
	readonly message: string;
}

export interface StatisticalQualifierResolution {
	readonly qualifier?: StatisticalQualifier;
	readonly diagnostics: readonly StatisticalDiagnostic[];
}

export interface ExtractedQualifierResult {
	readonly qualifierMatch?: StatisticalQualifier;
	readonly remainderText: string;
	readonly diagnostics: readonly StatisticalDiagnostic[];
}

/**
 * Resolves a standalone token into a canonical StatisticalQualifier using user configuration and consumer policy.
 * Does NOT inject hardcoded fallback dictionaries.
 */
export function resolveStatisticalQualifier(
	token: string,
	config: StatisticalConfig = {},
	policy: StatisticalConsumerPolicy = {},
): StatisticalQualifierResolution {
	const trimmed = token.trim();
	if (!trimmed) {
		return { diagnostics: [] };
	}
	const lower = trimmed.toLocaleLowerCase(config.locales as string);

	if (!config.qualifierAliases) {
		return { diagnostics: [] };
	}

	// Flatten and sort aliases by length descending
	const allPairs = flattenAndSortAliases(config.qualifierAliases, false);

	for (const { key: type, alias } of allPairs) {
		const aliasLower = alias.toLocaleLowerCase(config.locales as string);
		let confidenceLevel: number | undefined;
		let isMatch = false;

		if (type === "confidence_interval") {
			const ciRegex = new RegExp(
				`^(?:(?<level>\\d+)%\\s*)?${escapeRegex(aliasLower)}$`,
				"iu",
			);
			const ciMatch = lower.match(ciRegex);
			if (ciMatch) {
				isMatch = true;
				if (ciMatch.groups?.level) {
					confidenceLevel = Number(ciMatch.groups.level);
				}
			}
		}

		if (!isMatch && aliasLower === lower) {
			isMatch = true;
		}

		if (isMatch) {
			const role = STATISTICAL_TYPE_TO_ROLE[type];
			const qualifier: StatisticalQualifier = {
				type,
				role,
				...(confidenceLevel !== undefined ? { confidenceLevel } : {}),
				rawText: trimmed,
				matchedAlias: alias,
			};

			return validateStatisticalPolicy(qualifier, policy);
		}
	}

	return { diagnostics: [] };
}

/**
 * Extracts a statistical qualifier from the start or end of text, returning the remainder and validating against policy.
 * Does NOT inject hardcoded English words.
 */
export function extractStatisticalQualifier(
	input: string,
	config: StatisticalConfig = {},
	policy: StatisticalConsumerPolicy = {},
): ExtractedQualifierResult {
	const text = input.trim();
	if (!text || !config.qualifierAliases) {
		return { remainderText: text, diagnostics: [] };
	}

	const allPairs = flattenAndSortAliases(config.qualifierAliases, false);

	// 1. Check for Prefix Qualifier (e.g. "error of 50 mg", "mean of 120", "95% CI 4.8-5.6")
	for (const { key: type, alias } of allPairs) {
		let confidenceLevel: number | undefined;
		let pattern: string;

		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);
		if (type === "confidence_interval") {
			pattern = `^(?:(?<level>\\d+)%\\s*)?${escapeRegex(alias)}(?![\\p{L}\\p{N}])\\s*`;
		} else {
			pattern = isSymbol
				? `^${escapeRegex(alias)}\\s*`
				: `^${escapeRegex(alias)}(?![\\p{L}\\p{N}])\\s*`;
		}

		const regex = new RegExp(pattern, "iu");
		const match = text.match(regex);
		if (match) {
			if (match.groups?.level) {
				confidenceLevel = Number(match.groups.level);
			}
			const remainder = text.slice(match[0].length).trim();
			const role = STATISTICAL_TYPE_TO_ROLE[type];
			const qualifier: StatisticalQualifier = {
				type,
				role,
				...(confidenceLevel !== undefined ? { confidenceLevel } : {}),
				rawText: match[0].trim(),
				matchedAlias: alias,
			};

			const validation = validateStatisticalPolicy(qualifier, policy);
			return {
				qualifierMatch: validation.qualifier,
				remainderText: remainder,
				diagnostics: validation.diagnostics,
			};
		}
	}

	// 2. Check for Postfix Qualifier (e.g. "120 mmHg (SD)", "50 mg (error)")
	for (const { key: type, alias } of allPairs) {
		let confidenceLevel: number | undefined;
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);

		let pattern: string;
		if (type === "confidence_interval") {
			pattern = `(?:\\(\\s*(?:(?<level>\\d+)%\\s*)?${escapeRegex(alias)}\\s*\\)|(?<=[\\s\\p{P}]|^)(?:(?<level2>\\d+)%\\s*)?${escapeRegex(alias)})$`;
		} else {
			pattern = isSymbol
				? `\\s*${escapeRegex(alias)}$`
				: `(?:\\(\\s*${escapeRegex(alias)}\\s*\\)|(?<=[\\s\\p{P}]|^)${escapeRegex(alias)})$`;
		}

		const regex = new RegExp(pattern, "iu");
		const match = text.match(regex);
		if (match && match.index !== undefined) {
			const levelStr = match.groups?.level ?? match.groups?.level2;
			if (levelStr) {
				confidenceLevel = Number(levelStr);
			}
			const remainder = text.slice(0, match.index).trim();
			const role = STATISTICAL_TYPE_TO_ROLE[type];
			const qualifier: StatisticalQualifier = {
				type,
				role,
				...(confidenceLevel !== undefined ? { confidenceLevel } : {}),
				rawText: match[0].trim(),
				matchedAlias: alias,
			};

			const validation = validateStatisticalPolicy(qualifier, policy);
			return {
				qualifierMatch: validation.qualifier,
				remainderText: remainder,
				diagnostics: validation.diagnostics,
			};
		}
	}

	return { remainderText: text, diagnostics: [] };
}

function validateStatisticalPolicy(
	qualifier: StatisticalQualifier,
	policy: StatisticalConsumerPolicy,
): StatisticalQualifierResolution {
	const diagnostics: StatisticalDiagnostic[] = [];

	// 1. High-level policy evaluation
	if (policy.policy === "reject_all_statistics") {
		diagnostics.push({
			code: "statistics_rejected",
			message: `Statistical qualifier '${qualifier.rawText}' is not permitted for this field`,
		});
	} else if (
		policy.policy === "point_estimate_only" &&
		qualifier.role !== "central_tendency"
	) {
		diagnostics.push({
			code: "dispersion_error_rejected",
			message: `Statistical metric '${qualifier.rawText}' (${qualifier.role}) cannot be assigned to a point estimate slot`,
		});
	} else if (
		policy.policy === "dispersion_only" &&
		qualifier.role !== "dispersion_error"
	) {
		diagnostics.push({
			code: "expected_dispersion_error",
			message: `Slot requires a dispersion or error metric, but received '${qualifier.rawText}' (${qualifier.role})`,
		});
	} else if (
		policy.policy === "interval_only" &&
		qualifier.role !== "interval"
	) {
		diagnostics.push({
			code: "expected_statistical_interval",
			message: `Slot requires a statistical interval (CI/IQR), but received '${qualifier.rawText}'`,
		});
	}

	// 2. Specific allowedQualifiers check
	if (
		policy.allowedQualifiers &&
		!policy.allowedQualifiers.includes(qualifier.type)
	) {
		diagnostics.push({
			code: "qualifier_type_not_allowed",
			message: `Statistical qualifier type '${qualifier.type}' is not in the allowed list`,
		});
	}

	// 3. Specific allowedRoles check
	if (policy.allowedRoles && !policy.allowedRoles.includes(qualifier.role)) {
		diagnostics.push({
			code: "qualifier_role_not_allowed",
			message: `Statistical role '${qualifier.role}' is not permitted for this field`,
		});
	}

	return {
		qualifier: diagnostics.length === 0 ? qualifier : undefined,
		diagnostics,
	};
}

// --------------------------------------------------------------------------
// Ratios, Proportions & Parts-Per Scaled Values
// --------------------------------------------------------------------------

export interface RatioValue {
	readonly kind: "ratio";
	readonly antecedent: number;
	readonly consequent: number;
	readonly decimalValue: number;
	readonly rawText: string;
}

export interface RatioParseOptions extends NumericParseOptions {
	readonly ratioSeparators?: readonly string[]; // e.g. [":", "in", "out of", "de"]
	readonly locales?: string | readonly string[];
}

export interface ProportionalScaleDefinition {
	/** Multiplier to convert to standard decimal fraction (e.g. 1e-2 for %, 1e-6 for ppm, 1e-9 for ppb) */
	readonly multiplier: number;
	/** User-configured tokens triggering this scale (e.g. ["%", "pct"], ["ppm"], ["ppb"], ["bp"]) */
	readonly tokens: readonly string[];
	/** Optional identifier for the scale (e.g. "percent", "ppm", "ppb", "basis_points") */
	readonly scaleId?: string;
}

export interface ProportionalValue {
	readonly kind: "proportion";
	readonly numericValue: number; // Raw unscaled numeric value (e.g. 50 in "50 ppm")
	readonly decimalValue: number; // Mathematical decimal fraction (e.g. 50 * 1e-6 = 0.00005)
	readonly multiplier: number; // 1e-6
	readonly matchedToken: string; // "ppm"
	readonly scaleId?: string; // "ppm"
	readonly rawText: string;
}

export interface ProportionalParseOptions extends NumericParseOptions {
	/** Explicit list of proportional scales. If omitted, defaults to universal math symbols ['%', '‰', '‱']. */
	readonly scales?: readonly ProportionalScaleDefinition[];
	readonly locales?: string | readonly string[];
}

const DEFAULT_PROPORTIONAL_SCALES: readonly ProportionalScaleDefinition[] = [
	{ multiplier: 0.01, tokens: ["%"], scaleId: "percent" },
	{ multiplier: 0.001, tokens: ["‰"], scaleId: "permille" },
	{ multiplier: 0.0001, tokens: ["‱"], scaleId: "permyriad" },
];

/**
 * Parses ratios and proportions (e.g. "1:1000", "16:9", "1 in 5", "3 out of 10").
 * Only ":" is recognized by default unless ratioSeparators are configured.
 * Uses parseNumericValue for locale-aware number parsing.
 */
export function parseRatioValue(
	input: string,
	options: RatioParseOptions = {},
): RatioValue | undefined {
	const rawText = input.trim();
	if (!rawText) return undefined;

	const separators = options.ratioSeparators ?? [":"];

	for (const sep of separators) {
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(sep);
		const escaped = escapeRegex(sep);
		let index = -1;

		if (isSymbol) {
			index = rawText.indexOf(sep);
		} else {
			const wordRegex = new RegExp(`\\s+${escaped}\\s+`, "iu");
			const m = rawText.match(wordRegex);
			if (m && m.index !== undefined) {
				const anteStr = rawText.slice(0, m.index).trim();
				const consStr = rawText.slice(m.index + m[0].length).trim();
				const anteRes = parseNumericValue(anteStr, options);
				const consRes = parseNumericValue(consStr, options);
				if (anteRes.parsed && consRes.parsed && consRes.parsed.value !== 0) {
					return {
						kind: "ratio",
						antecedent: anteRes.parsed.value,
						consequent: consRes.parsed.value,
						decimalValue: anteRes.parsed.value / consRes.parsed.value,
						rawText,
					};
				}
				continue;
			}
		}

		if (index > 0) {
			const anteStr = rawText.slice(0, index).trim();
			const consStr = rawText.slice(index + sep.length).trim();
			const anteRes = parseNumericValue(anteStr, options);
			const consRes = parseNumericValue(consStr, options);
			if (anteRes.parsed && consRes.parsed && consRes.parsed.value !== 0) {
				return {
					kind: "ratio",
					antecedent: anteRes.parsed.value,
					consequent: consRes.parsed.value,
					decimalValue: anteRes.parsed.value / consRes.parsed.value,
					rawText,
				};
			}
		}
	}

	return undefined;
}

/**
 * Parses generic proportional and parts-per expressions (e.g. "%", "ppm", "ppb", "ppt", "bp").
 * Uses generic ProportionalScaleDefinition array for user-defined scales.
 * Defaults to mathematical symbols ('%', '‰', '‱').
 */
export function parseProportionalValue(
	input: string,
	options: ProportionalParseOptions = {},
): ProportionalValue | undefined {
	const rawText = input.trim();
	if (!rawText) return undefined;

	const scales = options.scales ?? DEFAULT_PROPORTIONAL_SCALES;

	// Flatten all token pairs and sort by token length descending
	const allTokens: { scale: ProportionalScaleDefinition; token: string }[] = [];
	for (const scale of scales) {
		for (const tok of scale.tokens) {
			if (tok) {
				allTokens.push({ scale, token: tok });
			}
		}
	}
	allTokens.sort((a, b) => b.token.length - a.token.length);

	for (const { scale, token } of allTokens) {
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(token);
		let matched = false;
		let numStr = "";

		if (isSymbol) {
			if (rawText.endsWith(token)) {
				numStr = rawText.slice(0, -token.length).trim();
				matched = true;
			}
		} else {
			const escaped = escapeRegex(token);
			const wordRegex = new RegExp(`\\s+${escaped}$`, "iu");
			const m = rawText.match(wordRegex);
			if (m && m.index !== undefined) {
				numStr = rawText.slice(0, m.index).trim();
				matched = true;
			}
		}

		if (matched && numStr) {
			const numRes = parseNumericValue(numStr, options);
			if (numRes.parsed) {
				const num = numRes.parsed.value;
				return {
					kind: "proportion",
					numericValue: num,
					decimalValue: num * scale.multiplier,
					multiplier: scale.multiplier,
					matchedToken: token,
					...(scale.scaleId ? { scaleId: scale.scaleId } : {}),
					rawText,
				};
			}
		}
	}

	return undefined;
}

/** Shorthand backward-compatible alias for parseProportionalValue */
export const parsePercentageValue = parseProportionalValue;
