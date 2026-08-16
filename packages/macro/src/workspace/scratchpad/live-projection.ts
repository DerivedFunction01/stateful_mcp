import type { MacroAuthoringRender } from "../../authoring/authoring-renderer";
import type { MacroExecutionPreview } from "../../contracts/composition";
import type { MacroDiagnostic } from "../../contracts/input";
import type { MacroSlotProjection } from "../../contracts/slots";
import {
	extractTokenChipsFromProjections,
	type InteractiveTokenChip,
} from "../editor/chips";

export interface ProjectedMacroLine {
	readonly lineNumber: number;
	readonly rawText: string;
	readonly macroName?: string;
	readonly adapterId?: string;
	readonly isValid: boolean;
	readonly projections: readonly MacroSlotProjection[];
	readonly chips: readonly InteractiveTokenChip[];
	readonly preview?: MacroAuthoringRender;
	readonly executionPreview?: MacroExecutionPreview;
	readonly diagnostics: readonly MacroDiagnostic[];
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
): ProjectedMacroLine {
	const chips = extractTokenChipsFromProjections(projections);
	const hasErrors =
		diagnostics.length > 0 || projections.some((p) => p.status === "invalid");

	return {
		lineNumber,
		rawText,
		macroName,
		adapterId,
		isValid: Boolean(macroName) && !hasErrors,
		projections,
		chips,
		preview,
		executionPreview,
		diagnostics,
	};
}
