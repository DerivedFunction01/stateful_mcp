import type {
	ExpressionBackend,
	ExpressionCandidate,
} from "../contracts/backends";
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
import { spansOverlap } from "../contracts/matching";
import type { MacroSyntax } from "../contracts/syntax";
import {
	matchFriendlyMacroForms,
	resolveMacroArgumentMatches,
} from "../matcher/friendly";
import { escapeRegex, execAll } from "../values/regex";
import {
	scanConceptTokenParts,
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

	const friendly = matchFriendlyMacroForms(raw, envelope.body.start, spec);
	allCandidates.push(...friendly);
	for (const match of friendly) {
		if (used.has(match.argumentId)) continue;
		used.add(match.argumentId);
		selectedMatches.push(match);
		const argument = spec.arguments.find(
			(item) => item.argumentId === match.argumentId,
		);
		if (argument) arguments_.push(matchInput(argument, match, syntax));
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
					message: `Required argument '${argument.name}' is missing`,
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
				const tokenPrefix = findLookupToken(raw, sourceStart, argument, syntax);
				const isConceptToken = Boolean(
					tokenPrefix && tokenPrefix === syntax.conceptToken,
				);
				const conceptParts = isConceptToken
					? scanConceptTokenParts(
							raw.slice(sourceStart, sourceEnd),
							sourceStart,
							syntax,
						)
					: undefined;
				const lookupStart = conceptParts
					? conceptParts.termSpan.start
					: tokenPrefix
						? sourceStart + tokenPrefix.length
						: sourceStart;
				const lookupEnd = conceptParts ? conceptParts.termSpan.end : sourceEnd;
				const matches = matchArgument(
					argument,
					raw.slice(lookupStart, lookupEnd),
					lookupStart,
					false,
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
							extraction: {
								start: tokenPrefix ? sourceStart : match.extraction.start,
								end: tokenPrefix ? sourceEnd : match.extraction.end,
							},
							rawValue: tokenPrefix
								? raw.slice(sourceStart, sourceEnd)
								: match.rawValue,
							conceptId: conceptParts?.conceptCode ?? match.conceptId,
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
			if (isBetterAssignment(selected, best, specs, tokens, options.subOrder))
				best = selected;
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

function findLookupToken(
	raw: string,
	start: number,
	argument: MacroArgumentSpec,
	syntax?: Partial<MacroSyntax>,
): string | undefined {
	if (
		!asMatchers(argument.matcher).some(
			(matcher) => matcher.kind === "expression",
		)
	) {
		return undefined;
	}
	return [syntax?.expressionToken, syntax?.conceptToken].find((token) =>
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
			const snapshot = options.candidateSnapshots?.find(
				(candidateSet) =>
					candidateSet.resolverId === matcher.backendId &&
					candidateSet.argumentId === argument.argumentId,
			);

			if (snapshot) {
				if (
					snapshot.ownerExtensionId &&
					backend?.ownerExtensionId &&
					snapshot.ownerExtensionId !== backend.ownerExtensionId
				) {
					diagnostics.push({
						code: "CROSS_RESOURCE_CANDIDATE_REJECTED",
						argumentId: argument.argumentId,
						message: `Candidate snapshot from extension '${snapshot.ownerExtensionId}' rejected for resolver '${matcher.backendId}' owned by '${backend.ownerExtensionId}'`,
					});
					return [];
				}
				if (
					snapshot.resourceId &&
					backend?.resourceId &&
					snapshot.resourceId !== backend.resourceId
				) {
					diagnostics.push({
						code: "CROSS_RESOURCE_CANDIDATE_REJECTED",
						argumentId: argument.argumentId,
						message: `Candidate snapshot from resource '${snapshot.resourceId}' rejected for resolver '${matcher.backendId}'`,
					});
					return [];
				}

				if (backend) {
					const backendVersion = backend.backendVersion ?? backend.version;
					if (
						backendVersion !== undefined &&
						String(snapshot.version) !== String(backendVersion)
					) {
						diagnostics.push({
							code: "STALE_SNAPSHOT",
							argumentId: argument.argumentId,
							message: `Candidate snapshot version '${snapshot.version}' is stale for resolver '${matcher.backendId}' (current: '${backendVersion}')`,
						});
						// Invalidate and fallback to live backend lookup
						const candidates = backend.search({
							backendId: matcher.backendId,
							argumentId: argument.argumentId,
							text: raw.slice(region.start, region.end),
							offset: region.start,
						});
						return candidates
							.filter(
								(candidate) =>
									candidate.start >= 0 &&
									candidate.end <= region.end - region.start,
							)
							.map((candidate) =>
								expressionMatch(
									argument,
									candidate,
									region.start,
									matcher.backendId,
									backendVersion,
									undefined,
									backend,
								),
							);
					}
				}
				// Snapshot is primary and valid
				return snapshot.candidates
					.filter((candidate) => {
						if (
							candidate.ownerExtensionId &&
							backend?.ownerExtensionId &&
							candidate.ownerExtensionId !== backend.ownerExtensionId
						) {
							diagnostics.push({
								code: "CROSS_RESOURCE_CANDIDATE_REJECTED",
								argumentId: argument.argumentId,
								message: `Candidate '${candidate.id}' from extension '${candidate.ownerExtensionId}' rejected for resolver '${matcher.backendId}'`,
							});
							return false;
						}
						return (
							candidate.start >= 0 && candidate.end <= region.end - region.start
						);
					})
					.map((candidate) =>
						expressionMatch(
							argument,
							candidate,
							region.start,
							matcher.backendId,
							snapshot.resolverVersion ?? snapshot.version,
							snapshot.version,
							backend,
							snapshot,
						),
					);
			}

			if (backend) {
				const backendVersion = backend.backendVersion ?? backend.version;
				const candidates = backend.search({
					backendId: matcher.backendId,
					argumentId: argument.argumentId,
					text: raw.slice(region.start, region.end),
					offset: region.start,
				});
				return candidates
					.filter(
						(candidate) =>
							candidate.start >= 0 &&
							candidate.end <= region.end - region.start,
					)
					.map((candidate) =>
						expressionMatch(
							argument,
							candidate,
							region.start,
							matcher.backendId,
							backendVersion,
							undefined,
							backend,
						),
					);
			}

			diagnostics.push({
				code: "BACKEND_MISSING",
				argumentId: argument.argumentId,
				message: `Expression backend '${matcher.backendId}' is not available`,
			});
			return [];
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
		const cleanFlags = flags.replace(/g/g, "");
		const withU = cleanFlags.includes("u") ? cleanFlags : `${cleanFlags}u`;
		const expression = new RegExp(`(?:${source})`, `${withU}gid`);
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
	resolverId: string,
	resolverVersion?: string | number,
	snapshotVersion?: string | number,
	backend?: ExpressionBackend,
	snapshot?: import("../contracts/composition").MacroCandidateSnapshot,
): MacroArgumentMatch {
	const ownerExtensionId =
		candidate.ownerExtensionId ??
		snapshot?.ownerExtensionId ??
		backend?.ownerExtensionId;
	const resourceId =
		candidate.resourceId ?? snapshot?.resourceId ?? backend?.resourceId;
	return {
		argumentId: argument.argumentId,
		source: "expression",
		extraction: {
			start: offset + candidate.start,
			end: offset + candidate.end,
		},
		rawValue: candidate.term,
		canonicalValue: candidate.canonicalValue,
		backendId: resolverId,
		resolverId,
		resolverVersion,
		snapshotVersion,
		ownerExtensionId,
		resourceId,
		sourceId: candidate.id,
		conceptId: candidate.conceptId,
		priority: candidate.priority,
		matchKind: candidate.matchKind,
		captures: { value: candidate.term },
		metadata: candidate.metadata,
	};
}

function asMatchers(matcher: MacroArgumentSpec["matcher"]): MacroMatcher[] {
	if (!matcher) return [];
	return Array.isArray(matcher)
		? Array.from(matcher)
		: [matcher as MacroMatcher];
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
	const kindScore = (m: MacroArgumentMatch) =>
		m.matchKind === "prefix" ? 0 : 1;
	return (
		kindScore(right) - kindScore(left) ||
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
