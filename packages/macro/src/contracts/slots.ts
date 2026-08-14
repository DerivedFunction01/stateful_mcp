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
