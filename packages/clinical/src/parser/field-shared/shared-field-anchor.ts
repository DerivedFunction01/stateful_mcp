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

export interface SharedFieldAnchorRule {
	ruleId: string;
	targetSchema: string;
	anchors: SharedFieldAnchor[];
	workspaceId?: string;
	personnelId?: string;
}

export interface SharedFieldAnchorStore {
	get(ruleId: string): Promise<SharedFieldAnchorRule | null>;
	listBySchema(targetSchema: string): Promise<SharedFieldAnchorRule[]>;
	listForContext(context: {
		workspaceId?: string;
		personnelId?: string;
	}): Promise<SharedFieldAnchorRule[]>;
	set(rule: SharedFieldAnchorRule): Promise<void>;
	delete(ruleId: string): Promise<void>;
}
