import type { CodeableConcept } from "../schemas/schemas-interface/shared";

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
export type PresentationFieldEmphasis =
	| "primary"
	| "secondary"
	| "diagnostic";

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
	recordId: string;
	targetSchema: string;
	title: string;
	values: Record<string, unknown>;
	concepts: CodeableConcept[];
	groups: PresentationGroup[];
}
