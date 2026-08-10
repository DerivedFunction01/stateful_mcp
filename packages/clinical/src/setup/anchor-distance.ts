import type { SetupGapConstraint } from "./setup-types";

export interface AnchorDistance {
	maxLeft?: number;
	maxRight?: number;
	unit?: "items" | "words" | "chars";
	skipStopWords?: boolean;
	crossBoundaries?: boolean;
	boundaryDelimiterOverride?: string;
	boundaryTransitionalWords?: readonly string[];
	forbiddenWords?: readonly string[];
	allowedWords?: readonly string[];
}

export interface CompiledAnchorDistance {
	leftGap?: {
		min: number;
		max: number;
		unit: "items" | "words" | "chars";
		skipStopWords: boolean;
		crossBoundaries: boolean;
		forbiddenWords?: readonly string[];
		allowedWords?: readonly string[];
	};
	rightGap?: {
		min: number;
		max: number;
		unit: "items" | "words" | "chars";
		skipStopWords: boolean;
		crossBoundaries: boolean;
		forbiddenWords?: readonly string[];
		allowedWords?: readonly string[];
	};
}

export function compileAnchorDistance(
	anchor: AnchorDistance,
): CompiledAnchorDistance {
	const unit = anchor.unit ?? "words";
	const skipStopWords = Boolean(anchor.skipStopWords);
	const crossBoundaries = Boolean(anchor.crossBoundaries);

	return {
		leftGap:
			anchor.maxLeft !== undefined
				? {
						min: 0,
						max: anchor.maxLeft,
						unit,
						skipStopWords,
						crossBoundaries,
						forbiddenWords: anchor.forbiddenWords,
						allowedWords: anchor.allowedWords,
					}
				: undefined,
		rightGap:
			anchor.maxRight !== undefined
				? {
						min: 0,
						max: anchor.maxRight,
						unit,
						skipStopWords,
						crossBoundaries,
						forbiddenWords: anchor.forbiddenWords,
						allowedWords: anchor.allowedWords,
					}
				: undefined,
	};
}

export function anchorDistanceToGapConstraint(
	gapId: string,
	fromSlot: string,
	toSlot: string,
	anchor: AnchorDistance,
): SetupGapConstraint {
	return {
		gapId,
		fromSlot,
		toSlot,
		min: 0,
		max: anchor.maxRight ?? anchor.maxLeft ?? 0,
		unit: anchor.unit ?? "words",
		skipStopWords: anchor.skipStopWords,
		crossBoundaries: anchor.crossBoundaries,
		boundaryDelimiterOverride: anchor.boundaryDelimiterOverride,
		boundaryTransitionalWords: anchor.boundaryTransitionalWords
			? [...anchor.boundaryTransitionalWords]
			: undefined,
		allowedWords: anchor.allowedWords ? [...anchor.allowedWords] : undefined,
		forbiddenWords: anchor.forbiddenWords
			? [...anchor.forbiddenWords]
			: undefined,
	};
}
