export type ProseSlotType =
	| "attribute"
	| "concept"
	| "repeating_block"
	| "sub_section";

export interface ProseSlot {
	slotName: string;
	slotType: ProseSlotType;
	anchorPattern: string; // Regex with named group (?<list>...), (?<value>...), or (?<[slotName]>...)
	targetSchema?: string;
	fieldPath?: string;
	ruleRef?: string;
	listDelimiter?: string;
	itemOverrides?: Record<string, any>;
	repeatPattern?: string;
	subTemplate?: {
		textGroup: string;
		slots: ProseSlot[];
	};
	delegateTemplateId?: string;
	linkTo?: {
		parentSlot: string;
		relation: "trigger" | "qualifier" | "supporting" | "duration";
	};
	maxItems?: number;
}

export interface ProseTemplate {
	templateId: string;
	parentTemplateId?: string;
	targetSchema: string;
	sectionPattern: string;
	priority?: number;
	maxItems?: number;
	slots: ProseSlot[];
	remnantContext?: {
		targetSchema?: string;
		itemOverrides?: Record<string, any>;
		parentSlotLink?: string;
	};
}
