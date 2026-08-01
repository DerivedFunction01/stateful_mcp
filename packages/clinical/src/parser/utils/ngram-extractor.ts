import type { AutocompleteSuggestionKind } from "../../store/reference/auto-complete/interfaces";

export interface NgramExtractionResult {
	ngram: string;
	n: 1 | 2 | 3;
	kind: AutocompleteSuggestionKind;
	templateId?: string;
	slotName?: string;
}

const MIN_NGRAM_LENGTH = 2;
const DELIMITER_PATTERN = /[,\s;:.!?()[\]]+/;

function tokenize(text: string): string[] {
	return text
		.split(DELIMITER_PATTERN)
		.map((t) => t.trim().toLowerCase())
		.filter((t) => t.length >= MIN_NGRAM_LENGTH);
}

export function extractNgrams(
	rawText: string,
	kind: AutocompleteSuggestionKind = "prose",
	ctx?: { templateId?: string; slotName?: string },
): NgramExtractionResult[] {
	const tokens = tokenize(rawText);
	const results = new Map<string, NgramExtractionResult>();

	// Uni-grams
	for (const token of tokens) {
		const key = `${token}:1:${kind}`;
		if (!results.has(key)) {
			results.set(key, {
				ngram: token,
				n: 1,
				kind,
				templateId: ctx?.templateId,
				slotName: ctx?.slotName,
			});
		}
	}

	// Bi-grams
	for (let i = 0; i < tokens.length - 1; i++) {
		const ngram = `${tokens[i]} ${tokens[i + 1]}`;
		const key = `${ngram}:2:${kind}`;
		if (!results.has(key)) {
			results.set(key, {
				ngram,
				n: 2,
				kind,
				templateId: ctx?.templateId,
				slotName: ctx?.slotName,
			});
		}
	}

	// Tri-grams
	for (let i = 0; i < tokens.length - 2; i++) {
		const ngram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
		const key = `${ngram}:3:${kind}`;
		if (!results.has(key)) {
			results.set(key, {
				ngram,
				n: 3,
				kind,
				templateId: ctx?.templateId,
				slotName: ctx?.slotName,
			});
		}
	}

	return Array.from(results.values());
}
