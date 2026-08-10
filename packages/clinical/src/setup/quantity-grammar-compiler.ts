import { UNIT_DISPLAY_MAP } from "../schemas/schemas-interface/measurement";
import type {
	QuantityConsumerPolicy,
	QuantityGrammarConfig,
	QuantityGrammarResolution,
} from "../values/quantity-grammar";
import { parseQuantity } from "../values/quantity-grammar";
import type { QuantityGrammarProfile } from "../values/quantity-profile-types";
import { NumberWordNormalizer } from "../values/utils/number-word-normalizer";
import { buildPatternWithAnchors, escapeRegex } from "./regex-builder-helper";

export function profileToQuantityGrammarConfig(
	profile: QuantityGrammarProfile,
): QuantityGrammarConfig {
	return {
		unitAliases: profile.unitAliases,
		rangeDelimiters: profile.rangeDelimiters,
		operatorAliases: profile.operatorAliases,
		statisticalAliases: profile.statisticalAliases,
		decimalSeparator: profile.decimalSeparator,
	};
}

export function compileQuantityProfileRegex(
	profile: QuantityGrammarProfile,
	options: { fullSpanAnchor?: boolean } = {},
): string {
	const unitPatterns = Object.keys(profile.unitAliases)
		.map(escapeRegex)
		.join("|");
	const operatorPatterns = Object.keys(profile.operatorAliases ?? {})
		.map(escapeRegex)
		.join("|");

	const dec = profile.decimalSeparator === "," ? "," : "\\.";
	const numPattern = `[+-]?\\d+(?:${dec}\\d+)?`;

	let body = "";

	if (profile.ordering.unitOrder === "prefix") {
		const symbol = profile.ordering.distributivePrefix?.symbol
			? escapeRegex(profile.ordering.distributivePrefix.symbol)
			: unitPatterns;
		const sep =
			profile.ordering.distributivePrefix?.prefixSeparator === "colon"
				? "\\s*:\\s*"
				: profile.ordering.distributivePrefix?.prefixSeparator === "equals"
					? "\\s*=\\s*"
					: "\\s*";

		body = `(?:${symbol})${sep}(?:${operatorPatterns}\\s*)?(?<lower>${numPattern})(?:\\s*(?:${profile.rangeDelimiters.map(escapeRegex).join("|")})\\s*(?<upper>${numPattern}))?`;
	} else {
		// Suffix or Flexible
		body = `(?:${operatorPatterns}\\s*)?(?<lower>${numPattern})(?:\\s*(?:${profile.rangeDelimiters.map(escapeRegex).join("|")})\\s*(?<upper>${numPattern}))?\\s*(?:${unitPatterns})`;
	}

	const boundaryMode = profile.measurementWordBoundary ?? "both";

	return buildPatternWithAnchors(body, {
		wordBoundary: boundaryMode,
		anchorStart: options.fullSpanAnchor,
		anchorEnd: options.fullSpanAnchor,
	});
}

export function parseQuantityWithProfile(
	input: string,
	profile: QuantityGrammarProfile,
	policy: QuantityConsumerPolicy,
): QuantityGrammarResolution {
	let normalizedInput = input;
	if (profile.numberWords) {
		const normalizer = new NumberWordNormalizer(profile.numberWords);
		normalizedInput = normalizer.normalize(input).normalizedText;
	}

	// Handle distributive prefix symbol parsing if configured
	if (
		profile.ordering.unitOrder === "prefix" &&
		profile.ordering.distributivePrefix
	) {
		const prefixConfig = profile.ordering.distributivePrefix;
		const symbol = prefixConfig.symbol;
		if (normalizedInput.includes(symbol)) {
			const canonicalUnit =
				profile.unitAliases[symbol] ??
				profile.unitAliases[symbol.toLowerCase()] ??
				symbol;
			let cleaned = normalizedInput.replace(symbol, "").trim();
			if (cleaned.startsWith(":") || cleaned.startsWith("=")) {
				cleaned = cleaned.slice(1).trim();
			}
			const hasSuffixUnit = Object.keys(profile.unitAliases).some((alias) =>
				cleaned.endsWith(alias),
			);
			normalizedInput = hasSuffixUnit ? cleaned : `${cleaned} ${canonicalUnit}`;
		}
	}

	const config = profileToQuantityGrammarConfig(profile);
	return parseQuantity(normalizedInput, config, policy);
}

export interface ScopedPatternOptions {
	activeUnits?: readonly string[];
	fullSpanAnchor?: boolean;
}

export function buildScopedParameterRegex(
	profile: QuantityGrammarProfile,
	options: ScopedPatternOptions = {},
): string {
	let filtered = profile;
	if (options.activeUnits?.length) {
		const allowed = new Set(options.activeUnits.map((u) => u.toLowerCase()));
		const filteredAliases = Object.fromEntries(
			Object.entries(profile.unitAliases).filter(
				([alias, canonical]) =>
					allowed.has(alias.toLowerCase()) ||
					allowed.has(canonical.toLowerCase()),
			),
		);
		filtered = { ...profile, unitAliases: filteredAliases };
	}
	return compileQuantityProfileRegex(filtered, {
		fullSpanAnchor: options.fullSpanAnchor ?? false,
	});
}

export function resolveQuantityUnitDisplay(
	profile: QuantityGrammarProfile,
	canonicalUnit: string,
): string {
	return (
		profile.unitDisplayOverrides?.[canonicalUnit] ??
		UNIT_DISPLAY_MAP[canonicalUnit] ??
		canonicalUnit
	);
}

export interface CompoundQuantityResult {
	primaryValue: number;
	primaryUnit: string;
	secondaryValue: number;
	secondaryUnit: string;
}

export function parseCompoundQuantity(
	input: string,
	profile: QuantityGrammarProfile,
): CompoundQuantityResult | undefined {
	for (const cp of profile.compoundPatterns ?? []) {
		const match = input.trim().match(new RegExp(cp.regexPattern, "u"));
		if (match?.groups?.primary && match?.groups?.secondary) {
			const p = Number(match.groups.primary);
			const s = Number(match.groups.secondary);
			if (Number.isFinite(p) && Number.isFinite(s)) {
				return {
					primaryValue: p,
					primaryUnit: cp.primaryUnit,
					secondaryValue: s,
					secondaryUnit: cp.secondaryUnit,
				};
			}
		}
	}
	return undefined;
}
