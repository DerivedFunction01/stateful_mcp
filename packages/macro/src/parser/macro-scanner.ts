import type { MacroDiagnostic, MacroSpan } from "../contracts/input";
import {
	type MacroSyntax,
	resolveArgumentDelimiter,
} from "../contracts/syntax";

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
	readonly macroStartToken?: string;
	readonly argumentDelimiter?: string;
	readonly quoteCharacters?: readonly string[];
	readonly quotePairs?: readonly (readonly [open: string, close: string])[];
	readonly groupOpen?: string;
	readonly groupClose?: string;
	readonly groupPairs?: readonly (readonly [open: string, close: string])[];
	readonly expressionToken?: string;
	readonly conceptToken?: string;
	readonly conceptCodeSeparator?: string;
}

export interface LexicalState {
	index: number;
	char: string;
	quote: string;
	escaped: boolean;
	depth: number;
	isInsideQuoteOrGroup: boolean;
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

export function resolveQuoteOpenMap(
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): Map<string, string> {
	const map = new Map<string, string>();
	if (syntax?.quotePairs && syntax.quotePairs.length > 0) {
		for (const [open, close] of syntax.quotePairs) {
			map.set(open, close);
		}
		return map;
	}
	if (syntax?.quoteCharacters && syntax.quoteCharacters.length > 0) {
		for (const q of syntax.quoteCharacters) {
			map.set(q, q);
		}
		return map;
	}
	for (const q of DEFAULT_QUOTE_CHARACTERS) {
		map.set(q, q);
	}
	return map;
}

export function resolveGroupMaps(
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): { openSet: Set<string>; closeSet: Set<string> } {
	const openSet = new Set<string>();
	const closeSet = new Set<string>();
	if (syntax?.groupPairs && syntax.groupPairs.length > 0) {
		for (const [open, close] of syntax.groupPairs) {
			openSet.add(open);
			closeSet.add(close);
		}
	}
	if (syntax?.groupOpen) openSet.add(syntax.groupOpen);
	if (syntax?.groupClose) closeSet.add(syntax.groupClose);
	return { openSet, closeSet };
}

export { resolveArgumentDelimiter };

export function traverseLexicalTokens(
	raw: string,
	region: MacroSpan,
	syntax: ScannerSyntax | Partial<MacroSyntax> | undefined,
	callback: (state: LexicalState) => boolean | void,
	diagnostics?: MacroDiagnostic[],
): { quote: string; depth: number } {
	const quoteOpenMap = resolveQuoteOpenMap(syntax);
	const { openSet: groupOpenSet, closeSet: groupCloseSet } =
		resolveGroupMaps(syntax);
	let quote = "";
	let escaped = false;
	let depth = 0;

	for (let index = region.start; index < region.end; index += 1) {
		const char = raw[index]!;

		if (escaped) {
			escaped = false;
			const shouldContinue = callback({
				index,
				char,
				quote,
				escaped: true,
				depth,
				isInsideQuoteOrGroup: Boolean(quote || depth > 0),
			});
			if (shouldContinue === false) break;
			continue;
		}

		if (char === "\\" && (quote || groupOpenSet.size > 0)) {
			escaped = true;
			const shouldContinue = callback({
				index,
				char,
				quote,
				escaped: false,
				depth,
				isInsideQuoteOrGroup: Boolean(quote || depth > 0),
			});
			if (shouldContinue === false) break;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = "";
			}
			const shouldContinue = callback({
				index,
				char,
				quote,
				escaped: false,
				depth,
				isInsideQuoteOrGroup: true,
			});
			if (shouldContinue === false) break;
			continue;
		}

		if (quoteOpenMap.has(char)) {
			quote = quoteOpenMap.get(char)!;
			const shouldContinue = callback({
				index,
				char,
				quote,
				escaped: false,
				depth,
				isInsideQuoteOrGroup: true,
			});
			if (shouldContinue === false) break;
			continue;
		}

		if (groupOpenSet.has(char)) {
			depth += 1;
			const shouldContinue = callback({
				index,
				char,
				quote,
				escaped: false,
				depth,
				isInsideQuoteOrGroup: true,
			});
			if (shouldContinue === false) break;
			continue;
		}

		if (groupCloseSet.has(char)) {
			depth = Math.max(0, depth - 1);
			const shouldContinue = callback({
				index,
				char,
				quote,
				escaped: false,
				depth,
				isInsideQuoteOrGroup: Boolean(depth > 0),
			});
			if (shouldContinue === false) break;
			continue;
		}

		const shouldContinue = callback({
			index,
			char,
			quote: "",
			escaped: false,
			depth,
			isInsideQuoteOrGroup: Boolean(depth > 0),
		});
		if (shouldContinue === false) break;
	}

	if (diagnostics) {
		if (quote) {
			diagnostics.push({
				code: "UNTERMINATED_QUOTE",
				messageKey: "errors.unterminatedQuote",
				start: region.start,
				end: region.end,
			});
		}
		if (depth > 0) {
			diagnostics.push({
				code: "UNTERMINATED_GROUP",
				messageKey: "errors.unterminatedGroup",
				start: region.start,
				end: region.end,
			});
		}
	}

