export interface ConceptFieldRule {
	ruleId: string;
	conceptId: string;
	targetSchema: string;
	fieldPath: string;
}

export interface ConceptFieldStore {
	get(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
	): Promise<ConceptFieldRule | null>;
	list(): Promise<ConceptFieldRule[]>;
	listBySchema(targetSchema: string): Promise<ConceptFieldRule[]>;
	listByConcept(conceptId: string): Promise<ConceptFieldRule[]>;
	set(rule: ConceptFieldRule): Promise<void>;
	delete(
		conceptId: string,
		targetSchema: string,
		fieldPath: string,
	): Promise<void>;
}
