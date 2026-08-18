import type {
	DigitNormalizationPolicy,
	LocalizationPolicyConfig,
	NumberWordConfig,
	WordBoundaryPolicy,
} from "../contracts/extension-config";
import { escapeRegex } from "./regex";

const UNICODE_DIGIT_ZERO_BASES: readonly number[] = [
	0x0030, // ASCII 0..9
	0x0660, // Arabic-Indic
	0x06f0, // Eastern Arabic-Indic / Persian
	0x07c0, // NKo
	0x0966, // Devanagari
	0x09e6, // Bengali
	0x0a66, // Gurmukhi
	0x0ae6, // Gujarati
	0x0b66, // Oriya
	0x0be6, // Tamil
	0x0c66, // Telugu
	0x0ce6, // Kannada
	0x0d66, // Malayalam
	0x0de6, // Sinhala
	0x0e50, // Thai
	0x0ed0, // Lao
	0x0f20, // Tibetan
	0x1040, // Myanmar
	0x1090, // Myanmar Shan
	0x17e0, // Khmer
	0x1810, // Mongolian
	0x1946, // Limbu
	0x19d0, // New Tai Lue
	0x1a80, // Tai Tham Hora
	0x1a90, // Tai Tham Tham
	0x1b50, // Balinese
	0x1bb0, // Sundanese
	0x1c40, // Lepcha
	0x1c50, // Ol Chiki
	0xa620, // Vai
	0xa8d0, // Saurashtra
	0xa900, // Kayah Li
	0xa9d0, // Javanese
	0xaa50, // Cham
	0xabf0, // Meetei Mayek
	0xff10, // Fullwidth
	0x104a0, // Osmanya
	0x10d30, // Hanifi Rohingya
	0x11066, // Brahmi
	0x110f0, // Sora Sompeng
	0x11136, // Chakma
	0x111d0, // Sharada
	0x112e0, // Khudawadi
	0x11450, // Newa
	0x114d0, // Tirhuta
	0x11650, // Modi
	0x116c0, // Takri
	0x11730, // Ahom
	0x118e0, // Warang Citi
	0x11c50, // Bhaiksuki
	0x11d50, // Masaram Gondi
	0x11da0, // Gunjala Gondi
	0x16a60, // Mro
	0x16b50, // Pahawh Hmong
	0x1d7ce, // Math bold 0
	0x1d7d8, // Math double-struck 0
	0x1d7e2, // Math sans-serif 0
	0x1d7ec, // Math sans-serif bold 0
	0x1d7f6, // Math monospace 0
];