	return { quote, depth };
}

export function scanNamedAssignments(
	raw: string,
	start: number,
	diagnostics: MacroDiagnostic[],
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): NamedSegment[] {
	const delimiter = resolveArgumentDelimiter(syntax);
	const quoteCharacters = resolveQuoteCharacters(syntax);
	const markers: Array<{
		name: string;
		nameSpan: MacroSpan;
		start: number;
		equals: number;
	}> = [];

	let skipUntil = -1;

	traverseLexicalTokens(
		raw,
		{ start, end: raw.length },
		syntax,
		(state) => {
			if (state.index <= skipUntil) return;

			if (state.isInsideQuoteOrGroup) return;

			const followsDelimiter =
				delimiter !== undefined &&
				raw.slice(state.index - delimiter.length, state.index) === delimiter;

			const isBoundary =
				state.index === start ||
				/\s/u.test(raw[state.index - 1]!) ||
				followsDelimiter;

			if (!isBoundary) return;

			const match = /^([A-Za-z_][\w-]*)\s*=/.exec(raw.slice(state.index));
			if (match) {
				const name = match[1]!;
				const equals = state.index + match[0].length - 1;
				markers.push({
					name,
					nameSpan: {
						start: state.index,
						end: state.index + name.length,
					},
					start: state.index,
					equals,
				});
				skipUntil = equals;
			}
		},
		diagnostics,
	);

	return markers.map((marker, index) => {
		const nextStart = markers[index + 1]?.start ?? raw.length;
		const limit =
			delimiter &&
			raw.slice(nextStart - delimiter.length, nextStart) === delimiter
				? nextStart - delimiter.length
				: nextStart;

		const sourceStart = skipWhitespace(raw, marker.equals + 1);

		if (sourceStart >= limit) {
			return {
				name: marker.name,
				nameSpan: marker.nameSpan,
				equalsOffset: marker.equals,
				value: "",
				start: marker.start,
				valueStart: sourceStart,
				end: sourceStart,
				sourceSpan: { start: sourceStart, end: sourceStart },
				valueSpan: { start: sourceStart, end: sourceStart },
			};
		}

		const firstChar = raw[sourceStart]!;
		if (quoteCharacters.has(firstChar)) {
			let closedIndex = -1;
			traverseLexicalTokens(
				raw,
				{ start: sourceStart, end: limit },
				syntax,
				(state) => {
					if (state.index === sourceStart) return;
					if (
						state.quote === "" &&
						state.char === firstChar &&
						!state.escaped
					) {
						closedIndex = state.index;
						return false;
					}
				},
			);

			if (closedIndex !== -1) {
				const sourceEnd = closedIndex + 1;
				const valueStart = sourceStart + 1;
				const valueEnd = closedIndex;
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
			}
		}

		if (syntax?.groupOpen && firstChar === syntax.groupOpen) {
			let closedIndex = -1;
			traverseLexicalTokens(
				raw,
				{ start: sourceStart, end: limit },
				syntax,
				(state) => {
					if (state.index === sourceStart) return;
					if (state.depth === 0) {
						closedIndex = state.index;
						return false;
					}
				},
			);

			if (closedIndex !== -1) {
				const sourceEnd = closedIndex + 1;
				return {
					name: marker.name,
					nameSpan: marker.nameSpan,
					equalsOffset: marker.equals,
					value: raw.slice(sourceStart, sourceEnd),
					start: marker.start,
					valueStart: sourceStart,
					end: sourceEnd,
					sourceSpan: { start: sourceStart, end: sourceEnd },
					valueSpan: { start: sourceStart, end: sourceEnd },
				};
			}
		}

		const sourceEnd = trimEnd(raw, sourceStart, limit);
		return {
			name: marker.name,
			nameSpan: marker.nameSpan,
			equalsOffset: marker.equals,
			value: raw.slice(sourceStart, sourceEnd),
			start: marker.start,
			valueStart: sourceStart,
			end: sourceEnd,
			sourceSpan: { start: sourceStart, end: sourceEnd },
			valueSpan: { start: sourceStart, end: sourceEnd },
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
	let currentStart = region.start;

	traverseLexicalTokens(raw, region, syntax, (state) => {
		if (state.isInsideQuoteOrGroup) return;

		if (raw.startsWith(delimiter, state.index)) {
			const end = trimEnd(raw, currentStart, state.index);
			if (skipWhitespace(raw, currentStart) < end) {
				parts.push({ start: skipWhitespace(raw, currentStart), end });
			}
			currentStart = state.index + delimiter.length;
		}
	});

	const end = trimEnd(raw, currentStart, region.end);
	if (skipWhitespace(raw, currentStart) < end) {
		parts.push({ start: skipWhitespace(raw, currentStart), end });
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
	let currentStart = 0;

	traverseLexicalTokens(
		text,
		{ start: 0, end: text.length },
		syntax,
		(state) => {
			if (state.isInsideQuoteOrGroup) return;

			if (text.startsWith(delimiter, state.index)) {
				pushListItem(items, text, currentStart, state.index, offset);
				currentStart = state.index + delimiter.length;
			}
		},
	);

	pushListItem(items, text, currentStart, text.length, offset);
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

export function skipWhitespaceAndDelimiters(
	text: string,
	start: number,
	end: number,
	delimiter?: string,
): number {
	let index = start;
	while (index < end) {
		if (/\s/u.test(text[index]!)) {
			index += 1;
			continue;
		}
		if (delimiter && text.startsWith(delimiter, index)) {
			index += delimiter.length;
			continue;
		}
		break;
	}
	return index;
}

export function tokenizePositionalTokens(
	raw: string,
	region: MacroSpan,
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): MacroSpan[] {
	const delimiter = resolveArgumentDelimiter(syntax);
	const tokens: MacroSpan[] = [];
	let tokenStart = skipWhitespaceAndDelimiters(
		raw,
		region.start,
		region.end,
		delimiter,
	);
	while (tokenStart < region.end) {
		const tokenEnd = scanPositionalTokenEnd(
			raw,
			tokenStart,
			region.end,
			syntax,
		);
		if (tokenEnd > tokenStart) {
			tokens.push({ start: tokenStart, end: tokenEnd });
		}
		tokenStart = skipWhitespaceAndDelimiters(
			raw,
			tokenEnd,
			region.end,
			delimiter,
		);
	}
	return tokens;
}

function scanPositionalTokenEnd(
	raw: string,
	start: number,
	limit: number,
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): number {
	const delimiter = resolveArgumentDelimiter(syntax);
	const exprToken = syntax?.expressionToken;
	const conceptToken = syntax?.conceptToken;

	let tokenEnd = limit;

	traverseLexicalTokens(raw, { start, end: limit }, syntax, (state) => {
		if (state.index === start) return;

		if (state.isInsideQuoteOrGroup) return;

		if (/\s/u.test(state.char)) {
			tokenEnd = state.index;
			return false;
		}

		if (delimiter && raw.startsWith(delimiter, state.index)) {
			tokenEnd = state.index;
			return false;
		}

		if (exprToken && raw.startsWith(exprToken, state.index)) {
			tokenEnd = state.index;
			return false;
		}

		if (conceptToken && raw.startsWith(conceptToken, state.index)) {
			tokenEnd = state.index;
			return false;
		}
	});

	return tokenEnd;
}

export interface ConceptTokenParts {
	raw: string;
	hasConceptToken: boolean;
	term: string;
	termSpan: MacroSpan;
	conceptCode?: string;
	codeSpan?: MacroSpan;
	separatorSpan?: MacroSpan;
}

export function scanConceptTokenParts(
	tokenText: string,
	offset: number,
	syntax?: Partial<MacroSyntax> | ScannerSyntax,
): ConceptTokenParts {
	// conceptCodeSeparator splits term::opaque-code only inside an active
	// concept token and only outside quotes/groups. It is NOT a general
	// positional-token delimiter; `@harry::HP1` is returned as one raw token
	// and split later by the concept parser.
	const conceptToken = syntax?.conceptToken;
	const separator = syntax?.conceptCodeSeparator;

	let text = tokenText;
	let hasConceptToken = false;
	let startOffset = 0;

	if (conceptToken && text.startsWith(conceptToken)) {
		hasConceptToken = true;
		text = text.slice(conceptToken.length);
		startOffset = conceptToken.length;
	}

	if (!hasConceptToken || !separator) {
		return {
			raw: tokenText,
			hasConceptToken,
			term: text,
			termSpan: { start: offset + startOffset, end: offset + tokenText.length },
		};
	}

	let separatorIndex = -1;
	traverseLexicalTokens(
		text,
		{ start: 0, end: text.length },
		syntax,
		(state) => {
			if (state.isInsideQuoteOrGroup) return;
			if (text.startsWith(separator, state.index)) {
				separatorIndex = state.index;
				return false;
			}
		},
	);

	if (separatorIndex === -1) {
		return {
			raw: tokenText,
			hasConceptToken,
			term: text,
			termSpan: { start: offset + startOffset, end: offset + tokenText.length },
		};
	}

	const term = text.slice(0, separatorIndex);
	const conceptCode = text.slice(separatorIndex + separator.length);
	const separatorStart = offset + startOffset + separatorIndex;
	const separatorEnd = separatorStart + separator.length;
	const codeStart = separatorEnd;
	const codeEnd = offset + tokenText.length;

	return {
		raw: tokenText,
		hasConceptToken,
		term,
		termSpan: { start: offset + startOffset, end: separatorStart },
		conceptCode,
		codeSpan: { start: codeStart, end: codeEnd },
		separatorSpan: { start: separatorStart, end: separatorEnd },
	};
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
