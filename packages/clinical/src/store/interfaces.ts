export interface ParserSyntaxProfile {
	profileId: string;
	personnelId: string;
	tagToken: string; // e.g. '#'
	stateDelimiter: string; // e.g. '||'
	stateStartDelimiter: string; // e.g. '|'
	stateEndDelimiter: string; // e.g. '|'
	macroStartToken: string; // e.g. '^'
	variableStartToken: string; // e.g. '{'
	variableEndToken: string; // e.g. '}'
	isDefault: boolean;
	tagMappings?: Record<string, string>; // Maps custom tag names to canonical target schema types
	attributeRules?: AttributeParserRule[]; // Profile-driven regex parser rules for enums/attributes
}

export interface AttributeParserRule {
	targetField: string;        // e.g. 'certainty', 'status', 'severity', 'route', 'frequency'
	targetValue: string;        // e.g. 'refuted', 'active', 'severe', 'ORAL', 'TID'
	regexPatterns: string[];    // e.g. ['denies', 'deny', 'no\\s+']
	isCaseInsensitive?: boolean;
}

export interface ParserProfileStore {
	get(profileId: string): Promise<ParserSyntaxProfile | null>;
	getByPersonnel(personnelId: string): Promise<ParserSyntaxProfile | null>;
	set(profile: ParserSyntaxProfile): Promise<void>;
	delete(profileId: string): Promise<void>;
}

export interface CalibrationException {
	exceptionId: string;
	personnelId: string;
	rawTerm: string;
	contextSnippet?: string;
	suggestedConceptId?: string;
	status: "pending" | "mapped" | "ignored";
	createdAt: string;
}

export interface CalibrationStore {
	logException(
		exception: Omit<
			CalibrationException,
			"exceptionId" | "createdAt" | "status"
		>,
	): Promise<string>;
	listPending(personnelId?: string): Promise<CalibrationException[]>;
	resolve(
		exceptionId: string,
		status: "mapped" | "ignored",
		conceptId?: string,
	): Promise<void>;
}

export interface ClinicalProseTemplate {
	templateId: string;
	parentTemplateId?: string;
	targetSchema: string; // e.g. 'ObservationEvent'
	targetConceptId?: string; // e.g. 'SNOMED::29857009'
	workspaceId?: string;
	specialtyId?: string;
	slotPosition: "opening" | "continuing" | "closing" | "full_paragraph";
	templateText: string;
}

export interface ClinicalProseTemplateStore {
	getTemplate(
		schema: string,
		position: "opening" | "continuing" | "closing" | "full_paragraph",
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null>;
	setTemplate(template: ClinicalProseTemplate): Promise<void>;
}

export interface SignedSoapNoteRecord {
	noteId: string;
	sessionId: string;
	patientId: string;
	documentVersion: number;
	soapNoteJson: Record<string, any>;
	createdAt: string;
	signedBy: string;
}

export interface SignedSoapNoteStore {
	archive(record: Omit<SignedSoapNoteRecord, "createdAt">): Promise<void>;
	get(noteId: string): Promise<SignedSoapNoteRecord | null>;
	getBySession(sessionId: string): Promise<SignedSoapNoteRecord | null>;
	listForPatient(patientId: string): Promise<SignedSoapNoteRecord[]>;
}

export interface Personnel {
	personnelId: string;
	fullName: string;
	specialtyCode: string;
	facilityId: string;
}

export interface Facility {
	facilityId: string;
	facilityCode: string;
	facilityName: string;
	jurisdictionCode: string;
}

export interface AdministrativeStore {
	getPersonnel(id: string): Promise<Personnel | null>;
	getFacility(id: string): Promise<Facility | null>;
	setPersonnel(personnel: Personnel): Promise<void>;
	setFacility(facility: Facility): Promise<void>;
}

export interface JurisdictionalDisplay {
	conceptId: string;
	jurisdictionCode: string; // e.g. 'US-NY', 'JP'
	preferredDisplay: string;
	fullySpecifiedName: string;
}

export interface JurisdictionalDisplayStore {
	getPreferredDisplay(
		conceptId: string,
		jurisdictionCode: string,
	): Promise<string | null>;
	setJurisdictionalDisplay(display: JurisdictionalDisplay): Promise<void>;
}

export interface StopWordProfile {
	profileId: string;
	personnelId: string;
	localeFiles: string[];
	specialtyFiles: string[];
	customWords: string[];
}

export interface StopWordStore {
	getProfile(personnelId: string): Promise<StopWordProfile | null>;
	setProfile(profile: StopWordProfile): Promise<void>;
	compileStopWords(personnelId: string): Promise<Set<string>>;
}
