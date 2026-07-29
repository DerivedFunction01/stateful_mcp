import type { PipelineStep } from "@stateful-mcp/core";
import type { Relation } from "../auto-complete/interfaces";

export type ProseSlotType =
	| "attribute"
	| "concept"
	| "repeating_block"
	| "sub_section";

export interface ProseSlot {
	slotName: string;
	slotType: ProseSlotType;
	anchorPattern: string; // Regex with named group (?<list>...), (?<value>...), or (?<slotName>...)
	targetSchema?: string;
	fieldPath?: string;
	ruleRef?: string;
	listDelimiter?: string;
	itemOverrides?: Record<string, any>;
	repeatPattern?: string;
	subTemplate?: {
		textGroup: string;
		slots: ProseSlot[];
	};
	delegateTemplateId?: string;
	linkTo?: {
		parentSlot: string;
		relation: Relation;
	};
	maxItems?: number;

	triggerPattern?: string; // literal/regex prefix the user types to fire this slot for autocomplete
	suggestText?: string; // text inserted when the trigger fires; cursor lands right after it

	// Phase 1: field is present but always evaluates to true.
	// Phase 1.5+: evaluated against filled slots to gate chaining.
	conditions?: { pipeline: PipelineStep[] };
}

export interface ProseTemplate {
	templateId: string;
	parentTemplateId?: string;
	targetSchema: string;
	sectionPattern: string;
	priority?: number;
	maxItems?: number;
	slots: ProseSlot[];
	remnantContext?: {
		targetSchema?: string;
		itemOverrides?: Record<string, any>;
		parentSlotLink?: string;
	};
	suggestText?: string; // full-template rendered snippet for when the whole template is suggested
}
