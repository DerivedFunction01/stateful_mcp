import type {
	MacroArgumentInput,
	MacroArgumentMatch,
	MacroCaptureSpan,
	MacroInput,
	MacroListItemInput,
	MacroSourceLine,
} from "./macro-binding";
import type { MacroArgumentSpec, MacroDefinition } from "./macro-definition";
import type { SyntaxProfile } from "./macro-profile";
import { matchFriendlyMacroForms } from "./macro-template-matcher";

export interface ParseMacroLineOptions {
	macroStartToken?: string;
	definition?: MacroDefinition;
	profile?: SyntaxProfile;
}

export interface MacroParseDiagnostic {
	code:
		| "UNTERMINATED_QUOTE"
		| "UNTERMINATED_GROUP"
		| "INVALID_PATTERN"
		| "NO_MATCH";
	message: string;
	start: number;
	end: number;
	argumentId?: string;
	formId?: string;
}

export function parseMacroLine(
	raw: string,
	lineNumber = 0,
	options: ParseMacroLineOptions = {},
): (MacroInput & { diagnostics?: MacroParseDiagnostic[] }) | null {
	const marker =
		options.macroStartToken ?? options.profile?.macroStartToken ?? "^";
	const leading = raw.search(/\S/);
	if (leading < 0 || !raw.startsWith(marker, leading)) return null;
	const nameStart = leading + marker.length;
	const nameEnd = scanUntilWhitespace(raw, nameStart);
	const macroName = raw.slice(nameStart, nameEnd);
	if (!macroName) return null;

	const diagnostics: MacroParseDiagnostic[] = [];
	const bodyStart = skipWhitespace(raw, nameEnd);
	const arguments_ = options.definition
		? matchDefinitionArguments(
				raw,
				bodyStart,
				options.definition,
				diagnostics,
				options.profile,
			)
		: scanFallbackAssignments(
				raw,
				bodyStart,
				diagnostics,
				options.profile?.macroArgDelimiter ??
					options.profile?.fallbackBoundaryDelimiter,
			);
	const sourceLines: MacroSourceLine[] = [{ line: lineNumber, raw, macroName }];
	for (const argument of arguments_) argument.line = lineNumber;
	return {
		macroName,
		sourceLines,
		arguments: arguments_,
		matches: arguments_.flatMap((argument) =>
			argument.match ? [argument.match] : [],
		),
		diagnostics: diagnostics.length ? diagnostics : undefined,
	};
}

function matchDefinitionArguments(
	raw: string,
	bodyStart: number,
	definition: MacroDefinition,
	diagnostics: MacroParseDiagnostic[],
	profile?: SyntaxProfile,
): MacroArgumentInput[] {
	const delimiter =
		definition.syntax?.argumentDelimiter ??
		profile?.macroArgDelimiter ??
		profile?.fallbackBoundaryDelimiter;
	const named = scanNamedAssignments(raw, bodyStart, diagnostics, delimiter);
	const arguments_: MacroArgumentInput[] = [];
	for (const segment of named) {
		const spec = resolveNamedSpec(segment.name, definition.arguments);
		if (!spec) {
			arguments_.push({
				name: segment.name,
				rawValue: segment.value,
				source: "named",
				start: segment.start,
				end: segment.end,
			});
			continue;
		}
		const matched = matchSpec(
			segment.value,
			segment.valueStart,
			spec,
			diagnostics,
		);
		if (!matched) {
			const invalidEnd = scanUntilWhitespace(raw, segment.valueStart);
			segment.value = raw.slice(segment.valueStart, invalidEnd);
			segment.end = invalidEnd;
		}
		const items = matched
			? splitListItems(
					segment.value,
					segment.valueStart,
					spec.extraction.itemDelimiter,
				)
			: undefined;
		arguments_.push({
			name: segment.name,
			position: spec.position,
			rawValue: matched?.rawValue ?? segment.value,
			captures: matched?.captures,
			items,
			source: matched ? "rule" : "named",
			start: matched?.start ?? segment.valueStart,
			end: matched?.end ?? segment.end,
			match: matched ? createMatch(spec, "named", matched) : undefined,
		});
		if (matched) {
			segment.value = matched.rawValue;
			segment.end = matched.end;
		}
	}
	const friendlyMatches = matchFriendlyMacroForms(raw, bodyStart, definition);
	for (const match of friendlyMatches) {
		arguments_.push({
			name: definition.arguments.find(
				(argument) => argument.argumentId === match.argumentId,
			)?.name,
			rawValue: match.rawValue,
			captures: match.captures,
			source: "friendly",
			start: match.extraction.start,
			end: match.extraction.end,
			match,
		});
	}
	if (friendlyMatches.length > 0) {
		return arguments_.sort(
			(left, right) => (left.start ?? 0) - (right.start ?? 0),
		);
	}

	// Unnamed text is matched by declared positional expressions, never split by whitespace.
	const unnamed = scanUnnamedRegions(
		raw,
		bodyStart,
		named,
		definition.syntax?.argumentDelimiter,
	);
	const positional = definition.arguments
		.filter(
			(spec) =>
				spec.position !== undefined &&
				!named.some(
					(part) =>
						resolveNamedSpec(part.name, definition.arguments)?.argumentId ===
						spec.argumentId,
				),
		)
		.sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
	const remainingSpecs = [...positional];
	for (const region of unnamed) {
		if (
			isPendingTemplatePrefix(raw.slice(region.start, region.end), definition)
		)
			continue;
		const inferred = inferPositionalMatches(
			raw,
			region,
			remainingSpecs,
			diagnostics,
			profile,
		);
		for (const { spec, matched } of inferred) {
			remainingSpecs.splice(remainingSpecs.indexOf(spec), 1);
			arguments_.push({
				position: spec.position,
				rawValue: matched.rawValue,
				captures: matched.captures,
				items: splitListItems(
					matched.rawValue,
					matched.start,
					spec.extraction.itemDelimiter,
				),
				source: "inferred",
				start: matched.start,
				end: matched.end,
				match: createMatch(spec, "inferred", matched),
			});
		}
	}
	return arguments_.sort(
		(left, right) => (left.start ?? 0) - (right.start ?? 0),
	);
}

