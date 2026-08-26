import { renderMacroAuthoringTemplate } from "../authoring/authoring-renderer";
import type { ExpressionBackend } from "../contracts/backends";
import type {
	MacroAdapterDraft,
	MacroCandidateSnapshot,
	MacroChildBinding,
	MacroChildValidationContext,
	MacroDefinitionAdapter,
	MacroExecutionBinding,
	MacroExecutionPreview,
} from "../contracts/composition";
import type { MacroRuntimeContext } from "../contracts/context";
import type { MacroDiagnostic, MacroInput } from "../contracts/input";
import type { MacroParseOptions } from "../contracts/macro";
import type { MacroLockLike } from "../contracts/slots";
import { parseMacroLine } from "../parser/macro-parser";
import { applyMacroLocks, projectMacroSlots } from "../slots/macro-slots";

export interface MacroRuntimeOptions extends MacroParseOptions {
	candidates?: readonly MacroCandidateSnapshot[];
	locks?: readonly MacroLockLike[];
	revision?: number;
}

export interface MacroAdapterExecutionOptions {
	text?: string;
	context?: MacroRuntimeContext;
	candidates?: readonly MacroCandidateSnapshot[];
	backends?: Readonly<Record<string, ExpressionBackend>>;
	configuredValues?: import("../values/engine").ConfiguredValueRuntime;
}

export async function parseMacroWithAdapter(
	adapter: MacroDefinitionAdapter,
	text: string,
	options: MacroRuntimeOptions,
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
			executionPreview: undefined,
			preview: { text: "", missing: [], invalid: [] },
			diagnostics: [],
		};
	}

	const bindings: Record<string, MacroChildBinding> = {};
	const previewValues = [];
	const diagnostics = [...input.diagnostics];
	const locks = [...(options.locks ?? [])].filter(
		(lock) =>
			lock.rawText === undefined ||
			text.slice(lock.start, lock.end) === lock.rawText,
	);
	const projections = applyMacroLocks(
		projectMacroSlots(text, adapter.definition, {
			...options,
			candidateSnapshots: candidates,
		}),
		locks,
		undefined,
		text,
	);
	const executionBindings: MacroExecutionBinding[] = [];

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
		executionBindings.push({ argumentId, input: argument, binding });
		if (binding.diagnostics) diagnostics.push(...binding.diagnostics);
		if (binding.previewValues) previewValues.push(...binding.previewValues);
		if (child.preview) previewValues.push(...child.preview(binding, context));
	}

	const preview = renderMacroAuthoringTemplate(
		adapter.previewTemplate,
		previewValues,
	);
	const executionPreview = createExecutionPreview(
		adapter,
		text,
		options,
		executionBindings,
		input,
		diagnostics,
	);
	return {
		input,
		bindings,
		locks,
		projections,
		executionPreview,
		preview,
		diagnostics,
	};
}

