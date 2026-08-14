import type { ExpressionCandidate } from "../contracts/backends";
import type {
	MacroArgumentInput,
	MacroDiagnostic,
	MacroInput,
	MacroSpan,
} from "../contracts/input";
import type {
	MacroArgumentSpec,
	MacroMatcher,
	MacroParseOptions,
	MacroSpec,
} from "../contracts/macro";
import type { MacroArgumentMatch } from "../contracts/matching";
import type { MacroSyntax } from "../contracts/syntax";
import {
	matchFriendlyMacroForms,
	resolveMacroArgumentMatches,
} from "../matcher/friendly";

export interface MacroEnvelope {
	macroName: string;
	marker: MacroSpan;
	name: MacroSpan;
	body: MacroSpan;
}

export interface ParseMacroLineResult extends MacroInput {
	diagnostics: MacroDiagnostic[];
}

export function parseMacroEnvelope(
	raw: string,
	syntax: Pick<MacroSyntax, "macroStartToken"> | Partial<MacroSyntax>,
): MacroEnvelope | null {
	const marker = syntax.macroStartToken;
	if (!marker) return null;
	const leading = raw.search(/\S/u);
	if (leading < 0 || !raw.startsWith(marker, leading)) return null;
	const nameStart = leading + marker.length;
	const nameEnd = scanUntilWhitespace(raw, nameStart);
	if (nameStart === nameEnd) return null;
	const bodyStart = skipWhitespace(raw, nameEnd);
	return {
		macroName: raw.slice(nameStart, nameEnd),
		marker: { start: leading, end: nameStart },
		name: { start: nameStart, end: nameEnd },
		body: { start: bodyStart, end: raw.length },
	};
}

