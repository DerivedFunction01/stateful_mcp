/**
 *  macro compiler.
 *
 * Coordinates macro input → binding → typed value extraction → immutable
 * `MacroExecutionPlan`. It validates the definition and its target paths
 * against the schema registry, produces deterministic fingerprints, and emits
 * typed diagnostics. No parser is imported; syntax normalization is delegated
 * to the input parser and value normalization to the value services.
 */

import { type PipelineDiagnostic, validatePipeline } from "@stateful-mcp/core";
import type {
	LearningObservationMode,
	LearningOutcome,
} from "../learning/interfaces";
import {
	buildMacroLearningFeatures,
	type MacroLearningTrace,
	type MacroLearningTraceArgument,
} from "../learning/macro-learning-types";
import type { MacroParseLearningStore } from "../learning/macro-parse-learning-store";
import { validateTargetPath } from "../schemas/schema-path-validator";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type { SchemaField } from "../schemas/schema-types";
import type { ConceptLookup } from "../values/concept-value";
import { resolveConceptValue } from "../values/concept-value";
import {
	type MeasurementConstraint,
	type MeasurementResolverDiagnostic,
	validateMeasurementConstraints,
} from "../values/measurement-resolver";
import type { TypedValue, ValueEvidence } from "../values/typed-value";
import { bindMacro } from "./macro-binder";
import type { MacroBindingIssue, MacroInput } from "./macro-binding";
import type { MacroArgumentSpec, MacroDefinition } from "./macro-definition";
import type {
	DocumentPlacementRef,
	MacroExecutionPlan,
	MacroLinkOperation,
	MacroPlanFingerprint,
	MacroTargetOperation,
} from "./macro-plan";
import { MacroDefinitionValidator } from "./macro-validator";
import type { ValueExtractDiagnostic } from "./macro-value-extractor";
import { extractTypedValue } from "./macro-value-extractor";

export interface MacroCompilerDeps {
	registry: SchemaRegistry;
	dictionary?: ConceptLookup;
	macroParseStore?: MacroParseLearningStore;
}

export interface MacroCompileResult {
	plan?: MacroExecutionPlan;
	groupId: string;
	diagnostics: string[];
	confidence?: Record<string, { score: number; sampleSize: number }>;
	learningTrace?: MacroLearningTrace;
}

export type CompileDiagnostic = ValueExtractDiagnostic | MacroBindingIssue;

export interface MacroCompilerOptions {
	groupId?: string;
	scope?: MacroExecutionPlan["scope"];
	sourceLine?: number;
	expectedFingerprint?: string;
	personnelId?: string;
	profileId?: string;
	sessionId?: string;
	observationMode?: LearningObservationMode;
	outcome?: LearningOutcome;
	correlationId?: string;
	placement?: DocumentPlacementRef;
}

export type FailureStage =
	| "validation"
	| "binding"
	| "extraction"
	| "constraint"
	| "compilation"
	| "projection"
	| "execution";

export interface FailureStageDiagnostic {
	stage: FailureStage;
	message: string;
	argumentId?: string;
	operationId?: string;
}

export class MacroCompiler {
	constructor(private deps: MacroCompilerDeps) {}

