import type { ParserCommandMacro } from "../../store/parser/command-macros/interfaces";
import { evaluateMacroEnvelope } from "./command-macro-boundary";

export interface MacroArgumentToken {
	rawText: string;
	argumentId?: string;
	source: "typed" | "pasted" | "autocomplete";
	explicit: boolean;
	state: "assigned" | "undefined" | "partial" | "ambiguous";
	start: number;
	end: number;
}

export interface CommandMacroLexResult {
	macroName: string;
	arguments: MacroArgumentToken[];
	prose?: { rawText: string; start: number; end: number };
	diagnostics: Array<{ message: string; start: number; end: number }>;
}

function unquote(value: string): string {
	if (value.length < 2) return value;
	const quote = value[0];
	if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) return value;
	return value.slice(1, -1).replace(/\\([\\"'])/g, "$1");
}

export function lexCommandMacro(input: string, macro?: ParserCommandMacro): CommandMacroLexResult {
	const diagnostics: CommandMacroLexResult["diagnostics"] = [];
	const start = input.trimStart().startsWith("^") ? input.indexOf("^") + 1 : 0;
	let cursor = start;
	if (input[cursor] === "^") cursor++;
	const nameStart = cursor;
	while (cursor < input.length && !/\s/.test(input[cursor] ?? "")) cursor++;
	const macroName = input.slice(nameStart, cursor);
	const commandEnd = cursor;
	const tokens: MacroArgumentToken[] = [];
	const delimiter = macro?.delimiter;
	let tokenStart = -1;
	let quote = "";
	let escaped = false;
	let depth = 0;
	const emit = (end: number) => {
		if (tokenStart < 0) return;
		const raw = input.slice(tokenStart, end).trim();
		if (raw) {
			const separator = raw.indexOf("=");
			const explicit = separator > 0 && /^[A-Za-z_][\w-]*$/.test(raw.slice(0, separator));
			tokens.push({
				rawText: explicit ? unquote(raw.slice(separator + 1).trim()) : unquote(raw),
				argumentId: explicit ? raw.slice(0, separator) : undefined,
				source: "pasted",
				explicit,
				state: raw.endsWith("=") ? "partial" : "assigned",
				start: tokenStart,
				end,
			});
		}
		tokenStart = -1;
	};

	for (; cursor < input.length; cursor++) {
		const char = input[cursor] ?? "";
		if (escaped) { escaped = false; if (tokenStart < 0) tokenStart = cursor; continue; }
		if (char === "\\") { escaped = true; if (tokenStart < 0) tokenStart = cursor; continue; }
		if (quote) { if (char === quote) quote = ""; if (tokenStart < 0) tokenStart = cursor; continue; }
		if (char === '"' || char === "'") { quote = char; if (tokenStart < 0) tokenStart = cursor; continue; }
		if (char === "[") depth++;
		if (char === "]") depth = Math.max(0, depth - 1);
		if (!depth && macro?.proseBoundaryToken && input.startsWith(macro.proseBoundaryToken, cursor)) {
			emit(cursor);
			if (macro.boundary) {
				const boundary = evaluateMacroEnvelope(input.slice(0, cursor), commandEnd, macro.boundary);
				if (!boundary.accepted) diagnostics.push({ message: `macro envelope exceeded: ${boundary.reasons.join("; ")}`, start: commandEnd, end: cursor });
			}
			return { macroName, arguments: tokens, prose: { rawText: input.slice(cursor + macro.proseBoundaryToken.length).trim(), start: cursor, end: input.length }, diagnostics };
		}
		const isConfiguredDelimiter = delimiter !== undefined && input.startsWith(delimiter, cursor);
		if (!quote && !depth && (isConfiguredDelimiter || /[\s,;]/.test(char))) {
			emit(cursor);
			if (isConfiguredDelimiter) cursor += delimiter.length - 1;
			continue;
		}
		if (tokenStart < 0) tokenStart = cursor;
	}
	emit(input.length);
	if (macro?.boundary) {
		const boundary = evaluateMacroEnvelope(input, commandEnd, macro.boundary);
		if (!boundary.accepted) diagnostics.push({ message: `macro envelope exceeded: ${boundary.reasons.join("; ")}`, start: commandEnd, end: input.length });
	}
	if (quote) diagnostics.push({ message: "unterminated quote", start: tokenStart < 0 ? input.length : tokenStart, end: input.length });
	if (depth) diagnostics.push({ message: "unterminated grouped array", start: tokenStart < 0 ? input.length : tokenStart, end: input.length });
	return { macroName, arguments: tokens, diagnostics };
}
