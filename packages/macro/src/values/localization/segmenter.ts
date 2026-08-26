import type { WordBoundaryPolicy } from "../../contracts/extension-config";

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