	async compile(
		input: MacroInput,
		definition: MacroDefinition,
		options: MacroCompilerOptions = {},
	): Promise<MacroCompileResult> {
		const diagnostics: string[] = [];
		const stageDiagnostics: FailureStageDiagnostic[] = [];
		const groupId =
			options.groupId ?? `grp_${definition.macroId}_${definition.version}`;
		const scope = options.scope ?? {
			kind: "clinical_document",
			sessionId: input.sourceLines[0]?.line
				? String(input.sourceLines[0].line)
				: input.macroName,
		};

		const validation = new MacroDefinitionValidator(
			this.deps.registry,
		).validate(definition);
		for (const issue of validation.issues.filter(
			(issue) => issue.severity === "error",
		)) {
			diagnostics.push(issue.message);
			stageDiagnostics.push({
				stage: "validation",
				message: issue.message,
				argumentId: issue.argumentId,
			});
		}
		if (!validation.valid) return { groupId, diagnostics };
		if (options.placement && definition.placementPolicy) {
			if (
				!definition.placementPolicy.allowedPlacementIds.includes(
					options.placement.placementId,
				)
			) {
				const message = `Placement '${options.placement.placementId}' is not allowed for macro '${definition.macroId}'`;
				diagnostics.push(message);
				stageDiagnostics.push({ stage: "validation", message });
				return { groupId, diagnostics };
			}
		} else if (definition.placementPolicy) {
			const message = `Macro '${definition.macroId}' requires an allowlisted document placement`;
			diagnostics.push(message);
			stageDiagnostics.push({ stage: "validation", message });
			return { groupId, diagnostics };
		}

		const binding = bindMacro(input, definition);
		for (const issue of binding.issues) {
			diagnostics.push(issue.message);
			stageDiagnostics.push({
				stage: "binding",
				message: issue.message,
				argumentId: issue.argumentId,
			});
		}

		const operations: MacroTargetOperation[] = [];
		const learningArguments: MacroLearningTraceArgument[] = [];
		for (const bindingEntry of binding.bindings) {
			const spec = definition.arguments.find(
				(a) => a.argumentId === bindingEntry.argumentId,
			);
			if (!spec) continue;

			const conditionResult = this.evaluateCondition(spec, bindingEntry);
			if (!conditionResult.pass) {
				for (const diag of conditionResult.diagnostics) {
					diagnostics.push(diag.message);
					stageDiagnostics.push({
						stage: "constraint",
						message: diag.message,
						argumentId: spec.argumentId,
					});
				}
				continue;
			}

			const field = this.resolveField(definition, spec);
			const extraction = await extractTypedValue(bindingEntry.rawValue, spec, {
				field,
				captures: bindingEntry.captures,
				items: bindingEntry.items,
				resolveConcept: this.deps.dictionary
					? (raw) => this.resolveConcept(raw, spec)
					: undefined,
			});
			for (const diag of extraction.diagnostics) {
				diagnostics.push(diag.message);
				stageDiagnostics.push({
					stage: "extraction",
					message: diag.message,
					argumentId: diag.argumentId,
				});
			}
			if (!extraction.value) continue;

			const constraintDiags = this.validateConstraints(
				extraction.value,
				spec,
				field,
			);
			for (const diag of constraintDiags) {
				diagnostics.push(diag.message);
				stageDiagnostics.push({
					stage: "constraint",
					message: diag.message,
					argumentId: spec.argumentId,
				});
			}
			if (constraintDiags.length > 0) continue;

			const canonicalValue = this.canonicalizeValue(extraction.value);
			const evidence = this.buildEvidence(spec, bindingEntry, extraction);

			operations.push({
				operationId: `op_${operations.length + 1}`,
				groupId,
				macroDefinitionId: definition.macroId,
				targetSchema: spec.target.targetSchema,
				targetPath: spec.target.targetPath,
				placement: options.placement,
				value: canonicalValue,
				rawValue: bindingEntry.rawValue,
				sourceLine: options.sourceLine ?? input.sourceLines[0]?.line ?? 0,
				sourceArgument: spec.position,
				evidence,
			});
			learningArguments.push({
				argumentId: spec.argumentId,
				roleName: spec.roleName,
				position: spec.position,
				rawTerm: bindingEntry.rawValue,
				parsedValue: canonicalValue,
				source: bindingEntry.source,
				start: bindingEntry.start,
				end: bindingEntry.end,
				features: buildMacroLearningFeatures(canonicalValue),
			});
		}

		const links: MacroLinkOperation[] = [];
		if (definition.children?.length) {
			for (const childDef of definition.children) {
				const parentOp = operations[0];
				const parentRef = parentOp
					? parentOp.operationId
					: `op_parent_${definition.macroId}`;
				const childRef = `op_child_${childDef.childMacroName}`;
				links.push({
					linkId: `link_${parentRef}_${childRef}`,
					parentRef,
					childRef,
					parentRoleName: childDef.parentRoleName,
					parentTargetPath: childDef.parentTargetPath,
					mergeStrategy: childDef.mergeStrategy,
					sourceLine: options.sourceLine ?? input.sourceLines[0]?.line ?? 0,
				});
			}
		}

		const fingerprint = this.fingerprint(definition, operations);

		if (
			options.expectedFingerprint &&
			options.expectedFingerprint !== fingerprint.value
		) {
			diagnostics.push(
				`Plan fingerprint mismatch: expected ${options.expectedFingerprint}, got ${fingerprint.value}`,
			);
			stageDiagnostics.push({
				stage: "compilation",
				message: `Plan fingerprint mismatch: expected ${options.expectedFingerprint}, got ${fingerprint.value}`,
			});
		}

		const plan: MacroExecutionPlan = {
			groupId,
			scope,
			macroDefinitions: [
				{
					macroId: definition.macroId,
					macroName: definition.macroName,
					version: definition.version,
				},
			],
			operations,
			links,
			generatedCells: [],
			expectedVersions: [],
			fingerprint,
			diagnostics,
		};

		const confidence: Record<string, { score: number; sampleSize: number }> =
			{};
		if (this.deps.macroParseStore) {
			for (const bindingEntry of binding.bindings) {
				const spec = definition.arguments.find(
					(a) => a.argumentId === bindingEntry.argumentId,
				);
				if (!spec) continue;

				const op = operations.find((o) => o.sourceArgument === spec.position);
				if (!op) continue;

				const parsedValueStr =
					typeof op.value === "string" ? op.value : JSON.stringify(op.value);
				const res = await this.deps.macroParseStore.getConfidence(
					definition.macroId,
					spec.argumentId,
					bindingEntry.rawValue,
					parsedValueStr,
				);
				confidence[spec.argumentId] = res;
			}
		}

		const learningTrace: MacroLearningTrace = {
			macroId: definition.macroId,
			macroVersion: definition.version,
			macroName: definition.macroName,
			arguments: learningArguments,
			personnelId: options.personnelId,
			profileId: options.profileId,
			sessionId: options.sessionId,
			observationMode: options.observationMode,
			outcome: options.outcome,
			correlationId: options.correlationId,
		};

		return { plan, groupId, diagnostics, confidence, learningTrace };
	}

