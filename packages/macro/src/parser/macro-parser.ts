import type { ExpressionCandidate } from "../contracts/backends";
import type {
	MacroArgumentInput,
	MacroDiagnostic,
	MacroInput,
	MacroSpan,
} from "../contracts/input";
import type { MacroArgumentMatch } from "../contracts/matching";
import type {
	MacroArgumentSpec,
	MacroMatcher,
	MacroParseOptions,
	MacroSpec,
} from "../contracts/macro";
import { defaultMacroSyntax } from "../contracts/syntax";
import { matchFriendlyMacroForms, resolveMacroArgumentMatches } from "../matcher/friendly";

export interface ParseMacroLineResult extends MacroInput {
	diagnostics: MacroDiagnostic[];
}

export function parseMacroLine(
	raw: string,
	spec: MacroSpec,
	options: MacroParseOptions = {},
): ParseMacroLineResult | null {
	const syntax = { ...defaultMacroSyntax, ...spec.syntax, ...options.profile };
	const leading = raw.search(/\S/u);
	if (leading < 0 || !raw.startsWith(syntax.macroStartToken, leading)) return null;
	const nameStart = leading + syntax.macroStartToken.length;
	const nameEnd = scanUntilWhitespace(raw, nameStart);
	const macroName = raw.slice(nameStart, nameEnd);
	if (!macroName || macroName.toLocaleLowerCase() !== spec.name.toLocaleLowerCase()) {
		return null;
	}

	const diagnostics: MacroDiagnostic[] = [];
	const bodyStart = skipWhitespace(raw, nameEnd);
	const named = scanNamedAssignments(raw, bodyStart, diagnostics, syntax.argumentDelimiter);
	const arguments_: MacroArgumentInput[] = [];
	const matches: MacroArgumentMatch[] = [];
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
			arguments_.push({
				name: segment.name,
				rawValue: segment.value,
				source: "named",
				start: segment.valueStart,
				end: segment.end,
			});
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
		const matched = matchArgument(
			argument,
			segment.value,
			segment.valueStart,
			true,
			options,
			diagnostics,
		);
		if (matched) {
			matches.push(matched);
			arguments_.push({
				name: segment.name,
				position: argument.position,
				rawValue: matched.rawValue,
				captures: matched.captures,
				source: matched.source,
				start: matched.extraction.start,
				end: matched.extraction.end,
				match: matched,
			});
		} else {
			arguments_.push({
				name: segment.name,
				position: argument.position,
				rawValue: segment.value,
				source: "named",
				start: segment.valueStart,
				end: segment.end,
			});
		}
	}

	const friendly = matchFriendlyMacroForms(raw, bodyStart, spec);
	for (const match of friendly) {
		if (used.has(match.argumentId)) continue;
		used.add(match.argumentId);
		matches.push(match);
		const argument = spec.arguments.find((item) => item.argumentId === match.argumentId);
		if (argument) {
			arguments_.push({
				name: argument.name,
				rawValue: match.rawValue,
				captures: match.captures,
				source: "friendly",
				start: match.extraction.start,
				end: match.extraction.end,
				match,
			});
		}
	}

	const blocked = [
		...named.map((segment) => ({ start: segment.start, end: segment.end })),
		...friendly.map((match) => ({
			start: match.anchor?.start ?? match.extraction.start,
			end: match.anchor?.end ?? match.extraction.end,
		})),
	];
	const regions = findUnmatchedRegions(raw, bodyStart, blocked);
	if (regions.length && (spec.matching?.positionalFallback ?? false)) {
		const remaining = spec.arguments.filter((argument) => !used.has(argument.argumentId));
		const positionalCandidates = regions.flatMap((region) =>
			remaining.flatMap((argument) =>
				findArgumentMatches(argument, raw, region, options, diagnostics),
			),
		);
		for (const match of resolveMacroArgumentMatches(positionalCandidates, spec)) {
			if (used.has(match.argumentId)) continue;
			used.add(match.argumentId);
			matches.push(match);
			const argument = spec.arguments.find((item) => item.argumentId === match.argumentId);
			if (argument) {
				arguments_.push({
					name: argument.name,
					position: argument.position,
					rawValue: match.rawValue,
					captures: match.captures,
					source: match.source,
					start: match.extraction.start,
					end: match.extraction.end,
					match,
				});
			}
		}
	}

	for (const argument of spec.arguments) {
		if ((argument.required ?? false) && !used.has(argument.argumentId)) {
			diagnostics.push({
				code: "MISSING_REQUIRED",
				argumentId: argument.argumentId,
				message: `Required argument '${argument.name}' is missing`,
			});
		}
	}

	return {
		macroName: spec.name,
		sourceLines: [{ line: options.lineNumber ?? 0, raw, macroName: spec.name }],
		arguments: arguments_.sort((left, right) => (left.start ?? 0) - (right.start ?? 0)),
		body: { start: bodyStart, end: raw.length, raw: raw.slice(bodyStart) },
		matches: resolveMacroArgumentMatches(matches, spec),
		diagnostics,
	};
}

