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

export type SetupPublicationStatus =
	| "draft"
	| "validated"
	| "published"
	| "active"
	| "retired";

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

export interface SetupGapConstraint {
	gapId: string;
	fromSlot: string;
	toSlot: string;
	min?: number;
	max?: number;
	unit: "items" | "words" | "chars";
	skipStopWords?: boolean;
	crossBoundaries?: boolean;
	boundaryDelimiterOverride?: string;
	boundaryTransitionalWords?: string[];
	allowedWords?: string[];
	forbiddenWords?: string[];
}

export type SetupCompositionTemplatePart =
	| { kind: "literal"; text: string; optional?: boolean }
	| {
			kind: "slot";
			slotId: string;
			blockId: string;
			required: boolean;
			repeatable?: boolean;
	  };

export interface SetupCompositionTemplate {
	templateId: string;
	version: number;
	parts: SetupCompositionTemplatePart[];
	gaps: SetupGapConstraint[];
	whitespace: "exact" | "flexible";
	punctuation: "exact" | "flexible";
	precedence: number;
	status: SetupPublicationStatus;
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

export interface SetupDateChildPolicy {
	mode: "none" | "shared" | "custom";
	childMacroId?: string;
	targetPath?: string;
	mergeStrategy?: "replace" | "append" | "deep_merge" | "partial_fill";
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
	dateChild?: SetupDateChildPolicy;
	templates?: SetupCompositionTemplate[];
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
	/** Lifecycle is optional so sources written before lifecycle support remain readable. */
	status?: SetupPublicationStatus;
	publishedAt?: string;
	activatedAt?: string;
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