export async function executeMacroWithAdapter(
	adapter: MacroDefinitionAdapter,
	draft: MacroAdapterDraft,
	options: MacroAdapterExecutionOptions = {},
): Promise<unknown> {
	if (!draft.input || !adapter.compile) return undefined;
	const executionPreview = draft.executionPreview;
	if (!executionPreview)
		throw new Error("Macro draft has no execution preview");
	if (executionPreview.status !== "valid")
		throw new Error("Macro draft contains non-executable bindings");
	if (executionPreview.macroId !== adapter.definition.id)
		throw new Error("Macro execution preview belongs to a different macro");
	if (executionPreview.macroVersion !== (adapter.definition.version ?? 1))
		throw new Error("Macro execution preview is stale");
	if (executionPreview.rawText !== draft.input.sourceLines[0]?.raw)
		throw new Error("Macro execution preview text is stale");
	if (options.text !== undefined && options.text !== executionPreview.rawText)
		throw new Error("Macro execution preview text is stale");
	if (
		options.context &&
		stableFingerprint(options.context.syntax) !==
			executionPreview.contextFingerprint
	)
		throw new Error("Macro execution preview context is stale");
	if (
		options.candidates &&
		stableFingerprint(options.candidates) !==
			stableFingerprint(executionPreview.candidateSnapshots)
	)
		throw new Error("Macro execution preview candidates are stale");
	if (
		executionPreview.configuredValueFingerprint !== undefined &&
		executionPreview.configuredValueFingerprint !==
			options.configuredValues?.fingerprint
	)
		throw new Error("Macro execution preview configured values are stale");
	if (options.backends) {
		for (const snapshot of executionPreview.candidateSnapshots) {
			const backend = options.backends[snapshot.resolverId];
			if (!backend) {
				throw new Error(
					`Macro execution preview resolver '${snapshot.resolverId}' is unavailable`,
				);
			}
			const backendVersion = backend.backendVersion ?? backend.version;
			if (
				backendVersion !== undefined &&
				String(backendVersion) !== String(snapshot.version)
			) {
				throw new Error(
					`Macro execution preview resolver '${snapshot.resolverId}' is stale (snapshot: '${snapshot.version}', current: '${backendVersion}')`,
				);
			}
		}
		for (const item of executionPreview.bindings) {
			const match = item.input.match;
			if (match?.resolverId) {
				const backend = options.backends[match.resolverId];
				if (!backend) {
					throw new Error(
						`Macro execution preview resolver '${match.resolverId}' is unavailable`,
					);
				}
				const backendVersion = backend.backendVersion ?? backend.version;
				if (
					match.resolverVersion !== undefined &&
					backendVersion !== undefined &&
					String(backendVersion) !== String(match.resolverVersion)
				) {
					throw new Error(
						`Macro execution preview resolver '${match.resolverId}' is stale`,
					);
				}
			}
		}
	}
	const childResults: unknown[] = [];
	for (const { argumentId, input, binding } of executionPreview.bindings) {
		const child = adapter.children[argumentId];
		if (!child?.execute) continue;
		childResults.push(
			await child.execute(binding, {
				text: executionPreview.rawText,
				input,
				definition: adapter.definition,
				candidates: executionPreview.candidateSnapshots.filter(
					(candidate) => candidate.argumentId === argumentId,
				),
			}),
		);
	}
	return adapter.compile(
		executionPreview.bindings.map((item) => item.binding),
		draft.input,
		childResults,
	);
}

function createExecutionPreview(
	adapter: MacroDefinitionAdapter,
	rawText: string,
	options: MacroRuntimeOptions,
	bindings: readonly MacroExecutionBinding[],
	input: MacroInput,
	diagnostics: readonly MacroDiagnostic[],
): MacroExecutionPreview {
	const bindingDiagnostics = bindings.flatMap(
		(item) => item.binding.diagnostics ?? [],
	);
	const allDiagnostics = [...diagnostics, ...bindingDiagnostics];
	const spans = bindings.flatMap((item) =>
		item.input.sourceSpan
			? [item.input.sourceSpan]
			: item.input.start !== undefined && item.input.end !== undefined
				? [{ start: item.input.start, end: item.input.end }]
				: [],
	);
	const contextFingerprint = stableFingerprint(options.context.syntax);
	const status =
		bindings.some((item) => item.binding.status !== "accepted") ||
		allDiagnostics.length > 0
			? "invalid"
			: "valid";
	const artifact = {
		macroId: adapter.definition.id,
		macroVersion: adapter.definition.version ?? 1,
		rawText,
		contextFingerprint,
		bindings,
		spans,
		candidateSnapshots: options.candidates ?? options.candidateSnapshots ?? [],
		...(options.configuredValues?.fingerprint === undefined
			? {}
			: { configuredValueFingerprint: options.configuredValues.fingerprint }),
	};
	return deepFreeze({
		...artifact,
		status,
		fingerprint: stableFingerprint(artifact),
		diagnostics: allDiagnostics,
	});
}

function stableFingerprint(value: unknown): string {
	const serialized = stableSerialize(value);
	let hash = 2166136261;
	for (let index = 0; index < serialized.length; index += 1) {
		hash ^= serialized.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `macro-preview-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableSerialize(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
		.join(",")}}`;
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object") return value;
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) {
		if (child && typeof child === "object" && !Object.isFrozen(child))
			deepFreeze(child);
	}
	return value;
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
