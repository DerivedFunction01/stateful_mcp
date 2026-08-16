import { renderMacroAuthoringTemplate } from "../authoring/authoring-renderer";
import type {
	MacroAdapterDraft,
	MacroCandidateSnapshot,
	MacroChildBinding,
	MacroChildValidationContext,
	MacroDefinitionAdapter,
} from "../contracts/composition";
import type { MacroParseOptions } from "../contracts/macro";
import type { MacroLockLike } from "../contracts/slots";
import { parseMacroLine } from "../parser/macro-parser";
import {
	applyMacroLocks,
	lockMacroSlot,
	projectMacroSlots,
} from "../slots/macro-slots";

export interface MacroRuntimeOptions extends MacroParseOptions {
	candidates?: readonly MacroCandidateSnapshot[];
	locks?: readonly MacroLockLike[];
	revision?: number;
}

export async function parseMacroWithAdapter(
	adapter: MacroDefinitionAdapter,
	text: string,
	options: MacroRuntimeOptions = {},
): Promise<MacroAdapterDraft> {
	const candidates = options.candidates ?? options.candidateSnapshots ?? [];
	const input = parseMacroLine(text, adapter.definition, {
		...options,
		candidateSnapshots: candidates,
	});
	if (!input) {
		return {
			input: null,
			bindings: {},
			locks: options.locks ?? [],
			projections: [],
			preview: { text: "", missing: [], invalid: [] },
			diagnostics: [],
		};
	}

	const bindings: Record<string, MacroChildBinding> = {};
	const previewValues = [];
	const diagnostics = [...input.diagnostics];
	const projections = applyMacroLocks(
		projectMacroSlots(text, adapter.definition, {
			...options,
			candidateSnapshots: candidates,
		}),
		options.locks ?? [],
		undefined,
		text,
	);
	const locks = [...(options.locks ?? [])].filter(
		(lock) =>
			lock.rawText === undefined ||
			text.slice(lock.start, lock.end) === lock.rawText,
	);

	for (const argument of input.arguments) {
		if (!argument.match) continue;
		const argumentId =
			argument.match?.argumentId ?? resolveArgumentId(adapter, argument);
		if (!argumentId) continue;
		const child = adapter.children[argumentId];
		if (!child) continue;

		const context: MacroChildValidationContext = {
			text,
			input: argument,
			definition: adapter.definition,
			candidates: candidates.filter(
				(candidate) => candidate.argumentId === argumentId,
			),
		};
		const binding = await child.validate(context);
		bindings[argumentId] = binding;
		if (binding.status === "accepted") {
			const projection = projections.find(
				(slot) => slot.argumentId === argumentId && slot.status !== "pending",
			);
			if (
				projection &&
				!locks.some(
					(lock) =>
						lock.argumentId === argumentId &&
						lock.start === projection.start &&
						lock.end === projection.end,
				)
			) {
				locks.push({
					...lockMacroSlot(projection, options.revision ?? 0, "accepted"),
					binding: binding.binding,
				});
			}
		}
		if (binding.diagnostics) diagnostics.push(...binding.diagnostics);
		if (binding.previewValues) previewValues.push(...binding.previewValues);
		if (child.preview) previewValues.push(...child.preview(binding, context));
	}

	const preview = renderMacroAuthoringTemplate(
		adapter.previewTemplate,
		previewValues,
	);
	return {
		input,
		bindings,
		locks,
		projections: applyMacroLocks(projections, locks, undefined, text),
		preview,
		diagnostics,
	};
}

export async function executeMacroWithAdapter(
	adapter: MacroDefinitionAdapter,
	draft: MacroAdapterDraft,
): Promise<unknown> {
	if (!draft.input || !adapter.compile) return undefined;
	if (
		Object.values(draft.bindings).some(
			(binding) => binding.status !== "accepted",
		)
	) {
		throw new Error("Macro draft contains non-executable bindings");
	}
	const childResults: unknown[] = [];
	for (const [argumentId, binding] of Object.entries(draft.bindings)) {
		const child = adapter.children[argumentId];
		if (!child?.execute) continue;
		const input = draft.input.arguments.find(
			(argument) => argument.match?.argumentId === argumentId,
		);
		if (!input) continue;
		childResults.push(
			await child.execute(binding, {
				text: draft.input.body?.raw ?? "",
				input,
				definition: adapter.definition,
				candidates: [],
			}),
		);
	}
	return adapter.compile(
		Object.values(draft.bindings),
		draft.input,
		childResults,
	);
}

function resolveArgumentId(
	adapter: MacroDefinitionAdapter,
	argument: MacroChildValidationContext["input"],
): string | undefined {
	if (argument.name) {
		const name = argument.name;
		const byName = adapter.definition.arguments.find(
			(spec) => spec.name === name || spec.aliases?.includes(name),
		);
		if (byName) return byName.argumentId;
	}
	if (argument.position === undefined) return undefined;
	return adapter.definition.arguments.find(
		(spec) => spec.position === argument.position,
	)?.argumentId;
}
