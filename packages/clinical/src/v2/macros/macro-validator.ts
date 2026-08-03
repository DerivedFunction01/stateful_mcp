import { validateTargetPath } from "../schemas/schema-path-validator";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type { TypedValueKind } from "../values/typed-value";
import type { MacroValueSpecKind, V2MacroDefinition } from "./macro-definition";

export type MacroValidationSeverity = "error" | "warning";

export interface MacroValidationIssue {
	severity: MacroValidationSeverity;
	code: string;
	message: string;
	argumentId?: string;
	path?: string;
}

export interface MacroValidationResult {
	valid: boolean;
	definition: V2MacroDefinition;
	issues: MacroValidationIssue[];
}

const MERGE_STRATEGIES = [
	"replace",
	"append",
	"deep_merge",
	"partial_fill",
] as const;

const PLURAL_EXTRACTION_KINDS = new Set<MacroValueSpecKind>([
	"concept_array",
	"array",
]);

function extractionKindCompatible(
	extractionKind: MacroValueSpecKind,
	fieldValueKind: TypedValueKind,
): boolean {
	switch (extractionKind) {
		case "concept":
			return fieldValueKind === "concept";
		case "concept_array":
			return fieldValueKind === "concept_array";
		case "scalar":
			return fieldValueKind === "scalar";
		case "enum":
			return fieldValueKind === "enum";
		case "measurement":
			return fieldValueKind === "measurement";
		case "temporal":
			return fieldValueKind === "temporal";
		case "array":
			return fieldValueKind === "array" || fieldValueKind === "composite";
		case "prose":
			return fieldValueKind === "composite";
		default:
			return false;
	}
}

export class MacroDefinitionValidator {
	constructor(private readonly registry: SchemaRegistry) {}

	validate(def: V2MacroDefinition): MacroValidationResult {
		const issues: MacroValidationIssue[] = [];

		this.validateStructure(def, issues);
		this.validateStatus(def, issues);
		this.validateSchemaExistence(def, issues);
		this.validateTargets(def, issues);
		this.validateExecutionPolicy(def, issues);
		this.validateChildren(def, issues);
		this.validateMergePolicies(def, issues);

		const valid = issues.every((issue) => issue.severity !== "error");
		return { valid, definition: def, issues };
	}

	private validateStructure(
		def: V2MacroDefinition,
		issues: MacroValidationIssue[],
	): void {
		if (!def.macroId || !def.macroId.trim()) {
			issues.push({
				severity: "error",
				code: "MISSING_MACRO_ID",
				message: "macroId must be non-empty",
			});
		}
		if (!def.macroName || !def.macroName.trim()) {
			issues.push({
				severity: "error",
				code: "MISSING_MACRO_NAME",
				message: "macroName must be non-empty",
			});
		}
		if (!Number.isInteger(def.version) || def.version < 1) {
			issues.push({
				severity: "error",
				code: "INVALID_VERSION",
				message: "version must be a positive integer",
			});
		}

		const args = def.arguments ?? [];
		const seenArgumentIds = new Set<string>();
		const seenNames = new Set<string>();
		for (const arg of args) {
			if (seenArgumentIds.has(arg.argumentId)) {
				issues.push({
					severity: "error",
					code: "DUPLICATE_ARGUMENT",
					message: `Duplicate argumentId '${arg.argumentId}'`,
					argumentId: arg.argumentId,
				});
			}
			seenArgumentIds.add(arg.argumentId);

			if (seenNames.has(arg.name)) {
				issues.push({
					severity: "error",
					code: "DUPLICATE_ARGUMENT",
					message: `Duplicate argument name '${arg.name}'`,
					argumentId: arg.argumentId,
				});
			}
			seenNames.add(arg.name);
		}
	}

	private validateStatus(
		def: V2MacroDefinition,
		issues: MacroValidationIssue[],
	): void {
		switch (def.status) {
			case "published":
				break;
			case "draft":
				issues.push({
					severity: "warning",
					code: "DRAFT_STATUS",
					message: `Macro '${def.macroName}' is in draft status and cannot be executed`,
				});
				break;
			case "retired":
				issues.push({
					severity: "warning",
					code: "RETIRED_STATUS",
					message: `Macro '${def.macroName}' is retired and should not be used`,
				});
				break;
		}
	}

	private validateSchemaExistence(
		def: V2MacroDefinition,
		issues: MacroValidationIssue[],
	): void {
		const rootSchema = def.root.targetSchema;
		if (!this.registry.get(rootSchema)) {
			issues.push({
				severity: "error",
				code: "UNKNOWN_SCHEMA",
				message: `Schema '${rootSchema}' is not registered or published`,
				path: def.root.targetPath,
			});
		}

		for (const arg of def.arguments ?? []) {
			const targetSchema = arg.target.targetSchema;
			if (!this.registry.get(targetSchema)) {
				issues.push({
					severity: "error",
					code: "UNKNOWN_SCHEMA",
					message: `Schema '${targetSchema}' is not registered or published`,
					argumentId: arg.argumentId,
					path: arg.target.targetPath,
				});
			}
		}
	}