function findDigitBase(cp: number): number | undefined {
	let low = 0;
	let high = UNICODE_DIGIT_ZERO_BASES.length - 1;
	while (low <= high) {
		const mid = (low + high) >>> 1;
		const base = UNICODE_DIGIT_ZERO_BASES[mid]!;
		if (cp >= base && cp <= base + 9) {
			return base;
		}
		if (cp < base) {
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}
	return undefined;
}

/**
 * Automatically normalizes any Unicode decimal digit across all 60+ world numeral scripts
 * (Arabic-Indic, Persian, Devanagari, Bengali, Thai, Khmer, Tibetan, Ethiopic, Fullwidth, etc.) to ASCII '0'..'9'.
 */
export function normalizeUnicodeDigits(
	input: string,
	policy: DigitNormalizationPolicy = "auto",
	customMap?: Readonly<Record<string, string>>,
): string {
	if (policy === "ascii-only") return input;

	if (policy === "custom" && customMap) {
		let result = input;
		for (const [from, to] of Object.entries(customMap)) {
			result = result.replaceAll(from, to);
		}
		return result;
	}

	// Auto: Normalize NFKC compatibility forms and map all \p{Nd} decimal digits to ASCII '0'..'9'
	return input.normalize("NFKC").replace(/\p{Nd}/gu, (char) => {
		const cp = char.codePointAt(0);
		if (cp === undefined) return char;
		const base = findDigitBase(cp);
		return base !== undefined ? String(cp - base) : char;
	});
}

/**
 * Universal Word Segmenter that implements Unicode Annex #29 text segmentation
 * to reliably detect word boundaries across all world languages (including unspaced scripts like Chinese and Japanese).
 */
export class UniversalWordSegmenter {
	private readonly segmenter?: Intl.Segmenter;
	private readonly policy: WordBoundaryPolicy;
	private readonly beforeRegex?: RegExp;
	private readonly afterRegex?: RegExp;

	constructor(
		public readonly locale = "en",
		policy: WordBoundaryPolicy = "standard",
		customBoundary?: { readonly before?: string; readonly after?: string },
	) {
		this.policy = policy;

		if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
			try {
				this.segmenter = new Intl.Segmenter(locale, { granularity: "word" });
			} catch {
				this.segmenter = undefined;
			}
		}

		if (customBoundary?.before) {
			try {
				this.beforeRegex = new RegExp(customBoundary.before, "u");
			} catch {
				this.beforeRegex = undefined;
			}
		}
		if (customBoundary?.after) {
			try {
				this.afterRegex = new RegExp(customBoundary.after, "u");
			} catch {
				this.afterRegex = undefined;
			}
		}
	}

	isWordBoundary(text: string, start: number, end: number): boolean {
		if (start === 0 && end === text.length) return true;

		if (this.policy === "loose-substring") return true;

		if (this.policy === "custom") {
			const beforeOk =
				start === 0 ||
				(this.beforeRegex ? this.beforeRegex.test(text.slice(0, start)) : true);
			const afterOk =
				end === text.length ||
				(this.afterRegex ? this.afterRegex.test(text.slice(end)) : true);
			return beforeOk && afterOk;
		}

		if (this.policy === "strict-whitespace") {
			const startOk = start === 0 || /\s/u.test(text[start - 1]!);
			const endOk = end === text.length || /\s/u.test(text[end]!);
			return startOk && endOk;
		}

		// Standard / CJK-aware:
		// 1. If surrounded by whitespace or at text edges
		const startIsWhitespace = start === 0 || /\s/u.test(text[start - 1]!);
		const endIsWhitespace = end === text.length || /\s/u.test(text[end]!);
		if (startIsWhitespace && endIsWhitespace) return true;

		// 2. If surrounded by CJK ideographs/kana (Han, Hiragana, Katakana, Hangul)
		const prevChar = start > 0 ? text[start - 1]! : "";
		const nextChar = end < text.length ? text[end]! : "";
		const isCjkPrev =
			/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
				prevChar,
			);
		const isCjkNext =
			/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
				nextChar,
			);
		const isCjkTarget =
			/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
				text.slice(start, end),
			);

		if (isCjkTarget || (isCjkPrev && isCjkNext)) return true;

		// 3. Fallback to Intl.Segmenter boundary checks if available
		if (this.segmenter) {
			const segments = Array.from(this.segmenter.segment(text));
			const isStartBoundary =
				start === 0 || segments.some((s) => s.index === start);
			const isEndBoundary =
				end === text.length || segments.some((s) => s.index === end);
			if (isStartBoundary && isEndBoundary) return true;
		}

		// 4. Default Unicode lookaround boundary: boundary between non-letter and letter
		const startLetter = /[\p{L}\p{N}]/u.test(prevChar);
		const targetFirstLetter = /[\p{L}\p{N}]/u.test(text[start] ?? "");
		const targetLastLetter = /[\p{L}\p{N}]/u.test(text[end - 1] ?? "");
		const endLetter = /[\p{L}\p{N}]/u.test(nextChar);

		const startBoundaryOk = !startLetter || !targetFirstLetter;
		const endBoundaryOk = !targetLastLetter || !endLetter;
		return startBoundaryOk && endBoundaryOk;
	}
}

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

export function resolveQuotePairs(
	localization?: LocalizationPolicyConfig,
	syntaxQuoteCharacters?: readonly string[],
): Array<[open: string, close: string]> {
	if (localization?.quotePairs && localization.quotePairs.length > 0) {
		return localization.quotePairs.map(([o, c]) => [o, c]);
	}
	if (syntaxQuoteCharacters && syntaxQuoteCharacters.length > 0) {
		return syntaxQuoteCharacters.map((q) => [q, q]);
	}
	// Standard universal quote pairs: ASCII double/single, French/Russian guillemets, CJK corner brackets, typographic curly quotes
	return [
		['"', '"'],
		["'", "'"],
		["«", "»"],
		["“", "”"],
		["‘", "’"],
		["「", "」"],
		["『", "』"],
	];
}

export function resolveGroupBrackets(
	localization?: LocalizationPolicyConfig,
	groupOpen?: string,
	groupClose?: string,
): Array<[open: string, close: string]> {
	if (localization?.groupBrackets && localization.groupBrackets.length > 0) {
		return localization.groupBrackets.map(([o, c]) => [o, c]);
	}
	if (groupOpen && groupClose) {
		return [[groupOpen, groupClose]];
	}
	return [
		["(", ")"],
		["（", "）"],
		["[", "]"],
		["【", "】"],
	];
}
