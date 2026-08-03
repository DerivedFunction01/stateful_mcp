import type { PipelineStep } from "@stateful-mcp/core";

export type TemplatePosition =
	| "opening"
	| "continuing"
	| "closing"
	| "full_paragraph";
export interface SlotCondition {
	pipeline: PipelineStep[];
}
export interface OutputProseSlot {
	sourcePath: string;
	format?: string;
	fallback?: string;
	conditionalDelegates?: {
		delegateTemplateId: string;
		conditions: SlotCondition;
	}[];
	defaultDelegateTemplateId?: string;
	listOptions?: { delimiter: string; lastDelimiter?: string };
	conditions?: SlotCondition;
	transform?: { pipeline: PipelineStep[] };
}
export interface ClinicalProseTemplate {
	templateId: string;
	parentTemplateId?: string;
	targetSchema: string;
	targetConceptId?: string;
	workspaceId?: string;
	specialtyId?: string;
	section?: "subjective" | "objective" | "assessment" | "plan";
	slotPosition: TemplatePosition;
	templateText: string;
	slots: Record<string, OutputProseSlot>;
}
