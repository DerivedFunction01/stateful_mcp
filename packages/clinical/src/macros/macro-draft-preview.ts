import type { MacroInput } from "./macro-binding";
import type { MacroCompiler, MacroCompilerOptions } from "./macro-compiler";
import type { MacroDefinition } from "./macro-definition";
import type { MacroExecutionPlan } from "./macro-plan";
import { type MacroPreview, renderMacroPreview } from "./macro-renderer";

export interface MacroDraftPreview {
	status: "valid" | "invalid";
	macroName: string;
	macroId: string;
	macroVersion: number;
	plan?: MacroExecutionPlan;
	rendered?: MacroPreview;
	diagnostics: string[];
}

/** Compiles a draft without executing it or changing editor state. */
export async function compileMacroDraftPreview(
	compiler: Pick<MacroCompiler, "compile">,
	input: MacroInput,
	definition: MacroDefinition,
	options: MacroCompilerOptions = {},
): Promise<MacroDraftPreview> {
	const result = await compiler.compile(input, definition, options);
	return {
		status:
			result.plan && result.diagnostics.length === 0 ? "valid" : "invalid",
		macroName: definition.macroName,
		macroId: definition.macroId,
		macroVersion: definition.version,
		plan: result.plan,
		rendered: result.plan ? renderMacroPreview(result.plan) : undefined,
		diagnostics: result.diagnostics,
	};
}
