export type WordBoundaryMode = "none" | "before" | "after" | "both";

export interface PatternAnchorOptions {
	/** Word boundary configuration for the pattern. */
	wordBoundary?: WordBoundaryMode;

	/** Words or phrases that must NOT appear directly before the capture/pattern (negative lookbehind). */
	ignoreLookbehinds?: readonly string[];

	/** Words or phrases that must NOT appear directly after the capture/pattern (negative lookahead). */
	ignoreLookaheads?: readonly string[];

	/** Words or phrases that MUST appear before the capture/pattern (positive lookbehind). */
	requiredLookbehinds?: readonly string[];

	/** Words or phrases that MUST appear after the capture/pattern (positive lookahead). */
	requiredLookaheads?: readonly string[];

	/** Optional text or pattern that must precede the match with bounded distance. */
	precedingAnchor?: {
		pattern: string;
		maxDistance?: number;
		unit?: "chars" | "words";
	};

	/** Optional text or pattern that must follow the match with bounded distance. */
	followingAnchor?: {
		pattern: string;
		maxDistance?: number;
		unit?: "chars" | "words";
	};

	/** Full-span line/string start anchor. */
	anchorStart?: boolean;

	/** Full-span line/string end anchor. */
	anchorEnd?: boolean;
}

export function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function applyWordBoundary(
	pattern: string,
	boundary: WordBoundaryMode = "none",
): string {
	const prefix =
		boundary === "before" || boundary === "both" ? "(?<![\\p{L}\\p{N}_])" : "";
	const suffix =
		boundary === "after" || boundary === "both" ? "(?![\\p{L}\\p{N}_])" : "";
	return `${prefix}${pattern}${suffix}`;
}

/**
 * Builds an anchored, bounded, lookahead/behind guarded regex pattern around a base pattern or capture group.
 */
export function buildPatternWithAnchors(
	basePattern: string,
	options: PatternAnchorOptions = {},
): string {
	let result = basePattern;

	// 1. Word boundaries
	if (options.wordBoundary && options.wordBoundary !== "none") {
		result = applyWordBoundary(result, options.wordBoundary);
	}

	// 2. Negative lookbehinds (phrases to ignore/reject if directly preceding)
	if (options.ignoreLookbehinds?.length) {
		const lookbehindPattern = options.ignoreLookbehinds
			.map(escapeRegex)
			.join("|");
		result = `(?<!(?:${lookbehindPattern})\\s*)${result}`;
	}

	// 3. Positive lookbehinds (phrases that must precede)
	if (options.requiredLookbehinds?.length) {
		const lookbehindPattern = options.requiredLookbehinds
			.map(escapeRegex)
			.join("|");
		result = `(?<=(?:${lookbehindPattern})\\s*)${result}`;
	}

	// 4. Negative lookaheads (phrases to ignore/reject if directly following)
	if (options.ignoreLookaheads?.length) {
		const lookaheadPattern = options.ignoreLookaheads
			.map(escapeRegex)
			.join("|");
		result = `${result}(?!\\s*(?:${lookaheadPattern}))`;
	}

	// 5. Positive lookaheads (phrases that must follow)
	if (options.requiredLookaheads?.length) {
		const lookaheadPattern = options.requiredLookaheads
			.map(escapeRegex)
			.join("|");
		result = `${result}(?=\\s*(?:${lookaheadPattern}))`;
	}

	// 6. Preceding anchor with distance
	if (options.precedingAnchor) {
		const dist = options.precedingAnchor.maxDistance ?? 0;
		const unit = options.precedingAnchor.unit ?? "words";
		const gap =
			unit === "chars"
				? `.{0,${dist}}`
				: `(?:\\s+[^\\s\\p{P}]+){0,${dist}}\\s*`;
		result = `(?:${options.precedingAnchor.pattern})${gap}${result}`;
	}

	// 7. Following anchor with distance
	if (options.followingAnchor) {
		const dist = options.followingAnchor.maxDistance ?? 0;
		const unit = options.followingAnchor.unit ?? "words";
		const gap =
			unit === "chars"
				? `.{0,${dist}}`
				: `(?:\\s+[^\\s\\p{P}]+){0,${dist}}\\s*`;
		result = `${result}${gap}(?:${options.followingAnchor.pattern})`;
	}

	// 8. Start / End string anchors
	const startAnchor = options.anchorStart ? "^\\s*" : "";
	const endAnchor = options.anchorEnd ? "\\s*$" : "";

	return `${startAnchor}${result}${endAnchor}`;
}