export function parseMacroLine(
	raw: string,
	spec: MacroSpec,
	options: MacroParseOptions = {},
): ParseMacroLineResult | null {
	const syntax = resolveSyntax(spec, options);
	const envelope = parseMacroEnvelope(raw, syntax);
	if (
		!envelope ||
		envelope.macroName.toLocaleLowerCase() !== spec.name.toLocaleLowerCase()
	)
		return null;

	const diagnostics: MacroDiagnostic[] = [];
	const delimiter = resolveArgumentDelimiter(spec, options);
	const scanSyntax = { ...syntax, argumentDelimiter: delimiter };
	const named = scanNamedAssignments(
		raw,
		envelope.body.start,
		diagnostics,
		scanSyntax,
	);
	const arguments_: MacroArgumentInput[] = [];
	const allCandidates: MacroArgumentMatch[] = [];
	const selectedMatches: MacroArgumentMatch[] = [];
	const used = new Set<string>();

	for (const segment of named) {
		const argument = resolveArgument(segment.name, spec);
		if (!argument) {
			diagnostics.push({
				code: "UNKNOWN_ARGUMENT",
				message: `Unknown argument '${segment.name}'`,
				start: segment.start,
				end: segment.end,
			});
			arguments_.push(segmentInput(raw, segment, "named"));
			continue;
		}
		if (used.has(argument.argumentId)) {
			diagnostics.push({
				code: "DUPLICATE_ARGUMENT",
				argumentId: argument.argumentId,
				message: `Argument '${argument.name}' was provided more than once`,
				start: segment.start,
				end: segment.end,
			});
			continue;
		}
		used.add(argument.argumentId);
		const sourceValue = raw.slice(
			segment.sourceSpan.start,
			segment.sourceSpan.end,
		);
		const sourceMatches = argument.matcher
			? matchArgument(
					argument,
					sourceValue,
					segment.sourceSpan.start,
					true,
					options,
					diagnostics,
				)
			: [];
		const semanticMatches = matchArgument(
			argument,
			segment.value,
			segment.valueSpan.start,
			true,
			options,
			diagnostics,
		);
		const candidateMatches = uniqueMatches([
			...sourceMatches,
			...semanticMatches,
		]);
		allCandidates.push(...candidateMatches);
		const matched = candidateMatches.sort(compareMatches)[0];
		if (matched) {
			matched.sourceSpan = segment.sourceSpan;
			matched.valueSpan = segment.valueSpan;
			selectedMatches.push(matched);
			arguments_.push({
				name: segment.name,
				position: argument.position,
				rawValue: matched.rawValue,
				captures: matched.captures,
				source: matched.source,
				start: matched.extraction.start,
				end: matched.extraction.end,
				sourceSpan: segment.sourceSpan,
				valueSpan: segment.valueSpan,
				sourceText: raw.slice(segment.sourceSpan.start, segment.sourceSpan.end),
				valueText: segment.value,
				match: matched,
			});
		} else {
			// Consume only the first source value for an invalid named assignment.
			// This leaves later positional values eligible for inference.
			const invalidEnd = scanUntilWhitespace(raw, segment.valueSpan.start);
			segment.end = invalidEnd;
			segment.sourceSpan = { start: segment.sourceSpan.start, end: invalidEnd };
			segment.valueSpan = { start: segment.valueSpan.start, end: invalidEnd };
			segment.value = raw.slice(segment.valueSpan.start, invalidEnd);
			arguments_.push(segmentInput(raw, segment, "named"));
		}
	}

	const friendly = matchFriendlyMacroForms(raw, envelope.body.start, spec);
	allCandidates.push(...friendly);
	for (const match of friendly) {
		if (used.has(match.argumentId)) continue;
		used.add(match.argumentId);
		selectedMatches.push(match);
		const argument = spec.arguments.find(
			(item) => item.argumentId === match.argumentId,
		);
		if (argument) arguments_.push(matchInput(argument, match));
	}

	const blocked = [
		...named.map((segment) => ({ start: segment.start, end: segment.end })),
		...friendly.map((match) => ({
			start: match.anchor?.start ?? match.extraction.start,
			end: match.anchor?.end ?? match.extraction.end,
		})),
	];
	const regions = findUnmatchedRegions(
		raw,
		envelope.body.start,
		blocked,
		delimiter,
		syntax,
	);
	if (regions.length && (spec.matching?.positionalFallback ?? false)) {
		const remaining = spec.arguments.filter(
			(argument) => !used.has(argument.argumentId),
		);
		const inferred = regions.flatMap((region) => {
			if (isPendingTemplatePrefix(raw.slice(region.start, region.end), spec))
				return [];
			return inferPositionalMatches(
				raw,
				region,
				remaining,
				{ ...options, profile: syntax },
				diagnostics,
			);
		});
		allCandidates.push(...inferred.flatMap((item) => item.candidates));
		for (const item of inferred) {
			if (used.has(item.match.argumentId)) continue;
			used.add(item.match.argumentId);
			selectedMatches.push(item.match);
			const argument = spec.arguments.find(
				(candidate) => candidate.argumentId === item.match.argumentId,
			);
			if (argument) arguments_.push(matchInput(argument, item.match));
		}
	}

	for (const argument of spec.arguments) {
		if (used.has(argument.argumentId)) continue;
		if (argument.defaultValue === undefined) {
			if (argument.required)
				diagnostics.push({
					code: "MISSING_REQUIRED",
					argumentId: argument.argumentId,
					message: `Required argument '${argument.name}' is missing`,
				});
			continue;
		}
		const defaultMatch = matchDefault(
			argument,
			argument.defaultValue,
			options,
			diagnostics,
		);
		if (!defaultMatch) continue;
		selectedMatches.push(defaultMatch);
		allCandidates.push(defaultMatch);
		used.add(argument.argumentId);
		arguments_.push(matchInput(argument, defaultMatch));
	}

	const matches = resolveMacroArgumentMatches(selectedMatches, spec);
	return {
		macroName: spec.name,
		sourceLines: [{ line: options.lineNumber ?? 0, raw, macroName: spec.name }],
		arguments: arguments_.sort(
			(left, right) =>
				(left.start ?? Number.MAX_SAFE_INTEGER) -
				(right.start ?? Number.MAX_SAFE_INTEGER),
		),
		body: { ...envelope.body, raw: raw.slice(envelope.body.start) },
		matches,
		candidates: allCandidates,
		candidateMatches: allCandidates,
		diagnostics,
	};
}

interface NamedSegment {
	name: string;
	value: string;
	start: number;
	valueStart: number;
	end: number;
	sourceSpan: MacroSpan;
	valueSpan: MacroSpan;
}

interface PositionalInference {
	match: MacroArgumentMatch;
	candidates: MacroArgumentMatch[];
}

function resolveSyntax(
	spec: MacroSpec,
	options: MacroParseOptions,
): Partial<MacroSyntax> {
	return {
		...spec.syntax,
		...options.profile,
		macroStartToken:
			options.profile?.macroStartToken ?? spec.syntax?.macroStartToken,
	};
}

