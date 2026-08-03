import type { ParserCommandMacro, ParserCommandMacroStore } from "../../store/parser/command-macros/interfaces";
import { bindCommandMacro } from "./command-macro-binder";
import type { CommandMacroCellPlan, CommandMacroGraphPlan, CommandMacroLinkOperation } from "./command-macro-ir";

export interface CommandMacroGraphDiagnostic { line?: number; macroName?: string; message: string }

function findParentForChild(
	macros: Array<{ macro: ParserCommandMacro; plan: CommandMacroCellPlan; line: number }>,
	child: ParserCommandMacro,
): { macro: ParserCommandMacro; plan: CommandMacroCellPlan; definition: NonNullable<ParserCommandMacro["children"]>[number] } | undefined {
	for (const candidate of macros) {
		const definition = candidate.macro.children?.find((item) => item.childMacroName === child.macroName);
		if (definition) return { macro: candidate.macro, plan: candidate.plan, definition };
	}
	return undefined;
}

export function validateMacroCompositionGraph(
	root: ParserCommandMacro,
	definitions: ReadonlyMap<string, ParserCommandMacro>,
	maxDepth = root.execution?.maxCompositionDepth ?? 8,
): string[] {
	const diagnostics: string[] = [];
	const visit = (macro: ParserCommandMacro, path: string[], depth: number): void => {
		if (depth > maxDepth) { diagnostics.push(`${path.join(" -> ")}: composition depth exceeds ${maxDepth}`); return; }
		if (path.includes(macro.macroName)) { diagnostics.push(`${[...path, macro.macroName].join(" -> ")}: cyclic child macro composition`); return; }
		for (const child of macro.children ?? []) {
			const childMacro = definitions.get(child.childMacroName);
			if (!childMacro) { diagnostics.push(`${macro.macroName}: child macro '${child.childMacroName}' is not available`); continue; }
			if (!macro.arguments.some((argument) => argument.roleName === child.parentRoleName)) diagnostics.push(`${macro.macroName}: parent role '${child.parentRoleName}' is not declared by an argument`);
			if (!child.parentTargetPath.trim()) diagnostics.push(`${macro.macroName}: child '${child.childMacroName}' has an empty parent target path`);
			visit(childMacro, [...path, macro.macroName], depth + 1);
		}
	};
	visit(root, [], 0);
	return diagnostics;
}

export async function planCommandMacroBatch(
	input: string,
	store: ParserCommandMacroStore,
	options: { groupId?: string; cellRefPrefix?: string; maxCompositionDepth?: number } = {},
): Promise<{ graph?: CommandMacroGraphPlan; diagnostics: CommandMacroGraphDiagnostic[] }> {
	const diagnostics: CommandMacroGraphDiagnostic[] = [];
	const groupId = options.groupId ?? `macro-batch:${Date.now()}`;
	const resolved: Array<{ macro: ParserCommandMacro; plan: CommandMacroCellPlan; line: number }> = [];
	for (const [lineIndex, line] of input.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		const macroName = line.trim().replace(/^\^/, "").split(/\s+/, 1)[0] ?? "";
		const macro = await store.get(macroName);
		if (!macro) { diagnostics.push({ line: lineIndex + 1, macroName, message: `unknown command macro '${macroName}'` }); continue; }
		const result = bindCommandMacro(line, macro, { groupId, cellRef: `${options.cellRefPrefix ?? groupId}:line:${lineIndex + 1}`, sourceLine: lineIndex + 1 });
		for (const diagnostic of result.diagnostics) diagnostics.push({ line: lineIndex + 1, macroName, message: diagnostic.message });
		if (result.plan) resolved.push({ macro, plan: result.plan, line: lineIndex + 1 });
	}
	if (diagnostics.length) return { diagnostics };
	const definitions = new Map(resolved.map((entry) => [entry.macro.macroName, entry.macro]));
	for (const entry of resolved) {
		for (const diagnostic of validateMacroCompositionGraph(entry.macro, definitions, options.maxCompositionDepth)) diagnostics.push({ line: entry.line, macroName: entry.macro.macroName, message: diagnostic });
	}
	if (diagnostics.length) return { diagnostics };
	const links: CommandMacroLinkOperation[] = [];
	for (const child of resolved) {
		const parent = findParentForChild(resolved, child.macro);
		if (!parent) continue;
		links.push({ linkId: `${groupId}:link:${parent.plan.cellRef}:${child.plan.cellRef}`, parentRef: parent.plan.cellRef, childRef: child.plan.cellRef, parentRoleName: parent.definition.parentRoleName, parentTargetPath: parent.definition.parentTargetPath, mergeStrategy: parent.definition.mergeStrategy, sourceLine: child.line });
		child.plan.parentRef = parent.plan.cellRef;
		child.plan.linkTarget = { targetField: parent.definition.parentTargetPath, mergeStrategy: parent.definition.mergeStrategy };
	}
	return {
		diagnostics: [],
		graph: {
			groupId,
			plans: resolved.map((entry) => entry.plan),
			links,
			definitionIds: [...new Set(resolved.map((entry) => entry.macro.macroId))],
			definitionVersions: Object.fromEntries(resolved.map((entry) => [entry.macro.macroId, entry.macro.version])),
			diagnostics: [],
		},
	};
}
