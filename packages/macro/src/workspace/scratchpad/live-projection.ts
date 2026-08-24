import type { MacroAuthoringRender } from "../../authoring/authoring-renderer";
import type { MacroExecutionPreview } from "../../contracts/composition";
import type { MacroDiagnostic } from "../../contracts/input";
import type { MacroSlotProjection } from "../../contracts/slots";
import {
	extractTokenChipsFromProjections,
	type InteractiveTokenChip,
} from "../editor/chips";

export interface ExtensionProjection {
	readonly id: string;
	readonly ownerExtensionId: string;
	readonly kind: string;
	readonly data: unknown;
}

export interface ProjectedMacroLine {
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroName?: string;
	readonly adapterId?: string;
	/**
	 * Hidden default macro id for this cell, if any.
	 */
	readonly defaultMacroId?: string;
	/**
	 * Effective macro resolved for this cell (explicit wins, then default).
	 */
	readonly effectiveMacroName?: string;
	/**
	 * How the effective macro was resolved.
	 */
	readonly macroResolution?: "explicit" | "default" | "none";
	/**
	 * Display-only placeholder for empty cells that have a default. Never
	 * persisted or parsed as user text.
	 */
	readonly placeholder?: string;
	readonly isValid: boolean;
	readonly projections: readonly MacroSlotProjection[];
	readonly chips: readonly InteractiveTokenChip[];
	readonly preview?: MacroAuthoringRender;
	readonly executionPreview?: MacroExecutionPreview;
	readonly diagnostics: readonly MacroDiagnostic[];
	readonly extensionProjections?: readonly ExtensionProjection[];
}

export function createEmptyProjectedLine(
	lineNumber: number,
	rawText = "",
): ProjectedMacroLine {
	return {
		lineNumber,
		rawText,
		isValid: false,
		projections: [],
		chips: [],
		diagnostics: [],
	};
}

export function synthesizeProjectedLine(
	lineNumber: number,
	rawText: string,
	macroName: string | undefined,
	adapterId: string | undefined,
	projections: readonly MacroSlotProjection[],
	preview?: MacroAuthoringRender,
	executionPreview?: MacroExecutionPreview,
	diagnostics: readonly MacroDiagnostic[] = [],
	extensionProjections: readonly ExtensionProjection[] = [],
	defaultMacroId?: string,
	effectiveMacroName?: string,
	macroResolution?: "explicit" | "default" | "none",
	placeholder?: string,
): ProjectedMacroLine {
	const chips = extractTokenChipsFromProjections(projections);
	const hasErrors =
		diagnostics.length > 0 || projections.some((p) => p.status === "invalid");

	return {
		lineNumber,
		rawText,
		macroName,
		adapterId,
		defaultMacroId,
		effectiveMacroName,
		macroResolution,
		placeholder,
		isValid: Boolean(macroName) && !hasErrors,
		projections,
		chips,
		preview,
		executionPreview,
		diagnostics,
		extensionProjections,
	};
}