function resolveArgumentDelimiter(
	spec: MacroSpec,
	options: MacroParseOptions,
): string | undefined {
	return (
		spec.syntax?.argumentDelimiter ??
		spec.syntax?.macroArgDelimiter ??
		options.profile?.argumentDelimiter ??
		options.profile?.macroArgDelimiter ??
		options.profile?.fallbackBoundaryDelimiter ??
		spec.syntax?.fallbackBoundaryDelimiter
	);
}

function inferPositionalMatches(
	raw: string,
	region: MacroSpan,
	specs: readonly MacroArgumentSpec[],
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): PositionalInference[] {
	const tokens: MacroSpan[] = [];
	let tokenStart = skipWhitespace(raw, region.start);
	while (tokenStart < region.end) {
		const tokenEnd = scanUntilWhitespace(raw, tokenStart);
		tokens.push({ start: tokenStart, end: tokenEnd });
		tokenStart = skipWhitespace(raw, tokenEnd);
	}
	const candidates = specs.flatMap((argument) =>
		tokens.flatMap((token, startToken) => {
			return tokens.slice(startToken).flatMap((_, relativeEndToken) => {
				const endToken = startToken + relativeEndToken;
				const sourceStart = token.start;
				const sourceEnd = tokens[endToken]!.end;
				const tokenPrefix = findLookupToken(
					raw,
					sourceStart,
					argument,
					options.profile,
				);
				const lookupStart = tokenPrefix
					? sourceStart + tokenPrefix.length
					: sourceStart;
				const matches = matchArgument(
					argument,
					raw.slice(lookupStart, sourceEnd),
					lookupStart,
					false,
					options,
					diagnostics,
				).filter(
					(match) =>
						match.extraction.start === lookupStart &&
						match.extraction.end === sourceEnd,
				);
				return matches.map(
					(match) =>
						({
							...match,
							extraction: {
								start: tokenPrefix ? sourceStart : match.extraction.start,
								end: match.extraction.end,
							},
							rawValue: tokenPrefix
								? raw.slice(sourceStart, sourceEnd)
								: match.rawValue,
							lookupToken: tokenPrefix,
						}) as MacroArgumentMatch & { lookupToken?: string },
				);
			});
		}),
	);
	const selectionCandidates =
		options.mode === "execute"
			? candidates.filter(
					(candidate) =>
						candidate.matchKind !== "prefix" ||
						!candidates.some(
							(other) =>
								other.argumentId === candidate.argumentId &&
								other.matchKind === "exact" &&
								other.extraction.start === candidate.extraction.start,
						),
				)
			: candidates;

	let best: MacroArgumentMatch[] = [];
	const visit = (index: number, selected: MacroArgumentMatch[]) => {
		if (index >= specs.length) {
			if (isBetterAssignment(selected, best, specs, tokens)) best = selected;
			return;
		}
		visit(index + 1, selected);
		for (const candidate of selectionCandidates.filter(
			(item) => item.argumentId === specs[index]!.argumentId,
		)) {
			if (
				selected.some((item) =>
					spansOverlap(item.extraction, candidate.extraction),
				)
			)
				continue;
			visit(index + 1, [...selected, candidate]);
		}
	};
	visit(0, []);
	return best
		.sort((left, right) => left.extraction.start - right.extraction.start)
		.map((match) => ({ match, candidates }));
}

function isBetterAssignment(
	left: readonly MacroArgumentMatch[],
	right: readonly MacroArgumentMatch[],
	specs: readonly MacroArgumentSpec[],
	tokens: readonly MacroSpan[],
): boolean {
	const required = (items: readonly MacroArgumentMatch[]) =>
		items.filter(
			(item) =>
				specs.find((spec) => spec.argumentId === item.argumentId)?.required,
		).length;
	if (left.length !== right.length) return left.length > right.length;
	if (required(left) !== required(right))
		return required(left) > required(right);
	const positionCost = (items: readonly MacroArgumentMatch[]) =>
		items.reduce((total, item) => {
			const token = tokens.findIndex(
				(candidate) =>
					candidate.start === item.extraction.start ||
					(candidate.start < item.extraction.start &&
						candidate.end > item.extraction.start),
			);
			return (
				total +
				Math.abs(
					(specs.find((spec) => spec.argumentId === item.argumentId)
						?.position ?? 0) - token,
				)
			);
		}, 0);
	if (positionCost(left) !== positionCost(right))
		return positionCost(left) < positionCost(right);
	return (
		left.reduce(
			(total, item) => total + item.extraction.end - item.extraction.start,
			0,
		) >
		right.reduce(
			(total, item) => total + item.extraction.end - item.extraction.start,
			0,
		)
	);
}