	private evaluateCondition(
		spec: MacroArgumentSpec,
		bindingEntry: {
			argumentId: string;
			rawValue: string;
			captures?: Record<string, string | undefined>;
		},
	) {
		const condition = spec.extraction.condition;
		if (!condition)
			return { pass: true, diagnostics: [] as PipelineDiagnostic[] };
		const diagnostics = validatePipeline(condition.pipeline);
		if (diagnostics.length > 0) {
			return { pass: false, diagnostics };
		}
		return { pass: true, diagnostics: [] };
	}

	private validateConstraints(
		value: TypedValue,
		spec: MacroArgumentSpec,
		field?: SchemaField,
	): MeasurementResolverDiagnostic[] {
		if (value.kind !== "measurement") return [];
		const constraint: MeasurementConstraint = {
			dimension:
				spec.extraction.measurement?.dimension ?? field?.measurement?.dimension,
			allowedUnits:
				spec.extraction.measurement?.allowedUnits ??
				field?.measurement?.allowedUnits,
			deniedUnits: spec.extraction.measurement?.deniedUnits,
			canonicalUnit: spec.extraction.measurement?.canonicalUnit,
			rawBounds:
				spec.extraction.measurement?.rawBounds ?? spec.extraction.numericBounds,
			normalizedBounds: spec.extraction.measurement?.normalizedBounds,
		};
		return validateMeasurementConstraints(
			{
				magnitude: value.magnitude,
				unit: value.unit,
				operator: value.operator,
				isApproximate: value.isApproximate,
				dimension: value.dimension,
				normalized: value.normalized,
				rawValue: value.magnitude,
				rawUnit: value.unit,
			},
			constraint,
		);
	}

	private canonicalizeValue(value: TypedValue): TypedValue {
		if (value.kind === "measurement" && value.normalized) {
			return {
				...value,
				magnitude: value.normalized.magnitude,
				unit: value.normalized.unit,
				normalized: undefined,
			};
		}
		return value;
	}

	private buildEvidence(
		spec: MacroArgumentSpec,
		bindingEntry: {
			argumentId: string;
			rawValue: string;
			captures?: Record<string, string | undefined>;
		},
		extraction: { diagnostics: unknown[] },
	): ValueEvidence[] {
		const evidence: ValueEvidence[] = [{ source: spec.extraction.kind }];
		if (bindingEntry.captures) {
			for (const [key, value] of Object.entries(bindingEntry.captures)) {
				if (value !== undefined) {
					evidence.push({ source: `capture:${key}`, pattern: value });
				}
			}
		}
		return evidence;
	}

	private resolveField(definition: MacroDefinition, spec: MacroArgumentSpec) {
		const result = validateTargetPath(
			this.deps.registry,
			spec.target.targetSchema,
			spec.target.targetPath,
		);
		return result.valid ? (result.field ?? undefined) : undefined;
	}

	private async resolveConcept(raw: string, spec: MacroArgumentSpec) {
		if (!this.deps.dictionary) {
			return { diagnostics: ["No dictionary configured"] };
		}
		const resolved = await resolveConceptValue(raw, this.deps.dictionary, {
			required: spec.extraction.required ?? spec.required ?? true,
			roleName: spec.roleName,
		});
		return {
			concept: resolved.value?.concept,
			diagnostics: resolved.diagnostics.map((d) => d.message),
		};
	}

	private fingerprint(
		definition: MacroDefinition,
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
