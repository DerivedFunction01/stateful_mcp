import type { MacroDiagnostic, MacroSpan } from "../contracts/input";
import type { MacroSyntax } from "../contracts/syntax";

export interface NamedSegment {
	name: string;
	nameSpan: MacroSpan;
	equalsOffset: number;
	value: string;
	start: number;
	valueStart: number;
	end: number;
	sourceSpan: MacroSpan;
	valueSpan: MacroSpan;
}

export interface ScannerSyntax {
	readonly argumentDelimiter?: string;
	readonly quoteCharacters?: readonly string[];
	readonly groupOpen?: string;
	readonly groupClose?: string;
	readonly expressionToken?: string;
	readonly conceptToken?: string;
	readonly conceptCodeSeparator?: string;
}

const DEFAULT_QUOTE_CHARACTERS = ['"', "'"] as const;

export function resolveQuoteCharacters(
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): Set<string> {
	if (syntax?.quoteCharacters && syntax.quoteCharacters.length > 0) {
		return new Set(syntax.quoteCharacters);
	}
	return new Set(DEFAULT_QUOTE_CHARACTERS);
}

export function scanNamedAssignments(
	raw: string,
	start: number,
	diagnostics: MacroDiagnostic[],
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): NamedSegment[] {
	const delimiter = syntax?.argumentDelimiter;
	const quoteCharacters = resolveQuoteCharacters(syntax);
	const markers: Array<{
		name: string;
		nameSpan: MacroSpan;
		start: number;
		equals: number;
	}> = [];

	let quote = "";
	let escaped = false;
	let depth = 0;

	for (let index = start; index < raw.length; index += 1) {
		const char = raw[index]!;

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === "\\" && quote) {
			escaped = true;
			continue;
		}

		if (quote) {
			if (char === quote) quote = "";
			continue;
		}

		if (quoteCharacters.has(char)) {
			quote = char;
			continue;
		}

		if (syntax?.groupOpen && char === syntax.groupOpen) {
			depth += 1;
			continue;
		}

		if (syntax?.groupClose && char === syntax.groupClose) {
			depth = Math.max(0, depth - 1);
			continue;
		}

		if (!depth && delimiter && raw.startsWith(delimiter, index)) {
			index += delimiter.length - 1;
			continue;
		}

		const followsDelimiter =
			delimiter !== undefined &&
			raw.slice(index - delimiter.length, index) === delimiter;

		const isBoundary =
			index === start || /\s/u.test(raw[index - 1]!) || followsDelimiter;

		if (depth || !isBoundary) {
			continue;
		}

		const match = /^([A-Za-z_][\w-]*)\s*=/.exec(raw.slice(index));
		if (match) {
			const name = match[1]!;
			const equals = index + match[0].length - 1;
			markers.push({
				name,
				nameSpan: { start: index, end: index + name.length },
				start: index,
				equals,
			});
			// Advance index to the equals sign so we don't re-match within the assignment
			index = equals;
		}
	}

	if (quote) {
		diagnostics.push({
			code: "UNTERMINATED_QUOTE",
			message: "Unterminated quote",
			start,
			end: raw.length,
		});
	}

	if (depth > 0) {
		diagnostics.push({
			code: "UNTERMINATED_GROUP",
			message: "Unterminated grouped value",
			start,
			end: raw.length,
		});
	}

	return markers.map((marker, index) => {
		const nextStart = markers[index + 1]?.start ?? raw.length;
		let sourceEnd =
			delimiter &&
			raw.slice(nextStart - delimiter.length, nextStart) === delimiter
				? nextStart - delimiter.length
				: nextStart;

		const sourceStart = skipWhitespace(raw, marker.equals + 1);
		sourceEnd = trimEnd(raw, sourceStart, sourceEnd);

		let valueStart = sourceStart;
		let valueEnd = sourceEnd;

		if (valueEnd > valueStart) {
			const first = raw[valueStart];
			const last = raw[valueEnd - 1];
			if (
				first &&
				quoteCharacters.has(first) &&
				last === first &&
				valueEnd - valueStart >= 2
			) {
				valueStart += 1;
				valueEnd -= 1;
			}
		}

		return {
			name: marker.name,
			nameSpan: marker.nameSpan,
			equalsOffset: marker.equals,
			value: raw.slice(valueStart, valueEnd),
			start: marker.start,
			valueStart,
			end: sourceEnd,
			sourceSpan: { start: sourceStart, end: sourceEnd },
			valueSpan: { start: valueStart, end: valueEnd },
		};
	});
}