interface PositionalMatch {
	spec: MacroArgumentSpec;
	matched: NonNullable<ReturnType<typeof matchSpec>>;
	startToken: number;
}

function inferPositionalMatches(
	raw: string,
	region: { start: number; end: number },
	specs: readonly MacroArgumentSpec[],
	diagnostics: MacroParseDiagnostic[],
	profile?: SyntaxProfile,
): PositionalMatch[] {
	const tokens: Array<{ start: number; end: number }> = [];
	let tokenStart = skipWhitespace(raw, region.start);
	while (tokenStart < region.end) {
		const tokenEnd = scanUntilWhitespace(raw, tokenStart);
		tokens.push({ start: tokenStart, end: tokenEnd });
		tokenStart = skipWhitespace(raw, tokenEnd);
	}
	const candidates = specs.flatMap((spec) =>
		tokens.flatMap((token, startToken) =>
			tokens.slice(startToken).flatMap((_, relativeEndToken) => {
				const endToken = startToken + relativeEndToken;
				const lookupToken =
					spec.extraction.kind === "concept" ||
					spec.extraction.kind === "concept_array"
						? [profile?.expressionToken, profile?.conceptToken].find(
								(value) => value && raw.startsWith(value, token.start),
							)
						: undefined;
				const start = lookupToken
					? skipWhitespace(raw, token.start + lookupToken.length)
					: token.start;
				const end = tokens[endToken]!.end;
				const matched = matchSpec(
					raw.slice(start, end),
					start,
					spec,
					diagnostics,
				);
				if (!matched || matched.end !== end) return [];
				return [
					{
						spec,
						matched: lookupToken
							? {
									...matched,
									start: token.start,
									rawValue: raw.slice(token.start, end),
								}
							: matched,
						startToken,
					},
				];
			}),
		),
	);

	let best: PositionalMatch[] = [];
	const visit = (specIndex: number, selected: PositionalMatch[]) => {
		if (specIndex >= specs.length) {
			if (isBetterAssignment(selected, best)) best = selected;
			return;
		}
		visit(specIndex + 1, selected);
		for (const candidate of candidates.filter(
			(item) => item.spec === specs[specIndex],
		)) {
			if (
				selected.some(
					(item) =>
						item.matched.start < candidate.matched.end &&
						candidate.matched.start < item.matched.end,
				)
			)
				continue;
			visit(specIndex + 1, [...selected, candidate]);
		}
	};
	visit(0, []);
	return best.sort((left, right) => left.matched.start - right.matched.start);
}

