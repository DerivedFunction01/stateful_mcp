import type { ParserCommandMacro } from "../../store/parser/command-macros/interfaces";
import { bindCommandMacro } from "./command-macro-binder";
import { renderCommandMacroTargets, type CommandMacroRenderValue } from "./command-macro-renderer";
import type { ParserCommandMacroStore } from "../../store/parser/command-macros/interfaces";

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

export interface CommandMacroPreviewController {
	request(input: string, context?: { personnelId?: string; profileId?: string }): Promise<CommandMacroPreview | null>;
	cancel(): void;
}

export function createCommandMacroPreviewController(
	store: ParserCommandMacroStore,
	delayMs = 150,
): CommandMacroPreviewController {
	let generation = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: ((preview: CommandMacroPreview | null) => void) | undefined;
	return {
		request(input, context) {
			generation += 1;
			const requestGeneration = generation;
			if (timer) clearTimeout(timer);
			pending?.(null);
			return new Promise((resolve) => {
				pending = resolve;
				timer = setTimeout(async () => {
					try {
						const definitions = await store.list(context);
						if (requestGeneration !== generation) return resolve(null);
						resolve(previewCommandMacroBatch(input, new Map(definitions.map((macro) => [macro.macroName, macro]))));
					} catch { resolve(null); }
					finally { if (requestGeneration === generation) pending = undefined; }
				}, delayMs);
			});
		},
		cancel() {
			generation += 1;
			if (timer) clearTimeout(timer);
			timer = undefined;
			pending?.(null);
			pending = undefined;
		},
	};
}
