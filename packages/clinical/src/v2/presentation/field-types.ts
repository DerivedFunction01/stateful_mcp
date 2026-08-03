import type { CodeableConcept } from "../../schemas/shared";

export type V2PresentationFieldKind =
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
export type V2PresentationFieldState = "resolved" | "unresolved";
export type V2PresentationFieldEmphasis =
	| "primary"
	| "secondary"
	| "diagnostic";

export interface V2FormattedQuantityValue {
	kind: "exact" | "comparison" | "range" | "unknown";
	text: string;
	approximate: boolean;
}
export interface V2PresentationField {
	path: string;
	label: string;
	kind: V2PresentationFieldKind;
	value: unknown;
	state: V2PresentationFieldState;
	children?: V2PresentationField[];
	emphasis?: V2PresentationFieldEmphasis;
	formatted?: V2FormattedQuantityValue;
}
export interface V2PresentationGroup {
	id: string;
	label: string;
	fields: V2PresentationField[];
}
export interface V2PresentationItem {
	recordId: string;
	targetSchema: string;
	title: string;
	values: Record<string, unknown>;
	concepts: CodeableConcept[];
	groups: V2PresentationGroup[];
}
