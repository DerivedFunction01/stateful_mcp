import type {
	ExtendedNumberWordConfig,
	NumberWordConfig,
} from "../../contracts/extension-config";
import { escapeRegex } from "../regex";

/**
 * Universal written number word normalizer (e.g. "three hundred and twenty five" -> 325, "trescientos veinticinco" -> 325).
 */
export class UniversalNumberParser {
	private readonly wordToValue = new Map<string, number>();
	private readonly tokenPattern: string;
	private readonly conjunctions: Set<string>;
	private readonly captureRegex: RegExp;

	constructor(private readonly config: NumberWordConfig) {
		for (const [val, word] of Object.entries(config.atoms)) {
			this.wordToValue.set(word.toLocaleLowerCase(), parseInt(val, 10));
		}
		for (const scale of config.scales) {
			this.wordToValue.set(scale.word.toLocaleLowerCase(), scale.value);
		}
		this.conjunctions = new Set(
			(config.conjunctions ?? []).map((c) => c.toLocaleLowerCase()),
		);

		const validWords = Array.from(this.wordToValue.keys());
		const allTokens = [...validWords, ...(config.conjunctions ?? [])]
			.sort((a, b) => b.length - a.length)
			.map(escapeRegex);

		this.tokenPattern = `(?:${allTokens.join("|")})`;
		const useBoundaries = config.useWordBoundaries !== false;
		const bound = useBoundaries ? "(?<![\\p{L}\\p{N}])" : "";
		const boundEnd = useBoundaries ? "(?![\\p{L}\\p{N}])" : "";
		const sep = "(?:\\s+|-)+";
		const fullPattern = `${bound}${this.tokenPattern}(?:${sep}${this.tokenPattern})*${boundEnd}`;
		this.captureRegex = new RegExp(fullPattern, "giu");
	}

	normalize(text: string): {
		normalizedText: string;
		matches: Array<{ original: string; value: number }>;
	} {
		const matches: Array<{ original: string; value: number }> = [];
		const normalizedText = text.replace(this.captureRegex, (matched) => {
			const value = this.evaluateTokens(matched);
			if (Number.isFinite(value)) {
				matches.push({ original: matched, value });
				return String(value);
			}
			return matched;
		});

		return { normalizedText, matches };
	}

	private evaluateTokens(numberString: string): number {
		const tokenRegex = new RegExp(this.tokenPattern, "giu");
		const tokens =
			numberString.match(tokenRegex)?.map((t) => t.toLocaleLowerCase()) ?? [];

		let total = 0;
		let blockTotal = 0;
		let temp = 0;

		for (const token of tokens) {
			if (this.conjunctions.has(token)) continue;
			const value = this.wordToValue.get(token);
			if (value === undefined) continue;

			const scaleObj = this.config.scales.find(
				(s) => s.word.toLocaleLowerCase() === token,
			);

			if (!scaleObj) {
				temp += value;
			} else if (scaleObj.type === "minor") {
				blockTotal += (temp === 0 ? 1 : temp) * scaleObj.value;
				temp = 0;
			} else if (scaleObj.type === "major") {
				blockTotal += temp;
				total += (blockTotal === 0 ? 1 : blockTotal) * scaleObj.value;
				blockTotal = 0;
				temp = 0;
			}
		}

		return total + blockTotal + temp;
	}
}

export interface ParsedOrdinal {
	readonly value: number;
	readonly rawText: string;
	readonly sourceForm: "word" | "numeric-prefix" | "numeric-suffix";
	readonly matchedSpelling: string;
}

/**
 * Resolves only explicitly configured ordinal spellings and affixes. This is
 * intentionally separate from cardinal number-word normalization.
 */
export function parseOrdinalValue(
	input: string,
	config: ExtendedNumberWordConfig,
): ParsedOrdinal | undefined {
	const ordinal = config.ordinals;
	if (!ordinal) return undefined;
	const rawText = input.trim();
	if (!rawText) return undefined;

	for (const [valueText, configured] of Object.entries(
		ordinal.ordinalAtoms ?? {},
	)) {
		const value = Number(valueText);
		if (!Number.isInteger(value) || !Number.isFinite(value)) continue;
		const spellings =
			typeof configured === "string" ? [configured] : configured;
		for (const spelling of spellings) {
			if (rawText === spelling) {
				return {
					value,
					rawText,
					sourceForm: "word",
					matchedSpelling: spelling,
				};
			}
		}
	}

	if (ordinal.prefix && rawText.startsWith(ordinal.prefix)) {
		const suffix = rawText.slice(ordinal.prefix.length);
		if (/^\d+$/u.test(suffix)) {
			return {
				value: Number(suffix),
				rawText,
				sourceForm: "numeric-prefix",
				matchedSpelling: ordinal.prefix,
			};
		}
	}
	if (ordinal.suffix && rawText.endsWith(ordinal.suffix)) {
		const prefix = rawText.slice(0, -ordinal.suffix.length);
		if (/^\d+$/u.test(prefix)) {
			return {
				value: Number(prefix),
				rawText,
				sourceForm: "numeric-suffix",
				matchedSpelling: ordinal.suffix,
			};
		}
	}
	const numeric = /^\d+$/u.exec(rawText)?.[0];
	if (!numeric) return undefined;
	const value = Number(numeric);
	if (!Number.isSafeInteger(value)) return undefined;
	return undefined;
}
