import type { PipelineStep } from "@stateful-mcp/core";

export type V2TemplatePosition =
	| "opening"
	| "continuing"
	| "closing"
	| "full_paragraph";
export interface V2SlotCondition {
	pipeline: PipelineStep[];
}
export interface V2OutputProseSlot {
	sourcePath: string;
	format?: string;
	fallback?: string;
	conditionalDelegates?: {
		delegateTemplateId: string;
		conditions: V2SlotCondition;
	}[];
	defaultDelegateTemplateId?: string;
	listOptions?: { delimiter: string; lastDelimiter?: string };
	conditions?: V2SlotCondition;
	transform?: { pipeline: PipelineStep[] };
}
export interface V2ClinicalProseTemplate {
	templateId: string;
	parentTemplateId?: string;
	targetSchema: string;
	targetConceptId?: string;
	workspaceId?: string;
	specialtyId?: string;
	section?: "subjective" | "objective" | "assessment" | "plan";
	slotPosition: V2TemplatePosition;
	templateText: string;
	slots: Record<string, V2OutputProseSlot>;
}
