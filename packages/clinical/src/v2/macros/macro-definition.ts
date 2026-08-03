/**
 * V2 command-macro definition contracts.
 *
 * Type-only V2 equivalent of the legacy `ParserCommandMacro` / macro value
 * specification model, decoupled from parser profiles and `ParsedItem`. The
 * legacy macro files under `parser/command/` and `store/parser/command-macros/`
 * are reference material for Phase 3 and MUST NOT be imported by V2.
 */

import type { TypedValueKind } from "../values/typed-value";

export type MacroDefinitionStatus = "draft" | "published" | "retired";

export interface MacroExecutionPolicy {
	atomic: true;
	confidenceThreshold?: number;
	maxCompositionDepth?: number;
}

export type MacroValueSpecKind =
	| "concept"
	| "concept_array"
	| "scalar"
	| "enum"
	| "measurement"
	| "temporal"
	| "array"
	| "prose";

export interface V2ValueSpec {
	kind: MacroValueSpecKind;
	target?: { targetSchema: string; targetPath: string };
	required?: boolean;
	blankPolicy?: "reject" | "allow" | "skip";
	numericBounds?: {
		min?: number;
		max?: number;
		inclusiveMin?: boolean;
		inclusiveMax?: boolean;
	};
	valueKind?: TypedValueKind;
}

export interface MacroArgumentSpec {
	argumentId: string;
	name: string;
	aliases?: string[];
	roleName: string;
	position?: number;
	target: { targetSchema: string; targetPath: string };
	extraction: V2ValueSpec;
	required?: boolean;
	blankPolicy?: "reject" | "allow" | "skip";
	autocomplete?: {
		source: "dictionary" | "static" | "attribute_rules";
		minPrefixLength?: number;
		limit?: number;
	};
}

export interface MacroChildDefinition {
	childMacroName: string;
	parentRoleName: string;
	parentTargetPath: string;
	mergeStrategy: "replace" | "append" | "deep_merge" | "partial_fill";
	repeatable?: boolean;
	renderTemplateId?: string;
	renderMode?: "omit" | "inline" | "group" | "separate";
	renderOrder?: number;
}

/** An immutable reference to a specific published macro revision. */
export interface MacroDefinitionRef {
	macroId: string;
	macroName: string;
	version: number;
}

export interface V2MacroDefinition {
	macroId: string;
	macroName: string;
	version: number;
	status: MacroDefinitionStatus;
	active: boolean;
	root: {
		roleName: string;
		targetSchema: string;
		targetPath?: string;
		outputCellKind: "structured" | "directed_value" | "macro_output";
	};
	arguments: MacroArgumentSpec[];
	children?: MacroChildDefinition[];
	execution?: MacroExecutionPolicy;
	renderTemplateIds?: {
		preview: string;
		confirmation?: string;
		audit?: string;
	};
	description?: string;
	personnelId?: string;
	profileId?: string;
}

export interface MacroStore {
	get(
		macroName: string,
		context?: { personnelId?: string; profileId?: string },
	): Promise<V2MacroDefinition | null>;
	list(context?: {
		personnelId?: string;
		profileId?: string;
	}): Promise<V2MacroDefinition[]>;
}
