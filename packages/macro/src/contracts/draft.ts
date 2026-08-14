import type { ParseMacroLineResult } from "../parser/macro-parser";
import type { ExpressionBackend } from "./backends";
import type { MacroSpec } from "./macro";
import type { MacroParseResult } from "./payload";
import type {
	AcceptedMacroLock,
	CandidateResolution,
	MacroDraftDiagnostic,
	MacroSlotProjection,
	MacroTextEdit,
} from "./slots";
import type { MacroSyntax } from "./syntax";

export interface MacroDraftSnapshot {
	mode: "idle" | "macro";
	text: string;
	revision: number;
	cursorOffset: number;
	parse: ParseMacroLineResult | null;
	payloadPreview?: MacroParseResult;
	resolutions: CandidateResolution[];
	projections: MacroSlotProjection[];
	locks: AcceptedMacroLock[];
	diagnostics: MacroDraftDiagnostic[];
	activeArgumentId?: string;
}

export interface CreateMacroDraftSessionOptions {
	spec: MacroSpec;
	syntax: MacroSyntax;
	backends?: Readonly<Record<string, ExpressionBackend>>;
	initialText?: string;
	initialCursor?: number;
	locks?: readonly AcceptedMacroLock[];
}

export interface MacroDraftInputs {
	spec: MacroSpec;
	syntax: MacroSyntax;
	backends?: Readonly<Record<string, ExpressionBackend>>;
}

export interface MacroDraftSession {
	replaceInputs(inputs: MacroDraftInputs): MacroDraftSnapshot;
	setText(text: string, cursorOffset?: number): MacroDraftSnapshot;
	applyEdit(edit: MacroTextEdit): MacroDraftSnapshot;
	acceptCandidate(argumentId: string, occurrence?: number): MacroDraftSnapshot;
	unlockCandidate(argumentId: string, occurrence?: number): MacroDraftSnapshot;
	snapshot(): MacroDraftSnapshot;
	commit(): MacroParseResult;
}
