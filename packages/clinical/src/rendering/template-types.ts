import type { PipelineStep } from "@stateful-mcp/core";
import type { Concept } from "@stateful-mcp/core/middleware/dictionary/types";
import type { ClinicalDateRange } from "../schemas/schemas-interface/time";

export type TemplatePosition =
	| "opening"
	| "continuing"
	| "closing"
	| "full_paragraph";

export type ProseTemplateKind = "root" | "component";
export type SoapSection = "subjective" | "objective" | "assessment" | "plan";

export interface SlotCondition {
	pipeline: PipelineStep[];
}

export interface ProseTemplateContract {
	targetSchema?: string;
	section?: SoapSection;
	slotKey?: string;
}

export interface ProseValueSpec {
	sourcePath: string;
	kind?: "literal" | "concept" | "measurement" | "enum" | "pronoun" | "time";
	allowedNamespaces?: readonly string[];
	display?: "literal" | "dictionary" | "preferred" | "code";
	unit?: string;
	enumMapKey?: string;
	locale?: string;
	time?: {
		mode?: "absolute" | "relative" | "auto";
		relativeLabels?: "never" | "when_exact" | "always";
		dateFormat?: string;
		timeZone?: string;
		locale?: string;
		relativeLabelMapId?: string;
	};
}

export interface ProseRenderContext {
	dictionary?: {
		getConcept(id: string): Promise<Concept | undefined> | Concept | undefined;
		search(
			query: string,
			namespace?: string,
			limit?: number,
		): Promise<Concept[]>;
	};
	formatMeasurement?: (input: {
		value: number;
		fromUnit?: string;
		toUnit: string;
		anchor: string;
	}) => string;
	displayEnum?: (
		value: unknown,
		options?: {
			mapKey?: string;
			locale?: string;
		},
	) => string;
	enumMaps?: Readonly<
		Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
	>;
	resolvePronoun?: (input: {
		gender?: string;
		grammaticalCase?: string;
	}) => string;
	formatDateRange?: (
		range: ClinicalDateRange,
		options: {
			mode: "absolute" | "relative" | "auto";
			relativeLabels: "never" | "when_exact" | "always";
			dateFormat?: string;
			timeZone?: string;
			locale?: string;
			relativeLabelMapId?: string;
			now?: Date;
		},
	) => string;
	variables?: Record<string, unknown>;
}

export type ProseEnumMaps = NonNullable<ProseRenderContext["enumMaps"]>;

export interface OutputProseSlot {
	sourcePath: string;
	format?: string;
	fallback?: string;
	conditionalDelegates?: {
		delegateTemplateId: string;
		conditions: SlotCondition;
	}[];
	defaultDelegateTemplateId?: string;
	listOptions?: { delimiter: string; lastDelimiter?: string };
	conditions?: SlotCondition;
	transform?: { pipeline: PipelineStep[] };
	contract?: ProseTemplateContract;
	valueSpec?: ProseValueSpec;
}
export interface ClinicalProseTemplate {
	templateId: string;
	templateName: string;
	kind: ProseTemplateKind;
	targetSchema: string;
	targetConceptId?: string;
	workspaceId?: string;
	specialtyId?: string;
	section?: SoapSection;
	slotKey?: string;
	slotPosition: TemplatePosition;
	templateText: string;
	slots: Record<string, OutputProseSlot>;
	active?: boolean;
}
