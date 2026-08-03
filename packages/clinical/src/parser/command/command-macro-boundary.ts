export type MacroBoundaryUnit = "items" | "words" | "chars" | "sentences" | "paragraphs";

export interface MacroDistancePolicy {
	maxLeft?: number;
	maxRight?: number;
	unit?: MacroBoundaryUnit;
	stopWordPolicy?: "include" | "exclude" | "count_but_ignore_for_match";
	crossBoundaries?: boolean;
	boundaryDelimiterOverride?: string;
	boundaryTransitionalWords?: string[];
}

export interface MacroBoundaryPolicy extends MacroDistancePolicy {
	direction?: "left" | "right" | "both" | "nearest";
	anchor?: "macro_start" | "macro_end" | "slot_start" | "slot_end" | "previous_slot" | "next_slot" | "parent_match" | "centroid";
	maxCharacters?: number;
	maxWords?: number;
	maxSentences?: number;
	maxParagraphs?: number;
}

export interface MacroBoundaryContext {
	stopWords?: ReadonlySet<string>;
	boundaryDelimiter?: string;
	transitionalWords?: readonly string[];
}

export interface MacroBoundaryEvidence {
	accepted: boolean;
	distance: { chars: number; words: number; sentences: number; paragraphs: number };
	reasons: string[];
}

function words(text: string, stopWords?: ReadonlySet<string>, policy?: MacroBoundaryPolicy): string[] {
	const values = text.match(/[\p{L}\p{N}_]+/gu) ?? [];
	if (policy?.stopWordPolicy === "exclude" && stopWords) return values.filter((word) => !stopWords.has(word.toLocaleLowerCase()));
	return values;
}

function distanceText(input: string, start: number, end: number, policy: MacroBoundaryPolicy, context: MacroBoundaryContext): string {
	const gap = input.slice(Math.min(start, end), Math.max(start, end));
	if (policy.crossBoundaries) return gap;
	const delimiter = policy.boundaryDelimiterOverride ?? context.boundaryDelimiter;
	if (delimiter && gap.includes(delimiter)) return gap.slice(0, gap.indexOf(delimiter));
	return gap;
}

export function evaluateMacroBoundary(
	input: string,
	span: { start: number; end: number },
	anchor: { start: number; end: number },
	policy: MacroBoundaryPolicy = {},
	context: MacroBoundaryContext = {},
): MacroBoundaryEvidence {
	const gap = distanceText(input, span.start, anchor.end <= span.start ? anchor.end : anchor.start, policy, context);
	const distance = {
		chars: gap.length,
		words: words(gap, context.stopWords, policy).length,
		sentences: (gap.match(/[.!?]+(?=\s|$)/gu) ?? []).length,
		paragraphs: (gap.match(/\n\s*\n/gu) ?? []).length,
	};
	const reasons: string[] = [];
	const unit = policy.unit ?? "words";
	const directionalDistance = unit === "items" ? distance.words : distance[unit];
	const direction = span.start >= anchor.end ? "right" : "left";
	if (policy.direction && policy.direction !== "both" && policy.direction !== "nearest" && policy.direction !== direction) reasons.push(`candidate is on the ${direction}, expected ${policy.direction}`);
	const max = direction === "left" ? policy.maxLeft : policy.maxRight;
	if (max !== undefined && directionalDistance > max) reasons.push(`${unit} distance ${directionalDistance} exceeds ${max}`);
	if (policy.maxCharacters !== undefined && distance.chars > policy.maxCharacters) reasons.push(`character distance ${distance.chars} exceeds ${policy.maxCharacters}`);
	if (policy.maxWords !== undefined && distance.words > policy.maxWords) reasons.push(`word distance ${distance.words} exceeds ${policy.maxWords}`);
	if (policy.maxSentences !== undefined && distance.sentences > policy.maxSentences) reasons.push(`sentence distance ${distance.sentences} exceeds ${policy.maxSentences}`);
	if (policy.maxParagraphs !== undefined && distance.paragraphs > policy.maxParagraphs) reasons.push(`paragraph distance ${distance.paragraphs} exceeds ${policy.maxParagraphs}`);
	if (!policy.crossBoundaries && context.transitionalWords?.length && context.transitionalWords.some((word) => gap.toLocaleLowerCase().includes(word.toLocaleLowerCase()))) reasons.push("crossed a boundary without an allowed transition");
	return { accepted: reasons.length === 0, distance, reasons };
}

export function evaluateMacroEnvelope(input: string, commandEnd: number, policy: MacroBoundaryPolicy = {}, context: MacroBoundaryContext = {}): MacroBoundaryEvidence {
	return evaluateMacroBoundary(input, { start: input.length, end: input.length }, { start: commandEnd, end: commandEnd }, { ...policy, direction: "right", anchor: "macro_start" }, context);
}
