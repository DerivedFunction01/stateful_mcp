/**
 * V2 macro compiler.
 *
 * Coordinates macro input → binding → typed value extraction → immutable
 * `MacroExecutionPlan`. It validates the definition and its target paths
 * against the schema registry, produces deterministic fingerprints, and emits
 * typed diagnostics. No parser is imported; syntax normalization is delegated
 * to the input parser and value normalization to the value services.
 */

import type { MacroArgumentSpec, V2MacroDefinition } from "./macro-definition";
import type {
	MacroBindingIssue,
	MacroInput,
} from "./macro-binding";
import type {
	MacroExecutionPlan,
	MacroPlanFingerprint,
	MacroTargetOperation,
} from "./macro-plan";
import type { SchemaRegistry } from "../schemas/schema-registry";
import { validateTargetPath } from "../schemas/schema-path-validator";
import type { ConceptLookup } from "../values/concept-value";
import { resolveConceptValue } from "../values/concept-value";
import type { ValueExtractDiagnostic } from "./macro-value-extractor";
import { extractTypedValue } from "./macro-value-extractor";
import { bindMacro } from "./macro-binder";

export interface MacroCompilerDeps {
	registry: SchemaRegistry;
	dictionary?: ConceptLookup;
}

export interface MacroCompileResult {
	plan?: MacroExecutionPlan;
	groupId: string;
	diagnostics: string[];
}

export type CompileDiagnostic =
	| ValueExtractDiagnostic
	| MacroBindingIssue;

export interface MacroCompilerOptions {
	groupId?: string;
	scope?: MacroExecutionPlan["scope"];
	sourceLine?: number;
}

export class MacroCompiler {
	constructor(private deps: MacroCompilerDeps) {}

	async compile(
		input: MacroInput,
		definition: V2MacroDefinition,
		options: MacroCompilerOptions = {},
	): Promise<MacroCompileResult> {
		const diagnostics: string[] = [];
		const groupId = options.groupId ?? `grp_${definition.macroId}_${definition.version}`;
		const scope = options.scope ?? { kind: "clinical_document", sessionId: input.sourceLines[0]?.line ? String(input.sourceLines[0].line) : input.macroName };

		const binding = bindMacro(input, definition);
		for (const issue of binding.issues) {
			diagnostics.push(issue.message);
		}

		const operations: MacroTargetOperation[] = [];
		for (const bindingEntry of binding.bindings) {
			const spec = definition.arguments.find((a) => a.argumentId === bindingEntry.argumentId);
			if (!spec) continue;
			const field = this.resolveField(definition, spec);
			const extraction = await extractTypedValue(bindingEntry.rawValue, spec, {
				field,
				resolveConcept: this.deps.dictionary
					? (raw) => this.resolveConcept(raw, spec)
					: undefined,
			});
			for (const diag of extraction.diagnostics) {
				diagnostics.push(diag.message);
			}
			if (!extraction.value) continue;
			operations.push({
				operationId: `op_${operations.length + 1}`,
				groupId,
				targetSchema: spec.target.targetSchema,
				targetPath: spec.target.targetPath,
				value: extraction.value,
				rawValue: bindingEntry.rawValue,
				sourceLine: options.sourceLine ?? input.sourceLines[0]?.line ?? 0,
				sourceArgument: spec.position,
				evidence: [{ source: spec.extraction.kind }],
			});
		}

		const fingerprint = this.fingerprint(definition, operations);

		const plan: MacroExecutionPlan = {
			groupId,
			scope,
			macroDefinitions: [{
				macroId: definition.macroId,
				macroName: definition.macroName,
				version: definition.version,
			}],
			operations,
			links: [],
			generatedCells: [],
			expectedVersions: [],
			fingerprint,
			diagnostics,
		};

		return { plan, groupId, diagnostics };
	}

	private resolveField(
		definition: V2MacroDefinition,
		spec: MacroArgumentSpec,
	) {
		const result = validateTargetPath(
			this.deps.registry,
			spec.target.targetSchema,
			spec.target.targetPath,
		);
		return result.valid ? result.field ?? undefined : undefined;
	}

	private async resolveConcept(raw: string, spec: MacroArgumentSpec) {
		if (!this.deps.dictionary) {
			return { diagnostics: ["No dictionary configured"] };
		}
		const resolved = await resolveConceptValue(raw, this.deps.dictionary, {
			required: spec.extraction.required ?? spec.required ?? true,
		});
		return {
			concept: resolved.value?.concept,
			diagnostics: resolved.diagnostics.map((d) => d.message),
		};
	}

	private fingerprint(
		definition: V2MacroDefinition,
		operations: MacroTargetOperation[],
	): MacroPlanFingerprint {
		const seed = JSON.stringify({
			macroName: definition.macroName,
			version: definition.version,
			operations: operations.map((op) => ({
				schema: op.targetSchema,
				path: op.targetPath,
				value: op.value,
				raw: op.rawValue,
			})),
		});
		let hash = 2166136261;
		for (let i = 0; i < seed.length; i++) {
			hash ^= seed.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return {
			value: (hash >>> 0).toString(16).padStart(8, "0"),
			algorithm: "v2-plan-fingerprint-v1",
		};
	}
}
