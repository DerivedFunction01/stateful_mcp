import type {
	MacroArgumentInput,
	MacroDiagnostic,
	MacroInput,
	MacroSpan,
} from "../contracts/input";
import type {
	MacroArgumentSpec,
	MacroParseOptions,
	MacroSpec,
} from "../contracts/macro";
import type { MacroArgumentMatch } from "../contracts/matching";
import { spansOverlap } from "../contracts/matching";
import type { MacroSyntax } from "../contracts/syntax";
import { findConfiguredValueMatches } from "../values/engine";
import {
	scanNamedAssignments,
	scanUntilWhitespace,
	skipWhitespace,
	splitByDelimiter,
	splitListItems,
	tokenizePositionalTokens,
	uniqueMatches,
} from "./macro-scanner";

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
	syntaxOrContext:
		| Pick<MacroSyntax, "macroStartToken">
		| Partial<MacroSyntax>
		| { syntax: MacroSyntax },
): MacroEnvelope | null {
	const syntax =
		"syntax" in syntaxOrContext ? syntaxOrContext.syntax : syntaxOrContext;
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
	options: MacroParseOptions,
): ParseMacroLineResult | null {
	const syntax = options.context.syntax;
	const envelope = parseMacroEnvelope(raw, syntax);
	if (
		!envelope ||
		envelope.macroName.toLocaleLowerCase() !== spec.name.toLocaleLowerCase()
	) {
		return null;
	}

	const diagnostics: MacroDiagnostic[] = [];
	const named = scanNamedAssignments(
		raw,
		envelope.body.start,
		diagnostics,
		syntax,
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
				message: "errors.unknownArgument",
				messageKey: "errors.unknownArgument",
				messageParams: { argumentName: segment.name },
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
				message: "errors.duplicateArgument",
				messageKey: "errors.duplicateArgument",
				messageParams: { argumentName: argument.name },
				start: segment.start,
				end: segment.end,
			});
			continue;
		}

		const semanticMatches = matchArgument(
			argument,
			segment.value,
			segment.valueSpan.start,
			options,
			diagnostics,
		);
		const candidateMatches = uniqueMatches(semanticMatches);
		allCandidates.push(...candidateMatches);
		const rankedMatches = candidateMatches.sort(compareMatches);
		const matched =
			rankedMatches[0]?.stability === "ambiguous"
				? undefined
				: rankedMatches[0];
		if (rankedMatches[0]?.stability === "ambiguous") {
			diagnostics.push({
				code: "AMBIGUOUS_MATCH",
				argumentId: argument.argumentId,
				message: "errors.ambiguousMatch",
				messageKey: "errors.ambiguousMatch",
				messageParams: { argumentName: argument.name },
				start: segment.valueSpan.start,
				end: segment.valueSpan.end,
			});
		}

		if (matched) {
			used.add(argument.argumentId);
			if (matched.extraction.end < segment.valueSpan.end) {
				segment.end = matched.extraction.end;
				segment.sourceSpan = {
					start: segment.sourceSpan.start,
					end: matched.extraction.end,
				};
				segment.valueSpan = {
					start: segment.valueSpan.start,
					end: matched.extraction.end,
				};
				segment.value = raw.slice(
					segment.valueSpan.start,
					matched.extraction.end,
				);
			}
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
			// Consume only the first token for an invalid named assignment.
			// This leaves later positional values eligible for inference.
			const isQuoted = segment.valueSpan.start > segment.sourceSpan.start;
			if (isQuoted) {
				segment.end = segment.sourceSpan.end;
			} else {
				let invalidEnd = scanUntilWhitespace(raw, segment.valueSpan.start);
				if (invalidEnd === segment.valueSpan.start) {
					invalidEnd = segment.valueSpan.end;
				}
				segment.end = invalidEnd;
				segment.sourceSpan = {
					start: segment.sourceSpan.start,
					end: invalidEnd,
				};
				segment.valueSpan = { start: segment.valueSpan.start, end: invalidEnd };
				segment.value = raw.slice(segment.valueSpan.start, invalidEnd);
			}
			arguments_.push(segmentInput(raw, segment, "named"));
		}
	}

	const blocked = [
		...named.map((segment) => ({ start: segment.start, end: segment.end })),
	];
	const regions = findUnmatchedRegions(
		raw,
		envelope.body.start,
		blocked,
		syntax.argumentDelimiter,
		syntax,
	);
	if (regions.length && (spec.matching?.positionalFallback ?? false)) {
		const remaining = spec.arguments.filter(
			(argument) => !used.has(argument.argumentId),
		);
		const inferred = regions.flatMap((region) => {
			if (isPendingTemplatePrefix(raw.slice(region.start, region.end), spec)) {
				return [];
			}
			return inferPositionalMatches(
				raw,
				region,
				remaining,
				options,
				syntax,
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
			if (argument) arguments_.push(matchInput(argument, item.match, syntax));
		}
	}

	for (const argument of spec.arguments) {
		if (used.has(argument.argumentId)) continue;
		if (argument.defaultValue === undefined) {
			if (argument.required) {
				diagnostics.push({
					code: "MISSING_REQUIRED",
					argumentId: argument.argumentId,
					message: "errors.missingRequiredArgument",
					messageKey: "errors.missingRequiredArgument",
					messageParams: { argumentName: argument.name },
				});
			}
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
		arguments_.push(matchInput(argument, defaultMatch, syntax));
	}

	return {
		macroName: spec.name,
		sourceLines: [{ line: options.lineNumber ?? 0, raw, macroName: spec.name }],
		arguments: arguments_.sort(
			(left, right) =>
				(left.start ?? Number.MAX_SAFE_INTEGER) -
				(right.start ?? Number.MAX_SAFE_INTEGER),
		),
		body: { ...envelope.body, raw: raw.slice(envelope.body.start) },
		matches: selectedMatches.sort(
			(left, right) => left.extraction.start - right.extraction.start,
		),
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

function inferPositionalMatches(
	raw: string,
	region: MacroSpan,
	specs: readonly MacroArgumentSpec[],
	options: MacroParseOptions,
	syntax: MacroSyntax,
	diagnostics: MacroDiagnostic[],
): PositionalInference[] {
	const tokens = tokenizePositionalTokens(raw, region, syntax);
	const candidates = specs.flatMap((argument) =>
		tokens.flatMap((token, startToken) => {
			return tokens.slice(startToken).flatMap((_, relativeEndToken) => {
				const endToken = startToken + relativeEndToken;
				const sourceStart = token.start;
				const sourceEnd = tokens[endToken]!.end;
				const lookupStart = sourceStart;
				const lookupEnd = sourceEnd;
				const matches = matchArgument(
					argument,
					raw.slice(lookupStart, lookupEnd),
					lookupStart,
					options,
					diagnostics,
				).filter(
					(match) =>
						match.extraction.start === lookupStart &&
						match.extraction.end === lookupEnd,
				);
				return matches.map(
					(match) =>
						({
							...match,
						}) as MacroArgumentMatch,
				);
			});
		}),
	);
	const selectionCandidates = candidates;

	let best: MacroArgumentMatch[] = [];
	const visit = (index: number, selected: MacroArgumentMatch[]) => {
		if (index >= specs.length) {
			if (isBetterAssignment(selected, best, specs, tokens, options.subOrder))
				best = selected;
			return;
		}
		visit(index + 1, selected);
		for (const candidate of selectionCandidates
			.filter((item) => item.argumentId === specs[index]!.argumentId)
			.filter((item) => item.stability !== "ambiguous")) {
			if (
				selected.some((item) =>
					spansOverlap(item.extraction, candidate.extraction),
				)
			) {
				continue;
			}
			visit(index + 1, [...selected, candidate]);
		}
	};
	visit(0, []);
	return best
		.sort((left, right) => left.extraction.start - right.extraction.start)
		.map((match) => ({ match, candidates }));
}

function getEffectivePosition(
	spec: MacroArgumentSpec,
	subOrder?: readonly string[],
): number {
	if (subOrder && subOrder.length > 0) {
		const nameIdx = subOrder.indexOf(spec.name);
		if (nameIdx !== -1) return nameIdx;
		const idIdx = subOrder.indexOf(spec.argumentId);
		if (idIdx !== -1) return idIdx;
	}
	return spec.position ?? 0;
}

function isBetterAssignment(
	left: readonly MacroArgumentMatch[],
	right: readonly MacroArgumentMatch[],
	specs: readonly MacroArgumentSpec[],
	tokens: readonly MacroSpan[],
	subOrder?: readonly string[],
): boolean {
	const required = (items: readonly MacroArgumentMatch[]) =>
		items.filter(
			(item) =>
				specs.find((spec) => spec.argumentId === item.argumentId)?.required,
		).length;
	if (left.length !== right.length) return left.length > right.length;
	if (required(left) !== required(right)) {
		return required(left) > required(right);
	}

	// Inversion penalty: if itemA has lower effective position than itemB,
	// but itemA appears after itemB in text, penalize this assignment.
	const countInversions = (items: readonly MacroArgumentMatch[]) => {
		let inversions = 0;
		for (let i = 0; i < items.length; i++) {
			for (let j = i + 1; j < items.length; j++) {
				const itemA = items[i]!;
				const itemB = items[j]!;
				const specA = specs.find((s) => s.argumentId === itemA.argumentId);
				const specB = specs.find((s) => s.argumentId === itemB.argumentId);
				if (!specA || !specB) continue;
				const posA = getEffectivePosition(specA, subOrder);
				const posB = getEffectivePosition(specB, subOrder);
				const startA = itemA.extraction.start;
				const startB = itemB.extraction.start;
				if (startA < startB && posA > posB) inversions++;
				if (startA > startB && posA < posB) inversions++;
			}
		}
		return inversions;
	};

	const leftInversions = countInversions(left);
	const rightInversions = countInversions(right);
	if (leftInversions !== rightInversions) {
		return leftInversions < rightInversions;
	}

	const positionCost = (items: readonly MacroArgumentMatch[]) =>
		items.reduce((total, item) => {
			const token = tokens.findIndex(
				(candidate) =>
					candidate.start === item.extraction.start ||
					(candidate.start < item.extraction.start &&
						candidate.end > item.extraction.start),
			);
			const spec = specs.find((s) => s.argumentId === item.argumentId);
			const pos = spec ? getEffectivePosition(spec, subOrder) : 0;
			return total + Math.abs(pos - token);
		}, 0);
	if (positionCost(left) !== positionCost(right)) {
		return positionCost(left) < positionCost(right);
	}
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

function matchArgument(
	argument: MacroArgumentSpec,
	text: string,
	offset: number,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch[] {
	const region = { start: 0, end: text.length };
	return findArgumentMatches(argument, text, region, options, diagnostics).map(
		(match) => ({
			...match,
			extraction: {
				start: match.extraction.start + offset,
				end: match.extraction.end + offset,
			},
			anchor: match.anchor
				? { start: match.anchor.start + offset, end: match.anchor.end + offset }
				: undefined,
		}),
	);
}

function findArgumentMatches(
	argument: MacroArgumentSpec,
	raw: string,
	region: MacroSpan,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch[] {
	if (argument.configuredValue) {
		return findConfiguredArgumentMatches(
			argument,
			raw,
			region,
			options,
			diagnostics,
		);
	}

	return [];
}

function matchDefault(
	argument: MacroArgumentSpec,
	value: string,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch | undefined {
	const matches = matchArgument(argument, value, 0, options, diagnostics);
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

function findConfiguredArgumentMatches(
	argument: MacroArgumentSpec,
	raw: string,
	region: MacroSpan,
	options: MacroParseOptions,
	diagnostics: MacroDiagnostic[],
): MacroArgumentMatch[] {
	const runtime = options.configuredValues;
	if (!runtime) {
		diagnostics.push({
			code: "BACKEND_MISSING",
			argumentId: argument.argumentId,
			message: "errors.backendMissing",
			messageKey: "errors.backendMissing",
			messageParams: {
				resolverId: argument.configuredValue?.consumerId ?? "configured-values",
			},
			start: region.start,
			end: region.end,
		});
		return [];
	}
	const configuredMatches = findConfiguredValueMatches(
		raw,
		runtime,
		argument.argumentId,
		[region],
		argument.configuredValue?.consumerId,
	);
	const ambiguous = configuredMatches.length > 1;
	return configuredMatches.map(({ candidate, start, end, rawText }) => ({
		argumentId: argument.argumentId,
		source: "configured",
		extraction: { start, end },
		rawValue: rawText,
		captures: candidate.captures,
		captureSpans: Object.entries(candidate.captureSpans).map(
			([name, span]) => ({
				name,
				value: candidate.captures[name],
				start: start + span.start,
				end: start + span.end,
			}),
		),
		canonicalValue: candidate.canonicalValue,
		conceptId:
			candidate.canonicalValue &&
			typeof candidate.canonicalValue === "object" &&
			"conceptId" in candidate.canonicalValue &&
			typeof candidate.canonicalValue.conceptId === "string"
				? candidate.canonicalValue.conceptId
				: undefined,
		displayValue: candidate.displayValue,
		priority: candidate.priority,
		recipeId: candidate.recipeId,
		variantPath: candidate.variantPath,
		recipeDiagnostics: candidate.diagnostics,
		recipeEvaluation: candidate.evaluation,
		matchKind: "exact",
		stability: ambiguous ? "ambiguous" : "stable",
	}));
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
		if (span.start > cursor && skipWhitespace(raw, cursor) < span.start) {
			regions.push({ start: skipWhitespace(raw, cursor), end: span.start });
		}
		cursor = Math.max(cursor, span.end);
	}
	if (skipWhitespace(raw, cursor) < raw.length) {
		regions.push({ start: skipWhitespace(raw, cursor), end: raw.length });
	}
	return delimiter
		? regions.flatMap((region) =>
				splitByDelimiter(raw, region, delimiter, syntax),
			)
		: regions;
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
	syntax?: Partial<MacroSyntax>,
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
					syntax,
				)
			: undefined,
		match,
	};
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