interface NamedSegment {
	name: string;
	value: string;
	start: number;
	valueStart: number;
	end: number;
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
			return backend.search({
				backendId: matcher.backendId,
				argumentId: argument.argumentId,
				text: raw,
				offset: region.start,
			}).filter((candidate) => candidate.start >= region.start && candidate.end <= region.end)
				.map((candidate) => expressionMatch(argument, candidate));
		}
		return scanPatternMatches(argument, matcher, raw, region, diagnostics);
	});
}

function matchArgument(
	argument: MacroArgumentSpec,
	text: string,
	offset: number,
	isNamed: boolean,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch | undefined {
	const region = { start: offset, end: offset + text.length };
	const matches = findArgumentMatches(argument, text, { start: 0, end: text.length }, options, diagnostics)
		.map((match) => ({ ...match, extraction: { start: match.extraction.start + offset, end: match.extraction.end + offset }, anchor: match.anchor ? { start: match.anchor.start + offset, end: match.anchor.end + offset } : undefined }));
	if (matches.length) return matches.sort(compareMatches)[0];
	if (isNamed && !argument.matcher) {
		const trimmed = text.trim();
		if (!trimmed) return undefined;
		const start = offset + text.indexOf(trimmed);
		return {
			argumentId: argument.argumentId,
			source: "named",
			extraction: { start, end: start + trimmed.length },
			rawValue: trimmed,
			matchKind: "literal",
		};
	}
	return undefined;
}

function scanPatternMatches(
	argument: MacroArgumentSpec,
	matcher: Extract<MacroMatcher, { kind: "pattern" | "literal" }>,
	raw: string,
	region: MacroSpan,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch[] {
	const pattern = matcher.kind === "literal" ? escapeRegex(matcher.text) : matcher.pattern;
	const source = typeof pattern === "string" ? pattern : pattern.source;
	const flags = matcher.kind === "pattern"
		? matcher.flags ?? (typeof pattern === "string" ? "" : pattern.flags)
		: "";
	try {
		const expression = new RegExp(`(?:${source})`, `${flags.replace(/g/g, "")}gid`);
		const results: MacroArgumentMatch[] = [];
		for (const match of execAll(expression, raw.slice(region.start))) {
			if (!match.indices) continue;
			const start = region.start + match.index;
			const end = start + match[0].trimEnd().length;
			if (end <= start) continue;
			const captureSpans = Object.entries(match.groups ?? {}).flatMap(([name, value]) => {
				const span = match.indices?.groups?.[name];
				return span ? [{ name, value, start: region.start + span[0], end: region.start + span[1] }] : [];
			});
			results.push({
				argumentId: argument.argumentId,
				source: "inferred",
				extraction: { start, end },
				rawValue: raw.slice(start, end),
				captures: match.groups ?? {},
				captureSpans,
				matchKind: matcher.kind === "literal" ? "literal" : "pattern",
			});
		}
		return results;
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
): MacroArgumentMatch {
	return {
		argumentId: argument.argumentId,
		source: "expression",
		extraction: { start: candidate.start, end: candidate.end },
		rawValue: candidate.term,
		canonicalValue: candidate.canonicalValue,
		sourceId: candidate.id,
		conceptId: candidate.conceptId,
		priority: candidate.priority,
		matchKind: candidate.matchKind,
		captures: { value: candidate.term },
	};
}

function asMatchers(matcher: MacroArgumentSpec["matcher"]): MacroMatcher[] {
	return matcher
		? Array.isArray(matcher)
			? [...matcher] as MacroMatcher[]
			: [matcher] as MacroMatcher[]
		: [];
}

function resolveArgument(name: string, spec: MacroSpec): MacroArgumentSpec | undefined {
	const normalized = name.toLocaleLowerCase();
	return spec.arguments.find(
		(argument) =>
			argument.name.toLocaleLowerCase() === normalized ||
			argument.argumentId.toLocaleLowerCase() === normalized ||
			argument.aliases?.some((alias) => alias.toLocaleLowerCase() === normalized),
	);
}

function findUnmatchedRegions(
	raw: string,
	start: number,
	blocked: MacroSpan[],
	): MacroSpan[] {
	const sorted = [...blocked].sort((left, right) => left.start - right.start);
	let cursor = start;
	const regions: MacroSpan[] = [];
	for (const span of sorted) {
		if (span.start > cursor && /\S/u.test(raw.slice(cursor, span.start))) {
			regions.push({ start: skipWhitespace(raw, cursor), end: span.start });
		}
		cursor = Math.max(cursor, span.end);
	}
	if (/\S/u.test(raw.slice(cursor))) regions.push({ start: skipWhitespace(raw, cursor), end: raw.length });
	return regions;
}

function scanNamedAssignments(
	raw: string,
	start: number,
	diagnostics: MacroDiagnostic[],
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
		const followsDelimiter = delimiter !== undefined && raw.slice(index - delimiter.length, index) === delimiter;
		if (depth || (index > start && !/\s/u.test(raw[index - 1]!) && !followsDelimiter)) continue;
		const match = /^[A-Za-z_][\w-]*=/.exec(raw.slice(index));
		if (match) markers.push({ name: match[0].slice(0, -1), start: index, equals: index + match[0].length - 1 });
	}
	if (quote) diagnostics.push({ code: "UNTERMINATED_QUOTE", message: "Unterminated quote", start, end: raw.length });
	if (depth) diagnostics.push({ code: "UNTERMINATED_GROUP", message: "Unterminated grouped value", start, end: raw.length });
	return markers.map((marker, index) => {
		const nextStart = markers[index + 1]?.start ?? raw.length;
		const delimiterEnd = delimiter && raw.slice(nextStart - delimiter.length, nextStart) === delimiter ? nextStart - delimiter.length : nextStart;
		let valueStart = skipWhitespace(raw, marker.equals + 1);
		let valueEnd = trimEnd(raw, valueStart, delimiterEnd);
		const first = raw[valueStart];
		const last = raw[valueEnd - 1];
		if ((first === '"' || first === "'") && last === first) {
			valueStart += 1;
			valueEnd -= 1;
		}
		return { name: marker.name, value: raw.slice(valueStart, valueEnd), start: marker.start, valueStart, end: valueEnd };
	});
}

function compareMatches(left: MacroArgumentMatch, right: MacroArgumentMatch): number {
	return (right.priority ?? 0) - (left.priority ?? 0) ||
		(right.extraction.end - right.extraction.start) - (left.extraction.end - left.extraction.start) ||
		left.extraction.start - right.extraction.start;
}

function execAll(expression: RegExp, text: string): RegExpExecArray[] {
	const results: RegExpExecArray[] = [];
	let match = expression.exec(text);
	while (match) {
		results.push(match);
		if (match[0].length === 0) expression.lastIndex += 1;
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
