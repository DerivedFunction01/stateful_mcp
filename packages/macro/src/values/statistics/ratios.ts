import { type NumericParseOptions, parseNumericValue } from "../numeric";
import { escapeRegex } from "../regex";

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
	if (separators.length === 0) return undefined;

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
