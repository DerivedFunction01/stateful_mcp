export interface NumberWordScale {
	value: number;
	word: string;
	type: "minor" | "major";
}

export interface NumberWordConfig {
	atoms: Record<string, string>;
	phrases?: Array<{ value: number; word: string }>;
	scales: NumberWordScale[];
	conjunctions?: string[];
	templates?: {
		compound_tens_units?: string;
		scale_expression?: string;
	};
	protectedPatterns?: string[];
	useWordBoundaries?: boolean;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class UniversalNumberParser {
	private wordToValue: Map<string, number> = new Map();
	private captureRegex: RegExp;
	private tokenPattern: string;
	private conjunctions: Set<string>;

	constructor(private config: NumberWordConfig) {
		for (const [val, word] of Object.entries(config.atoms)) {
			this.wordToValue.set(word.toLowerCase(), parseInt(val, 10));
		}
		for (const phrase of config.phrases || []) {
			this.wordToValue.set(phrase.word.toLowerCase(), phrase.value);
		}
		for (const scale of config.scales) {
			this.wordToValue.set(scale.word.toLowerCase(), scale.value);
		}
		this.conjunctions = new Set(config.conjunctions || []);
		this.tokenPattern = "";
		this.captureRegex = this.buildCaptureRegex();
	}

	buildCaptureRegex(): RegExp {
		const validWords = Array.from(this.wordToValue.keys());
		const conjunctions = this.config.conjunctions || [];
		const allTokens = [...validWords, ...conjunctions]
			.sort((a, b) => b.length - a.length)
			.map((word) => escapeRegex(word));

		this.tokenPattern = `(?:${allTokens.join("|")})`;
		const useBoundaries = this.config.useWordBoundaries !== false;
		const bound = useBoundaries ? "\\b" : "";
		const sep = useBoundaries ? "(?:\\s+|-)+" : "\\s*";
		const fullPattern = `${bound}${this.tokenPattern}(?:${sep}${this.tokenPattern})*${bound}`;
		return new RegExp(fullPattern, "gi");
	}

	extractAndParse(
		text: string,
	): Array<{ text: string; value: number; index: number }> {
		const results: Array<{ text: string; value: number; index: number }> = [];
		const regex = this.captureRegex;
		// Using a for...of loop
		for (const match of text.matchAll(regex)) {
			const value = this.evaluateTokens(match[0]);
			results.push({ text: match[0], value, index: match.index! });
		}
		return results;
	}

	evaluateTokens(numberString: string): number {
		const tokenRegex = new RegExp(this.tokenPattern, "gi");
		const tokens =
			numberString.match(tokenRegex)?.map((t) => t.toLowerCase()) || [];

		let total = 0;
		let blockTotal = 0;
		let temp = 0;

		for (const token of tokens) {
			if (this.conjunctions.has(token)) continue;
			const value = this.wordToValue.get(token);
			if (value === undefined) continue;

			const scaleObj = this.config.scales.find(
				(s) => s.word.toLowerCase() === token,
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

export class NumberWordNormalizer {
	constructor(private config: NumberWordConfig | null) {}

	normalize(text: string): {
		normalizedText: string;
		replacements: Array<{ original: string; value: number }>;
	} {
		if (!this.config) {
			return { normalizedText: text, replacements: [] };
		}

		const parser = new UniversalNumberParser(this.config);
		const matches = parser.extractAndParse(text);
		if (matches.length === 0) {
			return { normalizedText: text, replacements: [] };
		}

		const replacements: Array<{ original: string; value: number }> = [];
		let normalizedText = text;

		for (const match of matches) {
			replacements.push({ original: match.text, value: match.value });
			normalizedText = normalizedText.replace(match.text, String(match.value));
		}

		return { normalizedText, replacements };
	}
}
