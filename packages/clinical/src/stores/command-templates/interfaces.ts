import type { PipelineStep } from "@stateful-mcp/core";

export type CommandTemplateStage = "preview" | "confirmation" | "audit";

export interface CommandTemplateCondition {
	pipeline: PipelineStep[];
}

export interface CommandTemplateSlot {
	sourcePath: string;
	format?: string;
	fallback?: string;
	conditions?: CommandTemplateCondition;
	conditionalDelegates?: {
		delegateTemplateId: string;
		conditions: CommandTemplateCondition;
	}[];
	defaultDelegateTemplateId?: string;
	listOptions?: {
		delimiter: string;
		lastDelimiter?: string;
	};
	transform?: { pipeline: PipelineStep[] };
	child?: {
		childMacroName: string;
		mode: "inline" | "group" | "separate";
	};
}

export interface CommandTemplate {
	templateId: string;
	templateName?: string;
	stage: CommandTemplateStage;
	templateText: string;
	slots: Record<string, CommandTemplateSlot>;
	parentTemplateId?: string;
	macroId?: string;
	workspaceId?: string;
	specialtyId?: string;
	active?: boolean;
}

export interface CommandTemplateStore {
	getById(templateId: string): Promise<CommandTemplate | null>;
	list(context?: {
		macroId?: string;
		workspaceId?: string;
		specialtyId?: string;
		stage?: CommandTemplateStage;
	}): Promise<CommandTemplate[]>;
	set(template: CommandTemplate): Promise<void>;
	delete(templateId: string): Promise<void>;
}
