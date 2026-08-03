export type ProseSlotType =
	| "attribute"
	| "concept"
	| "repeating_block"
	| "sub_section";

export type Relation =
	| "trigger"
	| "qualifier"
	| "supporting"
	| "duration"
	| "contains"
	| "excludes";
export type Position = "opening" | "continuing" | "closing" | "full_paragraph";

export type AutocompleteSuggestionKind =
	| "prose"
	| "tag"
	| "macro"
	| "term"
	| "variable"
	| "cell_command";

export interface AutocompleteSuggestion {
	kind: AutocompleteSuggestionKind;
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
