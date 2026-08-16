import type { MacroArgumentSource, MacroCaptureSpan, MacroSpan } from "./input";

export const MACRO_MATCH_KINDS = [
	"exact",
	"prefix",
	"pattern",
	"literal",
] as const;
export type MacroMatchKind = (typeof MACRO_MATCH_KINDS)[number];

export const MACRO_MATCH_STABILITIES = [
	"stable",
	"unstable",
	"ambiguous",
	"invalid",
] as const;
export type MacroMatchStability = (typeof MACRO_MATCH_STABILITIES)[number];

export const MACRO_PENDING_REASONS = [
	"longer-continuation",
	"unmatched-trailing-text",
	"unresolved-overlap",
	"overlap",
	"missing-backend",
	"invalid-pattern",
	"normalization-failed",
] as const;
export type MacroPendingReason = (typeof MACRO_PENDING_REASONS)[number];

export interface MacroArgumentMatch {
	argumentId: string;
	occurrence?: number;
	formId?: string;
	source: MacroArgumentSource;
	anchor?: MacroSpan;
	extraction: MacroSpan;
	sourceSpan?: MacroSpan;
	valueSpan?: MacroSpan;
	friendlyText?: string;
	rawValue: string;
	captures?: Record<string, string | undefined>;
	captureSpans?: MacroCaptureSpan[];
	canonicalValue?: unknown;
	backendId?: string;
	resolverId?: string;
	resolverVersion?: string;
	sourceId?: string;
	conceptId?: string;
	priority?: number;
	matchKind?: MacroMatchKind;
	stability?: MacroMatchStability;
	pendingReason?: MacroPendingReason;
	metadata?: Record<string, unknown>;
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
			previewKey?: string;
			displayText?: string;
	  };

export interface MacroAuthoringSlot {
	argumentId: string;
	occurrence: number;
	previewKey?: string;
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
