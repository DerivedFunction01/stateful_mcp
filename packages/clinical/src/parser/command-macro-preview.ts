import type { ParserCommandMacro } from "../store/parser/command-macros/interfaces";
import { bindCommandMacro } from "./command-macro-binder";
import { renderCommandMacroTargets, type CommandMacroRenderValue } from "./command-macro-renderer";

export interface CommandMacroPreview {
	status: "draft" | "preview" | "pending_commit" | "committed" | "error";
	macroName?: string;
	plans: Array<NonNullable<ReturnType<typeof bindCommandMacro>["plan"]>>;
	diagnostics: string[];
	rendered?: Array<{ line: number; text: string; status: "resolved" | "partial" | "ambiguous" | "invalid" }>;
}

export function previewCommandMacroBatch(input: string, macros: Map<string, ParserCommandMacro>): CommandMacroPreview {
	const plans: CommandMacroPreview["plans"] = [];
	const diagnostics: string[] = [];
	const rendered: NonNullable<CommandMacroPreview["rendered"]> = [];
	for (const [lineIndex, line] of input.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		const macroName = line.trim().replace(/^\^/, "").split(/\s+/, 1)[0] ?? "";
		const macro = macros.get(macroName);
		if (!macro) { diagnostics.push(`line ${lineIndex + 1}: unknown command macro '${macroName}'`); continue; }
		const result = bindCommandMacro(line, macro, { groupId: `preview:${lineIndex}`, sourceLine: lineIndex + 1 });
		if (result.plan) plans.push(result.plan);
		for (const diagnostic of result.diagnostics) diagnostics.push(`line ${lineIndex + 1}: ${diagnostic.message}`);
		if (macro.renderers?.preview && result.plan) {
			const values: Record<string, CommandMacroRenderValue> = {};
			for (const operation of result.plan.operations) {
				const argument = macro.arguments[operation.sourceArgument];
				if (argument) values[argument.argumentId] = { value: operation.value, status: "assigned", evidence: operation.evidence };
			}
			const output = renderCommandMacroTargets(macro.renderers.preview, { values });
			rendered.push({ line: lineIndex + 1, ...output });
		}
	}
	return { status: diagnostics.length ? "error" : "preview", macroName: plans.length ? input.trim().replace(/^\^/, "").split(/\s+/, 1)[0] : undefined, plans, diagnostics, rendered };
}
