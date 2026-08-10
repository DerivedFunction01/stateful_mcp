/**
 *  command-macro definition contracts.
 *
 * Type-only  equivalent of the legacy `ParserCommandMacro` / macro value
 * specification model, decoupled from parser profiles and `ParsedItem`. The
 * legacy macro files under `parser/command/` and `store/parser/command-macros/`
 * are reference material for Phase 3 and MUST NOT be imported by .
 */

import type { PipelineStep } from "@stateful-mcp/core";
import type { MergeStrategy } from "../values/merge";
import type { TemporalValueType, TypedValueKind } from "../values/typed-value";

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

export interface NamedGroupContract {
	required?: readonly string[];
	allowed?: readonly string[];
	disallowed?: readonly string[];
	fullSpan?: boolean;
}

export interface MeasurementConstraintSpec {
	dimension?: string;
	allowedUnits?: readonly string[];
	deniedUnits?: readonly string[];
	canonicalUnit?: string;
	rawBounds?: {
		min?: number;
		max?: number;
		inclusiveMin?: boolean;
		inclusiveMax?: boolean;
	};
	normalizedBounds?: {
		min?: number;
		max?: number;
		inclusiveMin?: boolean;
		inclusiveMax?: boolean;
	};
}

export interface PipelineConditionSpec {
	pipeline: PipelineStep[];
	message?: string;
}

export interface ValueSpec {
	kind: MacroValueSpecKind;
	patterns?: readonly string[];
	namedGroupContract?: NamedGroupContract;
	temporalType?: TemporalValueType;
	itemDelimiter?: string;
	target?: { targetSchema: string; targetPath: string };
	required?: boolean;
	blankPolicy?: "reject" | "allow" | "skip";
	numericBounds?: {
		min?: number;
		max?: number;
		inclusiveMin?: boolean;
		inclusiveMax?: boolean;
		step?: number;
	};
	valueKind?: TypedValueKind;
	measurement?: MeasurementConstraintSpec;
	condition?: PipelineConditionSpec;
}

export interface SlotSuggestion {
	label: string;
	value: string;
	[key: string]: unknown;
}

export type CommandMacroTemplatePart =
	| { kind: "literal"; text: string }
	| {
			kind: "slot";
			argumentId: string;
			occurrence: number;
			displayText?: string;
			suggestions?: readonly SlotSuggestion[];
	  };

/** A definition-owned friendly authoring form. */
export interface CommandMacroAuthoringTemplate {
	version: 1;
	parts: readonly CommandMacroTemplatePart[];
	/** Stable store identity for named-template migration and preview selection. */
	templateId?: string;
	/** Named-placeholder form used by the authoring renderer. */
	templateText?: string;
	slots?: Record<string, MacroAuthoringSlot>;
}

export interface MacroAuthoringSlot {
	argumentId: string;
	occurrence: number;
	displayText?: string;
}

export interface MacroArgumentForm {
	formId: string;
	kind: "friendly";
	argumentId: string;
	template: CommandMacroAuthoringTemplate;
	precedence?: number;
	compatibility?: readonly string[];
}

export interface MacroArgumentSpec {
	argumentId: string;
	name: string;
	aliases?: string[];
	roleName: string;
	position?: number;
	target: { targetSchema: string; targetPath: string };
	extraction: ValueSpec;
	required?: boolean;
	defaultValue?: string;
	blankPolicy?: "reject" | "allow" | "skip";
	autocomplete?: {
		source: "dictionary" | "static" | "attribute_rules";
		minPrefixLength?: number;
		limit?: number;
	};
	/** Additional definition-driven forms; canonical name=value remains implicit. */
	forms?: readonly MacroArgumentForm[];
}

export interface MacroChildInputContract {
	mode: "named" | "positional" | "standalone";
	argumentId?: string;
	aliases?: readonly string[];
	position?: number;
}

export interface MacroChildDefinition {
	childMacroName: string;
	parentRoleName: string;
	parentTargetPath: string;
	mergeStrategy: MergeStrategy;
	input?: MacroChildInputContract;
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

export interface MacroDefinition {
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
	syntax?: {
		argumentDelimiter?: string;
		proseBoundaryToken?: string;
	};
	authoringTemplates?: readonly CommandMacroAuthoringTemplate[];
	placementPolicy?: {
		allowedPlacementIds: readonly string[];
		defaultPlacementId?: string;
		allowFanOut: boolean;
	};
}

export interface MacroStore {
	get(
		macroName: string,
		context?: { personnelId?: string; profileId?: string },
	): Promise<MacroDefinition | null>;
	list(context?: {
		personnelId?: string;
		profileId?: string;
	}): Promise<MacroDefinition[]>;
}