function isBetterAssignment(
	left: PositionalMatch[],
	right: PositionalMatch[],
): boolean {
	const leftRequired = left.filter(
		(item) => item.spec.required ?? item.spec.extraction.required,
	).length;
	const rightRequired = right.filter(
		(item) => item.spec.required ?? item.spec.extraction.required,
	).length;
	if (left.length !== right.length) return left.length > right.length;
	if (leftRequired !== rightRequired) return leftRequired > rightRequired;
	const positionCost = (items: PositionalMatch[]) =>
		items.reduce(
			(total, item) =>
				total + Math.abs((item.spec.position ?? 0) - item.startToken),
			0,
		);
	const leftPositionCost = positionCost(left);
	const rightPositionCost = positionCost(right);
	if (leftPositionCost !== rightPositionCost)
		return leftPositionCost < rightPositionCost;
	const spanLength = (items: PositionalMatch[]) =>
		items.reduce(
			(total, item) => total + (item.matched.end - item.matched.start),
			0,
		);
	return spanLength(left) > spanLength(right);
}

function isPendingTemplatePrefix(
	text: string,
	definition: MacroDefinition,
): boolean {
	const templates = [
		...(definition.authoringTemplates ?? []),
		...definition.arguments.flatMap((argument) =>
			(argument.forms ?? []).map((form) => form.template),
		),
	];
	return templates.some((template) => {
		let literalPrefix = "";
		for (const part of template.parts) {
			if (part.kind === "slot") break;
			literalPrefix += part.text;
		}
		const normalizedText = text.trimEnd();
		const normalizedPrefix = literalPrefix.trimEnd();
		return (
			Boolean(normalizedPrefix) &&
			(normalizedPrefix.startsWith(normalizedText) ||
				normalizedText.startsWith(normalizedPrefix))
		);
	});
}

interface NamedSegment {
	name: string;
	value: string;
	start: number;
	valueStart: number;
	end: number;
}

function scanNamedAssignments(
	raw: string,
	start: number,
	diagnostics: MacroParseDiagnostic[],
	delimiter?: string,
): NamedSegment[] {
	const markers: Array<{ name: string; start: number; equals: number }> = [];
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
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === "[") {
			depth += 1;
			continue;
		}
		if (char === "]") {
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
		if (
			depth ||
			(index > start && !/\s/.test(raw[index - 1]!) && !followsDelimiter)
		)
			continue;
		const match = /^[A-Za-z_][\w-]*=/.exec(raw.slice(index));
		if (match)
			markers.push({
				name: match[0].slice(0, -1),
				start: index,
				equals: index + match[0].length - 1,
			});
	}
	if (quote)
		diagnostics.push({
			code: "UNTERMINATED_QUOTE",
			message: "Unterminated quote",
			start,
			end: raw.length,
		});
	if (depth)
		diagnostics.push({
			code: "UNTERMINATED_GROUP",
			message: "Unterminated grouped value",
			start,
			end: raw.length,
		});
	return markers.map((marker, index) => {
		const nextStart = markers[index + 1]?.start ?? raw.length;
		const delimiterEnd =
			delimiter &&
			raw.slice(nextStart - delimiter.length, nextStart) === delimiter
				? nextStart - delimiter.length
				: nextStart;
		const end = delimiterEnd;
		const valueStart = skipWhitespace(raw, marker.equals + 1);
		const valueEnd = trimEnd(raw, valueStart, end);
		return {
			name: marker.name,
			value: raw.slice(valueStart, valueEnd),
			start: marker.start,
			valueStart,
			end: valueEnd,
		};
	});
}

function scanUnnamedRegions(
	raw: string,
	start: number,
	named: NamedSegment[],
	delimiter?: string,
): Array<{ start: number; end: number }> {
	const regions: Array<{ start: number; end: number }> = [];
	let cursor = start;
	for (const segment of named) {
		const end = segment.start;
		if (skipWhitespace(raw, cursor) < end)
			regions.push({ start: skipWhitespace(raw, cursor), end });
		cursor = segment.end;
	}
	if (skipWhitespace(raw, cursor) < raw.length)
		regions.push({ start: skipWhitespace(raw, cursor), end: raw.length });
	if (delimiter) {
		return regions.flatMap((region) =>
			splitByDelimiter(raw, region, delimiter),
		);
	}
	return regions;
}

function scanFallbackAssignments(
	raw: string,
	start: number,
	diagnostics: MacroParseDiagnostic[],
	delimiter?: string,
): MacroArgumentInput[] {
	const named = scanNamedAssignments(raw, start, diagnostics, delimiter);
	if (named.length)
		return named.map((segment, position) => ({
			name: segment.name,
			position,
			rawValue: segment.value,
			source: "named",
			start: segment.start,
			end: segment.end,
		}));
	const valueStart = skipWhitespace(raw, start);
	return valueStart < raw.length
		? [
				{
					position: 0,
					rawValue: raw.slice(valueStart),
					source: "positional",
					start: valueStart,
					end: raw.length,
				},
			]
		: [];
}

