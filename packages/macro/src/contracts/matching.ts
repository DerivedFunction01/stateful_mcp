import type { MacroArgumentSource, MacroCaptureSpan, MacroSpan } from "./input";

export interface MacroArgumentMatch {
	argumentId: string;
	occurrence?: number;
	formId?: string;
	source: MacroArgumentSource;
	anchor?: MacroSpan;
	extraction: MacroSpan;
	friendlyText?: string;
	rawValue: string;
	captures?: Record<string, string | undefined>;
	captureSpans?: MacroCaptureSpan[];
	canonicalValue?: unknown;
	sourceId?: string;
	conceptId?: string;
	priority?: number;
	matchKind?: "exact" | "prefix" | "pattern" | "literal";
}

export interface NamedGroupContract {
	required?: readonly string[];
	allowed?: readonly string[];
	disallowed?: readonly string[];
	fullSpan?: boolean;
}

export interface MacroArgumentForm {
	formId: string;
	kind: "friendly";
	argumentId: string;
	template: MacroAuthoringTemplate;
	precedence?: number;
	compatibility?: readonly string[];
}

export type MacroAuthoringTemplatePart =
	| { kind: "literal"; text: string }
	| {
			kind: "slot";
			argumentId: string;
			occurrence: number;
			displayText?: string;
		};

export interface MacroAuthoringSlot {
	argumentId: string;
	occurrence: number;
	displayText?: string;
}

export interface MacroAuthoringTemplate {
	version: 1;
	parts: readonly MacroAuthoringTemplatePart[];
	templateId?: string;
	templateText?: string;
	slots?: Record<string, MacroAuthoringSlot>;
}

export function spansOverlap(left: MacroSpan, right: MacroSpan): boolean {
	return left.start < right.end && right.start < left.end;
}
