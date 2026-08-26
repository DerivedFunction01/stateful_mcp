import type { MacroAuthoringRender } from "../authoring/authoring-renderer";
import type { ExpressionCandidate } from "./backends";
import type {
	MacroArgumentInput,
	MacroDiagnostic,
	MacroInput,
	MacroSpan,
} from "./input";
import type { MacroSpec } from "./macro";
import type { MacroAuthoringTemplate } from "./matching";
import type { MacroLockLike, MacroSlotProjection, SlotBinding } from "./slots";

export interface MacroCandidateSnapshot {
	resolverId: string;
	argumentId: string;
	version: string | number;
	ownerExtensionId?: string;
	resourceId?: string;
	resolverVersion?: string | number;
	snapshotVersion?: string | number;
	candidates: readonly ExpressionCandidate[];
}

export interface MacroChildValidationContext {
	text: string;
	input: MacroArgumentInput;
	definition: MacroSpec;
	candidates: readonly MacroCandidateSnapshot[];
}

export const MACRO_CHILD_BINDING_STATUSES = [
	"accepted",
	"pending",
	"unresolved",
	"invalid",
] as const;
export type MacroChildBindingStatus =
	(typeof MACRO_CHILD_BINDING_STATUSES)[number];

export interface MacroChildBinding {
	status: MacroChildBindingStatus;
	binding?: SlotBinding;
	previewValues?: readonly MacroPreviewValue[];
	diagnostics?: readonly MacroDiagnostic[];
}

export const MACRO_PREVIEW_VALUE_STATUSES = [
	"bound",
	"unresolved",
	"invalid",
	"missing",
] as const;
export type MacroPreviewValueStatus =
	(typeof MACRO_PREVIEW_VALUE_STATUSES)[number];

export interface MacroPreviewValue {
	argumentId: string;
	previewKey?: string;
	value?: string;
	status?: MacroPreviewValueStatus;
}

export interface MacroExecutionBinding {
	argumentId: string;
	input: MacroArgumentInput;
	binding: MacroChildBinding;
}

export interface MacroExecutionPreview {
	status: "valid" | "invalid";
	macroId: string;
	macroVersion: number;
	rawText: string;
	contextFingerprint: string;
	bindings: readonly MacroExecutionBinding[];
	spans: readonly MacroSpan[];
	candidateSnapshots: readonly MacroCandidateSnapshot[];
	configuredValueFingerprint?: string;
	fingerprint: string;
	diagnostics: readonly MacroDiagnostic[];
}

export interface MacroChildHandler {
	type: string;
	validate(
		context: MacroChildValidationContext,
	): MacroChildBinding | Promise<MacroChildBinding>;
	preview?(
		binding: MacroChildBinding,
		context: MacroChildValidationContext,
	): readonly MacroPreviewValue[];
	execute?(
		binding: MacroChildBinding,
		context: MacroChildValidationContext,
	): unknown | Promise<unknown>;
}

export interface MacroDefinitionAdapter {
	definition: MacroSpec;
	previewTemplate: MacroAuthoringTemplate;
	children: Readonly<Record<string, MacroChildHandler>>;
	compile?(
		bindings: readonly MacroChildBinding[],
		input: MacroInput,
		childResults?: readonly unknown[],
	): unknown | Promise<unknown>;
}

export interface MacroAdapterDraft {
	input: MacroInput | null;
	bindings: Readonly<Record<string, MacroChildBinding>>;
	locks: readonly MacroLockLike[];
	projections: readonly MacroSlotProjection[];
	executionPreview?: MacroExecutionPreview;
	preview: MacroAuthoringRender;
	diagnostics: readonly MacroDiagnostic[];
}
