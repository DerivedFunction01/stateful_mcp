import type { MacroArgumentMatch } from "./matching";

export interface SlotBinding {
	backendId?: string;
	candidateId?: string;
	displayValue?: string;
	canonicalValue?: unknown;
	metadata?: Record<string, unknown>;
}

export interface MacroSlotProjection {
	macroId: string;
	macroVersion: number;
	argumentId: string;
	start: number;
	end: number;
	rawText: string;
	displayText: string;
	status: "unbound" | "bound" | "invalid" | "pending" | "locked";
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

export type CandidateDisposition =
	| "none"
	| "selected"
	| "unstable"
	| "ambiguous"
	| "invalid";

export interface CandidateResolution {
	argumentId: string;
	occurrence: number;
	match?: MacroArgumentMatch;
	disposition: CandidateDisposition;
	reason?:
		| "longer-continuation"
		| "overlap"
		| "missing-backend"
		| "invalid-pattern"
		| "normalization-failed";
	livePending?: boolean;
}

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
	source: "explicit" | "accepted";
	acceptedAtRevision: number;
	backendVersion?: string;
}

export interface MacroTextEdit {
	start: number;
	end: number;
	text: string;
}

export interface MacroDraftDiagnostic extends MacroDiagnosticLike {
	code:
		| MacroDiagnosticLike["code"]
		| "STALE_LOCK"
		| "UNSTABLE_CANDIDATE"
		| "AMBIGUOUS_CANDIDATE"
		| "INVALID_ACCEPTANCE";
}

interface MacroDiagnosticLike {
	code: string;
	message: string;
	start?: number;
	end?: number;
	argumentId?: string;
	formId?: string;
}
