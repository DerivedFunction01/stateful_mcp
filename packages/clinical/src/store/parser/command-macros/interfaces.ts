import type { CommandMacroAuthoringTemplate } from "../../../parser/command/command-macro-authoring-template";
import type { MacroBoundaryPolicy } from "../../../parser/command/command-macro-boundary";
import type { NamedGroupContract } from "../../interfaces";

export interface CommandFieldMetadata {
	roleName: string;
	targetSchema: string;
	targetPath: string;
	aliases?: string[];
	valueKind: "concept" | "quantity" | "temporal" | "scalar" | "array" | "prose";
	cardinality: "one" | "many";
	required?: boolean;
	ruleIds?: string[];
	hint?: string;
}

export interface NumericBounds {
	min?: number;
	max?: number;
	inclusiveMin?: boolean;
	inclusiveMax?: boolean;
}

export interface CommandMacroExclusionRule {
	pattern: string;
	scope:
		| "candidate_span"
		| "captured_group"
		| "full_argument"
		| "surrounding_context";
	targetGroup?: string;
	reason: string;
	caseSensitive?: boolean;
}

export interface CommandMacroPatternRule {
	pattern: string;
	namedGroupContract?: NamedGroupContract;
	fullSpan?: boolean;
	exclusions?: CommandMacroExclusionRule[];
	priority?: number;
}

export interface CommandMacroConceptSpec {
	kind: "concept";
	patterns?: CommandMacroPatternRule[];
	acceptedConceptNamespaces?: string[];
	requireConceptFilter: boolean;
}

export interface CommandMacroEnumValue {
	value: string;
	patterns: CommandMacroPatternRule[];
	aliases?: string[];
	priority?: number;
}

export interface CommandMacroEnumSpec {
	kind: "enum";
	values: CommandMacroEnumValue[];
	caseSensitive?: boolean;
	fullSpan?: boolean;
}

export interface CommandMacroMeasurementSpec {
	kind: "measurement";
	extraction: CommandMacroPatternRule;
	magnitudeGroup: string;
	unitGroup: string;
	dimension: string;
	units?: { allowed?: string[]; denied?: string[]; canonical?: string };
	bounds?: { raw?: NumericBounds; normalized?: NumericBounds };
}

export interface CommandMacroTemporalSpec {
	kind: "temporal";
	extraction: CommandMacroPatternRule;
	temporalType:
		| "duration"
		| "date"
		| "date_range"
		| "relative_time"
		| "cadence";
}

export interface CommandMacroScalarSpec {
	kind: "scalar";
	extraction: CommandMacroPatternRule;
	valueType: "string" | "integer" | "number" | "boolean" | "custom";
	bounds?: NumericBounds;
}

export interface CommandMacroArraySpec {
	kind: "array";
	item: CommandMacroValueSpec;
	itemDelimiter?: string;
	mergeStrategy: "append" | "replace";
}

export interface CommandMacroProseSpec {
	kind: "prose";
	targetSchema: string;
	parser: "legacy_cdsl";
}

export type CommandMacroValueSpec =
	| CommandMacroConceptSpec
	| CommandMacroEnumSpec
	| CommandMacroMeasurementSpec
	| CommandMacroTemporalSpec
	| CommandMacroScalarSpec
	| CommandMacroArraySpec
	| CommandMacroProseSpec;

export interface CommandMacroAutocomplete {
	source:
		| "dictionary"
		| "custom_expression"
		| "attribute_rules"
		| "evaluator_rules"
		| "term_lookup"
		| "macro"
		| "static";
	minPrefixLength?: number;
	limit?: number;
	showConceptDisplay?: boolean;
	showRole?: boolean;
}

export interface ParserCommandMacro {
	macroId: string;
	macroName: string;
	version: number;
	active: boolean;
	delimiter?: string;
	root: {
		roleName: string;
		targetSchema: string;
		targetPath?: string;
		cellPolicy: "create" | "update-active" | "reuse-group-root";
		outputCellKind: "structured" | "directed_value" | "macro_output";
	};
	arguments: CommandMacroArgument[];
	children?: CommandMacroChildDefinition[];
	proseBoundaryToken?: string;
	execution?: {
		atomic: true;
		confidenceThreshold?: number;
		maxCompositionDepth?: number;
	};
	personnelId?: string;
	profileId?: string;
	description?: string;
	authoringTemplate?: CommandMacroAuthoringTemplate;
	renderTemplateIds?: {
		preview: string;
		confirmation?: string;
		audit?: string;
	};
	boundary?: MacroBoundaryPolicy;
}

export interface CommandMacroArgument {
	argumentId: string;
	name: string;
	aliases?: string[];
	roleName: string;
	position?: number;
	target: { targetSchema: string; targetPath: string };
	extraction: CommandMacroValueSpec;
	required?: boolean;
	blankPolicy?: "reject" | "allow" | "skip";
	binding?: {
		positional: boolean;
		named: boolean;
		inference: "disabled" | "allowed" | "thresholded";
	};
	autocomplete?: CommandMacroAutocomplete;
	boundary?: MacroBoundaryPolicy;
}

export interface CommandMacroChildDefinition {
	childMacroName: string;
	parentRoleName: string;
	parentTargetPath: string;
	mergeStrategy: "replace" | "append" | "deep_merge" | "partial_fill";
	repeatable?: boolean;
	renderTemplateId?: string;
	renderMode?: "omit" | "inline" | "group" | "separate";
	renderLabel?: string;
	renderOrder?: number;
	renderSeparator?: string;
}

export interface ParserCommandMacroStore {
	get(
		macroName: string,
		context?: { personnelId?: string; profileId?: string },
	): Promise<ParserCommandMacro | null>;
	list(context?: {
		personnelId?: string;
		profileId?: string;
	}): Promise<ParserCommandMacro[]>;
	set(macro: ParserCommandMacro): Promise<void>;
	delete(macroId: string): Promise<void>;
}

export interface CommandMacroValidationDiagnostic {
	path: string;
	message: string;
}
