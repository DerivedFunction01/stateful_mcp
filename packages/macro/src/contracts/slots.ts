import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { RecipeDiagnostic, RecipeEvaluation } from "../values/recipes";
import type { MacroDiagnosticCode } from "./input";
import type { MacroArgumentMatch, MacroPendingReason } from "./matching";

export interface SlotBinding {
	candidateId?: string;
	displayValue?: string;
	canonicalValue?: unknown;
	recipeId?: string;
	variantPath?: readonly string[];
	recipeDiagnostics?: readonly RecipeDiagnostic[];
	recipeEvaluation?: RecipeEvaluation;
	metadata?: Record<string, unknown>;
}

export const MACRO_SLOT_STATUSES = [
	"unbound",
	"bound",
	"invalid",
	"pending",
	"locked",
] as const;
export type MacroSlotStatus = (typeof MACRO_SLOT_STATUSES)[number];

export interface MacroSlotProjection {
	macroId: string;
	macroVersion: number;
	argumentId: string;
	start: number;
	end: number;
	rawText: string;
	displayText: string;
	status: MacroSlotStatus;
	binding?: SlotBinding;
	diagnostics: string[];
	match?: MacroArgumentMatch;
	occurrence?: number;
	formId?: string;
	bindingSource?: MacroArgumentMatch["source"];
	anchorStart?: number;
	anchorEnd?: number;
	friendlyText?: string;
}

export interface MacroLockLike {
	argumentId: string;
	macroId: string;
	macroVersion: number;
	start: number;
	end: number;
	rawText?: string;
	binding?: SlotBinding;
}

export const CANDIDATE_DISPOSITIONS = [
	"none",
	"selected",
	"unstable",
	"ambiguous",
	"invalid",
] as const;
export type CandidateDisposition = (typeof CANDIDATE_DISPOSITIONS)[number];

export const CANDIDATE_PENDING_REASONS = [
	"longer-continuation",
	"unmatched-trailing-text",
	"unresolved-overlap",
	"overlap",
	"missing-backend",
	"invalid-pattern",
	"normalization-failed",
] as const;
export type CandidatePendingReason = (typeof CANDIDATE_PENDING_REASONS)[number];

export interface CandidateResolution {
	argumentId: string;
	occurrence: number;
	match?: MacroArgumentMatch;
	disposition: CandidateDisposition;
	reason?: MacroPendingReason | CandidatePendingReason;
	livePending?: boolean;
}

export const MACRO_LOCK_SOURCES = ["explicit", "accepted"] as const;
export type MacroLockSource = (typeof MACRO_LOCK_SOURCES)[number];

export interface AcceptedMacroLock {
	lockId: string;
	macroId: string;
	macroVersion: number;
	argumentId: string;
	occurrence: number;
	start: number;
	end: number;
	rawText: string;
	candidateId?: string;
	binding?: SlotBinding;
	source: MacroLockSource;
	acceptedAtRevision: number;
}

export interface MacroTextEdit {
	start: number;
	end: number;
	text: string;
}

export const MACRO_DRAFT_EXTRA_DIAGNOSTIC_CODES = [
	"STALE_LOCK",
	"UNSTABLE_CANDIDATE",
	"AMBIGUOUS_CANDIDATE",
	"INVALID_ACCEPTANCE",
	"PARSE_LISTENER_DIAGNOSTIC",
	"LISTENER_FAILED",
	"RENDERER_FAILED",
] as const;
export type MacroDraftExtraDiagnosticCode =
	(typeof MACRO_DRAFT_EXTRA_DIAGNOSTIC_CODES)[number];

export type MacroDraftDiagnosticCode =
	| MacroDiagnosticCode
	| MacroDraftExtraDiagnosticCode
	| (string & {});

export interface MacroDraftDiagnostic {
	code: MacroDraftDiagnosticCode;
	/** Structured i18n key; the canonical message carrier for user-facing surfaces. */
	messageKey?: string;
	messageParams?: Readonly<Record<string, MessageParam>>;
	start?: number;
	end?: number;
	argumentId?: string;
	formId?: string;
}