function splitListItems(
	text: string,
	offset: number,
	delimiter?: string,
): MacroListItemInput[] | undefined {
	if (!delimiter) return undefined;
	const items: MacroListItemInput[] = [];
	let start = 0;
	let quote = "";
	let depth = 0;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]!;
		if (char === '"' || char === "'") {
			if (!quote) quote = char;
			else if (quote === char) quote = "";
			continue;
		}
		if (quote) continue;
		if (char === "[") {
			depth += 1;
			continue;
		}
		if (char === "]") {
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
	items: MacroListItemInput[],
	text: string,
	start: number,
	end: number,
	offset: number,
): void {
	const valueStart = skipWhitespace(text, start);
	const valueEnd = trimEnd(text, valueStart, end);
	if (valueStart < valueEnd)
		items.push({
			rawValue: text.slice(valueStart, valueEnd),
			start: offset + valueStart,
			end: offset + valueEnd,
		});
}

function matchSpec(
	text: string,
	offset: number,
	spec: MacroArgumentSpec,
	diagnostics: MacroParseDiagnostic[],
):
	| {
			rawValue: string;
			captures: Record<string, string | undefined>;
			captureSpans: MacroCaptureSpan[];
			start: number;
			end: number;
	  }
	| undefined {
	const patterns = spec.extraction.patterns ?? [];
	if (!patterns.length) return undefined;
	for (const pattern of patterns) {
		try {
			const expression = new RegExp(`^(?:${pattern})`, "id");
			const match = expression.exec(text);
			if (match) {
				const captureSpans = Object.entries(match.groups ?? {}).flatMap(
					([name, value]) => {
						const index = match.indices?.groups?.[name];
						return index
							? [
									{
										name,
										value,
										start: offset + index[0],
										end: offset + index[1],
									},
								]
							: [];
					},
				);
				const matchedEnd = trimEnd(text, 0, match[0].length);
				return {
					rawValue: text.slice(0, matchedEnd),
					captures: match.groups ?? {},
					start: offset,
					end: offset + matchedEnd,
					captureSpans,
				};
			}
		} catch {
			diagnostics.push({
				code: "INVALID_PATTERN",
				message: `Invalid extraction pattern for '${spec.name}'`,
				start: offset,
				end: offset + text.length,
				argumentId: spec.argumentId,
			});
		}
	}
	return undefined;
}

function createMatch(
	spec: MacroArgumentSpec,
	source: MacroArgumentMatch["source"],
	matched: {
		rawValue: string;
		captures: Record<string, string | undefined>;
		captureSpans: MacroCaptureSpan[];
		start: number;
		end: number;
	},
): MacroArgumentMatch {
	return {
		argumentId: spec.argumentId,
		source,
		extraction: { start: matched.start, end: matched.end },
		rawValue: matched.rawValue,
		captures: matched.captures,
		captureSpans: matched.captureSpans,
	};
}

function resolveNamedSpec(
	name: string,
	specs: readonly MacroArgumentSpec[],
): MacroArgumentSpec | undefined {
	const normalized = name.toLowerCase();
	return specs.find(
		(spec) =>
			spec.name.toLowerCase() === normalized ||
			spec.argumentId.toLowerCase() === normalized ||
			spec.aliases?.some((alias) => alias.toLowerCase() === normalized),
	);
}

function scanUntilWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && !/\s/.test(text[index]!)) index += 1;
	return index;
}

function skipWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && /\s/.test(text[index]!)) index += 1;
	return index;
}

function trimEnd(text: string, start: number, end: number): number {
	let index = end;
	while (index > start && /\s/.test(text[index - 1]!)) index -= 1;
	return index;
}

function splitByDelimiter(
	raw: string,
	region: { start: number; end: number },
	delimiter: string,
): Array<{ start: number; end: number }> {
	const parts: Array<{ start: number; end: number }> = [];
	let start = region.start;
	let quote = "";
	let escaped = false;
	let depth = 0;
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
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === "[") {
			depth += 1;
			continue;
		}
		if (char === "]") {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (!depth && raw.startsWith(delimiter, index)) {
			const end = trimEnd(raw, start, index);
			if (skipWhitespace(raw, start) < end)
				parts.push({ start: skipWhitespace(raw, start), end });
			index += delimiter.length - 1;
			start = index + 1;
		}
	}
	const end = trimEnd(raw, start, region.end);
	if (skipWhitespace(raw, start) < end)
		parts.push({ start: skipWhitespace(raw, start), end });
	return parts;
}
