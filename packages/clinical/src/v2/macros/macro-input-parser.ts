import type {
	MacroArgumentInput,
	MacroInput,
	MacroSourceLine,
} from "./macro-binding";

export interface ParseMacroLineOptions {
	macroStartToken?: string;
}

export function parseMacroLine(
	raw: string,
	lineNumber: number = 0,
	options: ParseMacroLineOptions = {},
): MacroInput | null {
	const macroStartToken = options.macroStartToken ?? "^";

	const trimmed = raw.trimStart();
	if (!trimmed.startsWith(macroStartToken)) {
		return null;
	}

	const afterStart = trimmed.slice(macroStartToken.length);
	if (!afterStart.length) {
		return null;
	}

	const macroNameEnd = findTokenBoundary(afterStart, 0);
	const macroName = afterStart.slice(0, macroNameEnd);
	if (!macroName) {
		return null;
	}

	const argsRaw = afterStart.slice(macroNameEnd).trim();
	const arguments_: MacroArgumentInput[] = [];
	const sourceLines: MacroSourceLine[] = [
		{ line: lineNumber, raw, macroName },
	];

	if (argsRaw.length > 0) {
		tokenizeArguments(argsRaw, lineNumber, arguments_);
	}

	return {
		macroName,
		sourceLines,
		arguments: arguments_,
	};
}

function findTokenBoundary(text: string, start: number): number {
	for (let i = start; i < text.length; i++) {
		const ch = text[i]!;
		if (ch === " " || ch === "\t") {
			return i;
		}
		if (ch === "=") {
			return i;
		}
	}
	return text.length;
}

function tokenizeArguments(
	raw: string,
	lineNumber: number,
	out: MacroArgumentInput[],
): void {
	for (const token of scanArgumentTokens(raw)) {
		const eqIdx = indexOfEquals(token);
		if (eqIdx !== -1 && eqIdx > 0) {
			const name = token.slice(0, eqIdx);
			const rawValue = unquote(token.slice(eqIdx + 1));
			out.push({
				name,
				position: out.length,
				rawValue,
				source: "named",
				line: lineNumber,
			});
		} else {
			out.push({
				position: out.length,
				rawValue: unquote(token),
				source: "positional",
				line: lineNumber,
			});
		}
	}
}

/** Find the first `=` that separates a name from its value (skips quoted regions). */
function indexOfEquals(token: string): number {
	let quote: string | null = null;
	let escaped = false;
	for (let i = 0; i < token.length; i++) {
		const ch = token[i]!;
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\" && quote) {
			escaped = true;
			continue;
		}
		if (ch === "'" || ch === '"') {
			if (quote === ch) {
				quote = null;
			} else if (quote === null) {
				quote = ch;
			}
			continue;
		}
		if (ch === "=" && quote === null) {
			return i;
		}
	}
	return -1;
}

/** Scan whitespace-separated argument tokens, treating quoted segments (even after `=`) as atomic. */
function scanArgumentTokens(text: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	while (i < text.length) {
		i = skipWhitespace(text, i);
		if (i >= text.length) break;
		const start = i;
		let quote: string | null = null;
		let escaped = false;
		while (i < text.length) {
			const ch = text[i]!;
			if (escaped) {
				escaped = false;
				i++;
				continue;
			}
			if (ch === "\\" && quote) {
				escaped = true;
				i++;
				continue;
			}
			if (ch === "'" || ch === '"') {
				if (quote === ch) {
					quote = null;
				} else if (quote === null) {
					quote = ch;
				}
				i++;
				continue;
			}
			if ((ch === " " || ch === "\t") && quote === null) {
				break;
			}
			i++;
		}
		tokens.push(text.slice(start, i));
	}
	return tokens;
}

function unquote(value: string): string {
	let result = value;
	if (
		result.length > 0 &&
		(result[0] === "'" || result[0] === '"') && result[result.length - 1] === result[0]
	) {
		return result.slice(1, -1).replace(/\\(['"])/g, "$1");
	}
	if (result.length > 0 && (result[0] === "'" || result[0] === '"')) {
		return result.slice(1);
	}
	return result;
}

function skipWhitespace(text: string, start: number): number {
	let i = start;
	while (i < text.length && (text[i] === " " || text[i] === "\t")) {
		i++;
	}
	return i;
}