export function splitByDelimiter(
	raw: string,
	region: MacroSpan,
	delimiter: string,
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): MacroSpan[] {
	const parts: MacroSpan[] = [];
	let start = region.start;
	let quote = "";
	let escaped = false;
	let depth = 0;
	const quoteCharacters = resolveQuoteCharacters(syntax);

	for (let index = region.start; index < region.end; index += 1) {
		const char = raw[index]!;

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === "\\" && quote) {
			escaped = true;
			continue;
		}

		if (quote) {
			if (char === quote) quote = "";
			continue;
		}

		if (quoteCharacters.has(char)) {
			quote = char;
			continue;
		}

		if (syntax?.groupOpen && char === syntax.groupOpen) {
			depth += 1;
			continue;
		}

		if (syntax?.groupClose && char === syntax.groupClose) {
			depth = Math.max(0, depth - 1);
			continue;
		}

		if (!depth && raw.startsWith(delimiter, index)) {
			const end = trimEnd(raw, start, index);
			if (skipWhitespace(raw, start) < end) {
				parts.push({ start: skipWhitespace(raw, start), end });
			}
			index += delimiter.length - 1;
			start = index + 1;
		}
	}

	const end = trimEnd(raw, start, region.end);
	if (skipWhitespace(raw, start) < end) {
		parts.push({ start: skipWhitespace(raw, start), end });
	}

	return parts;
}

export function splitListItems(
	text: string,
	offset: number,
	delimiter: string,
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): Array<{ rawValue: string; start: number; end: number }> {
	const items: Array<{ rawValue: string; start: number; end: number }> = [];
	let start = 0;
	let quote = "";
	let escaped = false;
	let depth = 0;
	const quoteCharacters = resolveQuoteCharacters(syntax);

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]!;

		if (escaped) {
			escaped = false;
			continue;
		}

		if (char === "\\" && quote) {
			escaped = true;
			continue;
		}

		if (quote) {
			if (char === quote) quote = "";
			continue;
		}

		if (quoteCharacters.has(char)) {
			quote = char;
			continue;
		}

		if (syntax?.groupOpen && char === syntax.groupOpen) {
			depth += 1;
			continue;
		}

		if (syntax?.groupClose && char === syntax.groupClose) {
			depth = Math.max(0, depth - 1);
			continue;
		}

		if (!depth && text.startsWith(delimiter, index)) {
			pushListItem(items, text, start, index, offset);
			index += delimiter.length - 1;
			start = index + 1;
		}
	}

	pushListItem(items, text, start, text.length, offset);
	return items;
}

function pushListItem(
	items: Array<{ rawValue: string; start: number; end: number }>,
	text: string,
	start: number,
	end: number,
	offset: number,
): void {
	const valueStart = skipWhitespace(text, start);
	const valueEnd = trimEnd(text, valueStart, end);
	if (valueStart < valueEnd) {
		items.push({
			rawValue: text.slice(valueStart, valueEnd),
			start: offset + valueStart,
			end: offset + valueEnd,
		});
	}
}

export function tokenizePositionalTokens(
	raw: string,
	region: MacroSpan,
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): MacroSpan[] {
	const tokens: MacroSpan[] = [];
	let tokenStart = skipWhitespace(raw, region.start);
	while (tokenStart < region.end) {
		const tokenEnd = scanUntilWhitespaceOrBoundary(
			raw,
			tokenStart,
			region.end,
			syntax,
		);
		if (tokenEnd > tokenStart) {
			tokens.push({ start: tokenStart, end: tokenEnd });
		}
		tokenStart = skipWhitespace(raw, tokenEnd);
	}
	return tokens;
}

function scanUntilWhitespaceOrBoundary(
	text: string,
	start: number,
	limit: number,
	_syntax?: Partial<MacroSyntax> | ScannerSyntax,
): number {
	let index = start;
	while (index < limit && !/\s/u.test(text[index]!)) {
		index += 1;
	}
	return index;
}

export function scanUntilWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && !/\s/u.test(text[index]!)) {
		index += 1;
	}
	return index;
}

export function skipWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && /\s/u.test(text[index]!)) {
		index += 1;
	}
	return index;
}

export function trimEnd(text: string, start: number, end: number): number {
	let index = end;
	while (index > start && /\s/u.test(text[index - 1]!)) {
		index -= 1;
	}
	return index;
}

export function uniqueMatches(
	matches: readonly import("../contracts/matching").MacroArgumentMatch[],
): import("../contracts/matching").MacroArgumentMatch[] {
	const seen = new Set<string>();
	return matches.filter((match) => {
		const key = `${match.argumentId}:${match.occurrence ?? 0}:${match.extraction.start}:${match.extraction.end}:${match.source}:${match.sourceId ?? ""}:${match.formId ?? ""}:${match.rawValue}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
