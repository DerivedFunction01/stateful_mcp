import type { PipelineStep } from "@stateful-mcp/core";

export interface SharedFieldAnchorDistance {
	maxLeft?: number;
	maxRight?: number;
	unit?: "items" | "words" | "chars";
	skipStopWords?: boolean;
}

export interface SharedFieldAnchorCondition {
	pipeline: PipelineStep[];
}

export interface SharedFieldAnchor {
	source: string;
	targetField: string;
	relation: "duration" | "qualifier" | "trigger" | "supporting";
	distance?: SharedFieldAnchorDistance;
	anchorPattern?: string;
	anchorPatternCaseInsensitive?: boolean;
	condition?: SharedFieldAnchorCondition;
}