	private validateTargets(
		def: V2MacroDefinition,
		issues: MacroValidationIssue[],
	): void {
		for (const arg of def.arguments ?? []) {
			const targetSchema = arg.target.targetSchema;
			const targetPath = arg.target.targetPath;

			const pathResult = validateTargetPath(
				this.registry,
				targetSchema,
				targetPath,
			);
			if (!pathResult.valid) {
				issues.push({
					severity: "error",
					code:
						pathResult.code === "schema_not_found"
							? "UNKNOWN_SCHEMA"
							: "PATH_NOT_FOUND",
					message:
						pathResult.message ??
						`Invalid target path '${targetPath}' on schema '${targetSchema}'`,
					argumentId: arg.argumentId,
					path: targetPath,
				});
				continue;
			}

			const field = pathResult.field;
			if (!field) continue;

			if (!extractionKindCompatible(arg.extraction.kind, field.valueKind)) {
				issues.push({
					severity: "warning",
					code: "VALUE_KIND_MISMATCH",
					message: `Extraction kind '${arg.extraction.kind}' is not compatible with field valueKind '${field.valueKind}'`,
					argumentId: arg.argumentId,
					path: targetPath,
				});
			}

			const argRequired = arg.required ?? arg.extraction.required ?? false;
			if (argRequired && !field.required) {
				issues.push({
					severity: "warning",
					code: "REQUIRED_BLANK_REJECT",
					message: `Required argument '${arg.argumentId}' targets an optional field '${targetPath}'`,
					argumentId: arg.argumentId,
					path: targetPath,
				});
			}

			if (
				field.cardinality === "many" &&
				!PLURAL_EXTRACTION_KINDS.has(arg.extraction.kind)
			) {
				issues.push({
					severity: "warning",
					code: "CARDINALITY_MISMATCH",
					message: `Field '${targetPath}' has cardinality 'many' but extraction kind '${arg.extraction.kind}' is singular`,
					argumentId: arg.argumentId,
					path: targetPath,
				});
			}
		}
	}

	private validateExecutionPolicy(
		def: V2MacroDefinition,
		issues: MacroValidationIssue[],
	): void {
		if (def.root.outputCellKind !== "macro_output") return;

		if (!def.execution) {
			issues.push({
				severity: "error",
				code: "MISSING_EXECUTION_POLICY",
				message: "Composite macro must declare an execution policy",
			});
			return;
		}

		if (def.execution.atomic !== true) {
			issues.push({
				severity: "error",
				code: "MISSING_EXECUTION_POLICY",
				message: "Composite macro execution policy must have atomic=true",
			});
		}
	}

	private validateChildren(
		def: V2MacroDefinition,
		issues: MacroValidationIssue[],
	): void {
		const children = def.children ?? [];
		if (children.length === 0) return;

		const seenChildNames = new Set<string>();
		for (const child of children) {
			if (seenChildNames.has(child.childMacroName)) {
				issues.push({
					severity: "error",
					code: "CHILD_CYCLE",
					message: `Duplicate childMacroName '${child.childMacroName}'`,
				});
			}
			seenChildNames.add(child.childMacroName);

			const pathResult = validateTargetPath(
				this.registry,
				def.root.targetSchema,
				child.parentTargetPath,
			);
			if (!pathResult.valid) {
				issues.push({
					severity: "error",
					code:
						pathResult.code === "schema_not_found"
							? "UNKNOWN_SCHEMA"
							: "PATH_NOT_FOUND",
					message:
						pathResult.message ??
						`Invalid parentTargetPath '${child.parentTargetPath}' on schema '${def.root.targetSchema}'`,
					path: child.parentTargetPath,
				});
			}
		}

		if (def.execution?.maxCompositionDepth !== undefined) {
			if (def.execution.maxCompositionDepth < children.length) {
				issues.push({
					severity: "warning",
					code: "COMPOSITION_DEPTH_EXCEEDED",
					message: `maxCompositionDepth (${def.execution.maxCompositionDepth}) is less than the number of direct children (${children.length})`,
				});
			}
		}
	}

	private validateMergePolicies(
		def: V2MacroDefinition,
		issues: MacroValidationIssue[],
	): void {
		for (const child of def.children ?? []) {
			if (!MERGE_STRATEGIES.includes(child.mergeStrategy)) {
				issues.push({
					severity: "error",
					code: "INVALID_MERGE_STRATEGY",
					message: `Invalid mergeStrategy '${child.mergeStrategy}' for child '${child.childMacroName}'`,
				});
			}
		}
	}
}

export function validateMacroDefinition(
	def: V2MacroDefinition,
	registry: SchemaRegistry,
): MacroValidationResult {
	return new MacroDefinitionValidator(registry).validate(def);
}
