import type { Relation } from "@stateful-mcp/clinical/store/reference/auto-complete/interfaces";
import type { PipelineStep } from "@stateful-mcp/core";

export interface SharedFieldAnchorDistance {
	maxLeft?: number;
	maxRight?: number;
	unit?: "items" | "words" | "chars";
	skipStopWords?: boolean;
	crossBoundaries?: boolean;
	boundaryDelimiterOverride?: string;
	boundaryTransitionalWords?: string[];
}

export interface TemporalContainment {
	/** Source field path in the anchor source's extractedData containing a ClinicalDateRange */
	sourceRangePath: string;
	/** Target field path in the anchor target's extractedData containing the event datetime */
	targetDateTimePath: string;
	/**
	 * Policy when the target event has no resolved datetime:
	 * - "require": skip association (event must have a date)
	 * - "inherit": associate even without a precise date (default)
	 */
	missingDatePolicy?: "require" | "inherit";
}

export interface SharedFieldAnchorCondition {
	pipeline: PipelineStep[];
}

export interface SharedFieldAnchor {
	source: string;
	targetField: string;
	relation: Relation;
	distance?: SharedFieldAnchorDistance;
	anchorPattern?: string;
	anchorPatternCaseInsensitive?: boolean;
	condition?: SharedFieldAnchorCondition;
	temporalContainment?: TemporalContainment;
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
