import type { ConceptFilter, CustomExpression } from "@stateful-mcp/core";
import type { MacroDefinition } from "../macros/macro-definition";
import type { NumericalSyntaxProfile } from "../values/numerical-syntax-profile";
import type { SchemaCardinality } from "../schemas/schema-types";

export type SetupBlockKind =
	| "concept"
	| "expression"
	| "enum"
	| "numeric"
	| "measurement"
	| "temporal"
	| "comparison"
	| "target-alias";

export type SetupPublicationStatus = "draft" | "published" | "retired";

export interface SetupPrimitiveProfile {
	profileId: string;
	version: number;
	dateExamples: string[];
	preferredDateFormat?: string;
	timeExamples: string[];
	measurementExamples: string[];
	decimalSeparator: "." | ",";
	thousandsSeparator?: "," | "." | " " | "none";
	measurementUnitOrder: "before" | "after";
	comparisonOperators: string[];
	baseNumericalProfile?: NumericalSyntaxProfile;
}

export interface SetupDocumentPlacement {
	placementId: string;
	documentSchema: string;
	documentVersion: number;
	documentPath: string;
	targetSchema: string;
	targetSchemaVersion: number;
	cardinality: SchemaCardinality;
}

export interface SetupTargetAlias {
	alias: string;
	targetSchema: string;
	targetPath: string;
	active: boolean;
}

export interface SetupBlockTarget {
	targetSchema: string;
	targetPath: string;
}

export interface SetupBlockRecipe {
	phrases?: string[];
	preferredOrder?: "fixed" | "flexible";
	wordBoundary?: "none" | "before" | "after" | "both";
	requiredWords?: string[];
	forbiddenWords?: string[];
	lookbehindWords?: string[];
	lookaheadWords?: string[];
	positiveExamples?: string[];
	negativeExamples?: string[];
	caseSensitive?: boolean;
	flexibleWhitespace?: boolean;
}

export interface SetupGrammarBlock {
	blockId: string;
	version: number;
	label: string;
	kind: SetupBlockKind;
	target: SetupBlockTarget;
	valueKind: string;
	source:
		| { kind: "concept"; conceptId: string }
		| { kind: "expression"; expressionId: string }
		| { kind: "value-rule"; ruleId: string }
		| { kind: "generated"; recipe: SetupBlockRecipe };
	filterIds?: string[];
	primitiveProfileVersion?: number;
	schemaVersion: number;
	status: SetupPublicationStatus;
}

export type SetupArgumentPlacementMode = "single" | "fan_out";

export interface SetupMacroParameter {
	argumentId: string;
	blockId: string;
	placementMode?: SetupArgumentPlacementMode;
	placementId?: string;
}

export interface SetupMacroComposition {
	macroId: string;
	version: number;
	macroName: string;
	targetSchema: string;
	targetSchemaVersion: number;
	allowedPlacementIds: string[];
	defaultPlacementId?: string;
	parameters: SetupMacroParameter[];
	childMacroIds?: string[];
	status: SetupPublicationStatus;
	generatedMacro?: MacroDefinition;
}

export interface SetupSourceDocument {
	format: "stateful-clinical-setup";
	formatVersion: 1;
	sourceId: string;
	profileId: string;
	profileVersion: number;
	primitiveProfile: SetupPrimitiveProfile;
	concepts: Array<{
		conceptId: string;
		namespaceCode: string;
		standardCode: string;
		display: string;
	}>;
	expressions: CustomExpression[];
	conceptFilters: ConceptFilter[];
	targetAliases: SetupTargetAlias[];
	placements: SetupDocumentPlacement[];
	blocks: SetupGrammarBlock[];
	macros: SetupMacroComposition[];
	updatedAt: string;
	updatedBy?: string;
}

export interface SetupDiagnostic {
	severity: "error" | "warning";
	code: string;
	message: string;
	path?: string;
}

export interface SetupValidationResult {
	valid: boolean;
	diagnostics: SetupDiagnostic[];
}
