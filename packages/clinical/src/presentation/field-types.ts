import type { SingleMeasurement } from "../schemas/measurement";
import type { AnatomicalLocation, CodeableConcept } from "../schemas/shared";
import type { ClinicalDateRange, TimeMeasurement } from "../schemas/time";

export type PresentationFieldKind =
	| "concept"
	| "measurement"
	| "quantity"
	| "duration"
	| "range"
	| "anatomy"
	| "collection"
	| "status"
	| "text"
	| "number"
	| "boolean"
	| "date"
	| "object";
export type PresentationFieldState = "resolved" | "unresolved";
export type PresentationFieldEmphasis = "primary" | "secondary" | "diagnostic";
export type PresentationConcept = CodeableConcept;
export type PresentationAnatomy = AnatomicalLocation;
export type PresentationMeasurement = SingleMeasurement;
export type PresentationDuration = TimeMeasurement;
export type PresentationDateRange = ClinicalDateRange;

export interface FormattedQuantityValue {
	kind: "exact" | "comparison" | "range" | "unknown";
	text: string;
	approximate: boolean;
}

export interface PresentationField {
	path: string;
	label: string;
	kind: PresentationFieldKind;
	value: unknown;
	state: PresentationFieldState;
	children?: PresentationField[];
	emphasis?: PresentationFieldEmphasis;
	formatted?: FormattedQuantityValue;
}

export interface PresentationGroup {
	id: string;
	label: string;
	fields: PresentationField[];
}
export interface PresentationItem {
	targetSchema: string;
	title: string;
	rawText: string;
	concepts: PresentationConcept[];
	groups: PresentationGroup[];
}
