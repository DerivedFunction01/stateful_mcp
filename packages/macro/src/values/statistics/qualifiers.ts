import type { MessageParam } from "@stateful-mcp/macro-protocol";
import { escapeRegex } from "../regex";
import { flattenAndSortAliases } from "../token-matcher";

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
	readonly kind?: StatisticalQualifierType;
	readonly role: StatisticalRole;
	readonly confidenceLevel?: number; // e.g. 95 for 95% CI
	readonly value?: number; // e.g. 5 for SD 5
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
	readonly qualifiers?: Readonly<
		Partial<Record<StatisticalQualifierType, readonly string[]>>
	>;
	readonly qualifierAliases?: Readonly<
		Partial<Record<StatisticalQualifierType, readonly string[]>>
	>;
	readonly locales?: string | readonly string[];
	readonly caseSensitive?: boolean;
}

export interface StatisticalDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
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
	const normalize = (value: string) =>
		config.caseSensitive
			? value
			: value.toLocaleLowerCase(config.locales as string);
	const lower = normalize(trimmed);

	const aliases = config.qualifierAliases ?? config.qualifiers;
	if (!aliases) {
		return { diagnostics: [] };
	}

	// Flatten and sort aliases by length descending
	const allPairs = flattenAndSortAliases(aliases, false);

	for (const { key: type, alias } of allPairs) {
		const aliasLower = normalize(alias);
		let confidenceLevel: number | undefined;
		let isMatch = false;

		if (type === "confidence_interval") {
			const ciRegex = new RegExp(
				`^(?:(?<level>\\d+)%\\s*)?${escapeRegex(aliasLower)}$`,
				config.caseSensitive ? "u" : "iu",
			);
			const ciMatch = lower.match(ciRegex);
			if (ciMatch) {
				isMatch = true;
				if (ciMatch.groups?.level) {
					confidenceLevel = Number(ciMatch.groups.level);
				}
			}
		} else {
			if (lower === aliasLower) {
				isMatch = true;
			}
		}

		if (isMatch) {
			const role = STATISTICAL_TYPE_TO_ROLE[type];
			const qualifier: StatisticalQualifier = {
				type,
				kind: type,
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
 * Extracts a prefix or postfix statistical qualifier from a string and returns the clean remainder.
 */
export function extractStatisticalQualifier(
	input: string,
	config: StatisticalConfig = {},
	policy: StatisticalConsumerPolicy = {},
): ExtractedQualifierResult {
	const text = input.trim();
	const aliases = config.qualifierAliases ?? config.qualifiers;
	if (!text || !aliases) {
		return { remainderText: text, diagnostics: [] };
	}

	const allPairs = flattenAndSortAliases(aliases, false);

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
				kind: type,
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

	// 2. Check for Postfix Qualifier (e.g. "120 mmHg (SD)", "50 mg (error)", "100 boxes of nitrile gloves (SD 5)")
	for (const { key: type, alias } of allPairs) {
		let confidenceLevel: number | undefined;
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(alias);

		let pattern: string;
		if (type === "confidence_interval") {
			pattern = `(?:\\(\\s*(?:(?<level>\\d+)%\\s*)?${escapeRegex(alias)}(?:\\s+(?<val>[^)]+))?\\s*\\)|(?<=[\\s\\p{P}]|^)(?:(?<level2>\\d+)%\\s*)?${escapeRegex(alias)})$`;
		} else {
			pattern = isSymbol
				? `\\s*${escapeRegex(alias)}$`
				: `(?:\\(\\s*${escapeRegex(alias)}(?:\\s+(?<val>[^)]+))?\\s*\\)|(?<=[\\s\\p{P}]|^)${escapeRegex(alias)})$`;
		}

		const regex = new RegExp(pattern, "iu");
		const match = text.match(regex);
		if (match && match.index !== undefined) {
			const levelStr = match.groups?.level ?? match.groups?.level2;
			if (levelStr) {
				confidenceLevel = Number(levelStr);
			}
			const valStr = match.groups?.val?.trim();
			let numVal: number | undefined;
			if (valStr) {
				const parsed = Number(valStr);
				if (!Number.isNaN(parsed)) {
					numVal = parsed;
				}
			}
			const remainder = text.slice(0, match.index).trim();
			const role = STATISTICAL_TYPE_TO_ROLE[type];
			const qualifier: StatisticalQualifier = {
				type,
				kind: type,
				role,
				...(confidenceLevel !== undefined ? { confidenceLevel } : {}),
				...(numVal !== undefined ? { value: numVal } : {}),
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
			messageKey: "errors.statisticsRejected",
			messageParams: { qualifier: qualifier.rawText },
		});
	} else if (
		policy.policy === "point_estimate_only" &&
		qualifier.role !== "central_tendency"
	) {
		diagnostics.push({
			code: "dispersion_error_rejected",
			messageKey: "errors.statisticsPointEstimateRejected",
			messageParams: {
				qualifier: qualifier.rawText,
				role: qualifier.role,
			},
		});
	} else if (
		policy.policy === "dispersion_only" &&
		qualifier.role !== "dispersion_error"
	) {
		diagnostics.push({
			code: "expected_dispersion_error",
			messageKey: "errors.statisticsExpectedDispersion",
			messageParams: {
				qualifier: qualifier.rawText,
				role: qualifier.role,
			},
		});
	} else if (
		policy.policy === "interval_only" &&
		qualifier.role !== "interval"
	) {
		diagnostics.push({
			code: "expected_statistical_interval",
			messageKey: "errors.statisticsExpectedInterval",
			messageParams: { qualifier: qualifier.rawText },
		});
	}

	// 2. Specific allowedQualifiers check
	if (
		policy.allowedQualifiers &&
		!policy.allowedQualifiers.includes(qualifier.type)
	) {
		diagnostics.push({
			code: "qualifier_type_not_allowed",
			messageKey: "errors.statisticsQualifierTypeNotAllowed",
			messageParams: { type: qualifier.type },
		});
	}

	// 3. Specific allowedRoles check
	if (policy.allowedRoles && !policy.allowedRoles.includes(qualifier.role)) {
		diagnostics.push({
			code: "qualifier_role_not_allowed",
			messageKey: "errors.statisticsQualifierRoleNotAllowed",
			messageParams: { role: qualifier.role },
		});
	}

	return {
		qualifier: diagnostics.length === 0 ? qualifier : undefined,
		diagnostics,
	};
}