function findLookupToken(
	raw: string,
	start: number,
	argument: MacroArgumentSpec,
	profile?: Partial<MacroSyntax>,
): string | undefined {
	if (
		!asMatchers(argument.matcher).some(
			(matcher) => matcher.kind === "expression",
		)
	)
		return undefined;
	return [profile?.expressionToken, profile?.conceptToken].find((token) =>
		Boolean(token && raw.startsWith(token, start)),
	);
}

function matchArgument(
	argument: MacroArgumentSpec,
	text: string,
	offset: number,
	isNamed: boolean,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch[] {
	const region = { start: 0, end: text.length };
	const matches = findArgumentMatches(
		argument,
		text,
		region,
		options,
		diagnostics,
	).map((match) => ({
		...match,
		extraction: {
			start: match.extraction.start + offset,
			end: match.extraction.end + offset,
		},
		anchor: match.anchor
			? { start: match.anchor.start + offset, end: match.anchor.end + offset }
			: undefined,
	}));
	if (matches.length || !isNamed || argument.matcher) return matches;
	const trimmed = text.trim();
	if (!trimmed) return [];
	const start = offset + text.indexOf(trimmed);
	return [
		{
			argumentId: argument.argumentId,
			source: "named",
			extraction: { start, end: start + trimmed.length },
			rawValue: trimmed,
			matchKind: "literal",
		},
	];
}

function findArgumentMatches(
	argument: MacroArgumentSpec,
	raw: string,
	region: MacroSpan,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch[] {
	return asMatchers(argument.matcher).flatMap((matcher) => {
		if (matcher.kind === "expression") {
			const backend = options.backends?.[matcher.backendId];
			if (!backend) {
				diagnostics.push({
					code: "BACKEND_MISSING",
					argumentId: argument.argumentId,
					message: `Expression backend '${matcher.backendId}' is not available`,
				});
				return [];
			}
			return backend
				.search({
					backendId: matcher.backendId,
					argumentId: argument.argumentId,
					text: raw.slice(region.start, region.end),
					offset: region.start,
				})
				.filter(
					(candidate) =>
						candidate.start >= 0 && candidate.end <= region.end - region.start,
				)
				.map((candidate) => expressionMatch(argument, candidate, region.start));
		}
		return scanPatternMatches(argument, matcher, raw, region, diagnostics);
	});
}

function matchDefault(
	argument: MacroArgumentSpec,
	value: string,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch | undefined {
	const matches = matchArgument(argument, value, 0, true, options, diagnostics);
	return {
		...(matches[0] ?? {
			argumentId: argument.argumentId,
			extraction: { start: 0, end: 0 },
			rawValue: value,
			source: "default" as const,
		}),
		argumentId: argument.argumentId,
		source: "default",
		extraction: { start: 0, end: 0 },
		rawValue: matches[0]?.rawValue ?? value,
	};
}

function scanPatternMatches(
	argument: MacroArgumentSpec,
	matcher: Extract<MacroMatcher, { kind: "pattern" | "literal" }>,
	raw: string,
	region: MacroSpan,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch[] {
	const pattern =
		matcher.kind === "literal" ? escapeRegex(matcher.text) : matcher.pattern;
	const source = typeof pattern === "string" ? pattern : pattern.source;
	const flags =
		matcher.kind === "pattern"
			? (matcher.flags ?? (typeof pattern === "string" ? "" : pattern.flags))
			: "";
	try {
		const expression = new RegExp(
			`(?:${source})`,
			`${flags.replace(/g/g, "")}gid`,
		);
		return execAll(expression, raw.slice(region.start)).flatMap((match) => {
			if (!match.indices) return [];
			const start = region.start + match.index;
			const end = start + match[0].trimEnd().length;
			if (end <= start) return [];
			const captureSpans = Object.entries(match.groups ?? {}).flatMap(
				([name, value]) => {
					const span = match.indices?.groups?.[name];
					return span
						? [
								{
									name,
									value,
									start: region.start + span[0],
									end: region.start + span[1],
								},
							]
						: [];
				},
			);
			return [
				{
					argumentId: argument.argumentId,
					source: "inferred",
					extraction: { start, end },
					rawValue: raw.slice(start, end),
					captures: match.groups ?? {},
					captureSpans,
					matchKind:
						matcher.kind === "literal"
							? ("literal" as const)
							: ("pattern" as const),
				},
			];
		});
	} catch {
		diagnostics.push({
			code: "INVALID_PATTERN",
			argumentId: argument.argumentId,
			message: `Invalid pattern for '${argument.name}'`,
			start: region.start,
			end: region.end,
		});
		return [];
	}
}

function expressionMatch(
	argument: MacroArgumentSpec,
	candidate: ExpressionCandidate,
	offset: number,
): MacroArgumentMatch {
	return {
		argumentId: argument.argumentId,
		source: "expression",
		extraction: {
			start: offset + candidate.start,
			end: offset + candidate.end,
		},
		rawValue: candidate.term,
		canonicalValue: candidate.canonicalValue,
		backendId: asMatchers(argument.matcher).find(isExpressionMatcher)
			?.backendId,
		sourceId: candidate.id,
		conceptId: candidate.conceptId,
		priority: candidate.priority,
		matchKind: candidate.matchKind,
		captures: { value: candidate.term },
	};
}

function asMatchers(matcher: MacroArgumentSpec["matcher"]): MacroMatcher[] {
	if (!matcher) return [];
	return Array.isArray(matcher)
		? Array.from(matcher)
		: [matcher as MacroMatcher];
}

function isExpressionMatcher(
	matcher: MacroMatcher,
): matcher is Extract<MacroMatcher, { kind: "expression" }> {
	return matcher.kind === "expression";
}

function resolveArgument(
	name: string,
	spec: MacroSpec,
): MacroArgumentSpec | undefined {
	const normalized = name.toLocaleLowerCase();
	return spec.arguments.find(
		(argument) =>
			argument.name.toLocaleLowerCase() === normalized ||
			argument.argumentId.toLocaleLowerCase() === normalized ||
			argument.aliases?.some(
				(alias) => alias.toLocaleLowerCase() === normalized,
			),
	);
}

function findUnmatchedRegions(
	raw: string,
	start: number,
	blocked: MacroSpan[],
	delimiter?: string,
	syntax?: Partial<MacroSyntax>,
): MacroSpan[] {
	const sorted = [...blocked].sort((left, right) => left.start - right.start);
	let cursor = start;
	const regions: MacroSpan[] = [];
	for (const span of sorted) {
		if (span.start > cursor && skipWhitespace(raw, cursor) < span.start)
			regions.push({ start: skipWhitespace(raw, cursor), end: span.start });
		cursor = Math.max(cursor, span.end);
	}
	if (skipWhitespace(raw, cursor) < raw.length)
		regions.push({ start: skipWhitespace(raw, cursor), end: raw.length });
	return delimiter
		? regions.flatMap((region) =>
				splitByDelimiter(raw, region, delimiter, syntax),
			)
		: regions;
}

function scanNamedAssignments(
	raw: string,
	start: number,
	diagnostics: MacroDiagnostic[],
	syntax: Pick<
		MacroSyntax,
		"argumentDelimiter" | "quoteCharacters" | "groupOpen" | "groupClose"
	>,
): NamedSegment[] {
	const delimiter = syntax.argumentDelimiter;
	const quoteCharacters = new Set(syntax.quoteCharacters ?? []);
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
		if (quoteCharacters.has(char)) {
			quote = char;
			continue;
		}
		if (syntax.groupOpen && char === syntax.groupOpen) {
			depth += 1;
			continue;
		}
		if (syntax.groupClose && char === syntax.groupClose) {
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
			(index > start && !/\s/u.test(raw[index - 1]!) && !followsDelimiter)
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
		const sourceEnd =
			delimiter &&
			raw.slice(nextStart - delimiter.length, nextStart) === delimiter
				? nextStart - delimiter.length
				: nextStart;
		const sourceStart = skipWhitespace(raw, marker.equals + 1);
		let valueStart = sourceStart;
		let valueEnd = trimEnd(raw, valueStart, sourceEnd);
		const first = raw[valueStart];
		const last = raw[valueEnd - 1];
		if (first && quoteCharacters.has(first) && last === first) {
			valueStart += 1;
			valueEnd -= 1;
		}
		return {
			name: marker.name,
			value: raw.slice(valueStart, valueEnd),
			start: marker.start,
			valueStart,
			end: valueEnd,
			sourceSpan: { start: sourceStart, end: valueEnd },
			valueSpan: { start: valueStart, end: valueEnd },
		};
	});
}

function segmentInput(
	raw: string,
	segment: NamedSegment,
	source: MacroArgumentInput["source"],
): MacroArgumentInput {
	return {
		name: segment.name,
		rawValue: segment.value,
		source,
		start: segment.valueSpan.start,
		end: segment.valueSpan.end,
		sourceSpan: segment.sourceSpan,
		valueSpan: segment.valueSpan,
		sourceText: raw.slice(segment.sourceSpan.start, segment.sourceSpan.end),
		valueText: segment.value,
	};
}

function matchInput(
	argument: MacroArgumentSpec,
	match: MacroArgumentMatch,
): MacroArgumentInput {
	return {
		name: argument.name,
		position: argument.position,
		rawValue: match.rawValue,
		captures: match.captures,
		source: match.source,
		start: match.extraction.start,
		end: match.extraction.end,
		sourceSpan: match.sourceSpan ?? match.extraction,
		valueSpan: match.valueSpan ?? match.extraction,
		valueText: match.rawValue,
		items: argument.itemDelimiter
			? splitListItems(
					match.rawValue,
					match.extraction.start,
					argument.itemDelimiter,
				)
			: undefined,
		match,
	};
}

function splitListItems(
	text: string,
	offset: number,
	delimiter: string,
): Array<{ rawValue: string; start: number; end: number }> {
	const items: Array<{ rawValue: string; start: number; end: number }> = [];
	let start = 0;
	let quote = "";
	let depth = 0;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]!;
		if (char === '"' || char === "'") {
			quote = quote ? (quote === char ? "" : quote) : char;
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
	items: Array<{ rawValue: string; start: number; end: number }>,
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

function compareMatches(
	left: MacroArgumentMatch,
	right: MacroArgumentMatch,
): number {
	return (
		(right.priority ?? 0) - (left.priority ?? 0) ||
		right.extraction.end -
			right.extraction.start -
			(left.extraction.end - left.extraction.start) ||
		left.extraction.start - right.extraction.start
	);
}

function isPendingTemplatePrefix(text: string, spec: MacroSpec): boolean {
	const forms = [
		...(spec.authoringTemplates ?? []),
		...spec.arguments.flatMap((argument) =>
			(argument.forms ?? []).map((form) => form.template),
		),
	];
	return forms.some((template) => {
		let prefix = "";
		for (const part of template.parts) {
			if (part.kind === "slot") break;
			prefix += part.text;
		}
		return (
			Boolean(prefix.trimEnd()) && prefix.trimEnd().startsWith(text.trimEnd())
		);
	});
}

function splitByDelimiter(
	raw: string,
	region: MacroSpan,
	delimiter: string,
	syntax?: Partial<MacroSyntax>,
): MacroSpan[] {
	const parts: MacroSpan[] = [];
	let start = region.start;
	let quote = "";
	let escaped = false;
	let depth = 0;
	const quoteCharacters = new Set(syntax?.quoteCharacters ?? []);
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

function spansOverlap(left: MacroSpan, right: MacroSpan): boolean {
	return left.start < right.end && right.start < left.end;
}

function uniqueMatches(
	matches: readonly MacroArgumentMatch[],
): MacroArgumentMatch[] {
	const seen = new Set<string>();
	return matches.filter((match) => {
		const key = `${match.argumentId}:${match.extraction.start}:${match.extraction.end}:${match.source}:${match.sourceId ?? ""}:${match.rawValue}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function execAll(expression: RegExp, text: string): RegExpExecArray[] {
	const results: RegExpExecArray[] = [];
	let match = expression.exec(text);
	while (match) {
		results.push(match);
		if (!match[0].length) expression.lastIndex += 1;
		match = expression.exec(text);
	}
	return results;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function scanUntilWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && !/\s/u.test(text[index]!)) index += 1;
	return index;
}
function skipWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && /\s/u.test(text[index]!)) index += 1;
	return index;
}
function trimEnd(text: string, start: number, end: number): number {
	let index = end;
	while (index > start && /\s/u.test(text[index - 1]!)) index -= 1;
	return index;
}
