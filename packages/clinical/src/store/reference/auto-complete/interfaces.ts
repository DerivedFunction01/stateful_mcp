import type { ProseSlotType } from "../prose-parser-templates/prose-template";

export type Relation =
	| "trigger"
	| "qualifier"
	| "supporting"
	| "duration"
	| "contains"
	| "excludes";
export type Position = "opening" | "continuing" | "closing" | "full_paragraph";

export interface AutocompleteSuggestion {
	templateId: string;
	slotName: string;
	triggerPattern: string;
	insertText: string;
	cursorOffset: number;
	targetSchema?: string;
	targetConceptId?: string;
	rankScore: number;
	nextHints?: Array<{
		slotName: string;
		triggerPattern: string;
		insertText: string;
		cursorOffset: number;
		rankScore: number;
		relation?: Relation;
		slotType: ProseSlotType;
	}>;
}
