import type { SharedFieldAnchor } from "../parser/field-shared/shared-field-anchor";
import type { PatientLearningBucket } from "../schemas/patient";
import type { Cell } from "../session/cell";

export interface ParserSyntaxProfile {
	profileId: string;
	personnelId: string;
	tagToken: string; // e.g. '#'
	stateDelimiter: string; // e.g. '||' (full cell split)
	stateStartDelimiter: string; // e.g. '|' (split different objects within that cell, semi-hard boundary)
	stateEndDelimiter: string; // e.g. '|'
	macroStartToken: string; // e.g. '^'
	variableStartToken: string; // e.g. '{'
	variableEndToken: string; // e.g. '}'
	isDefault: boolean;
	macroArgStartToken?: string;
	macroArgEndToken?: string;
	macroArgDelimiter?: string;
	tagMappings?: Record<string, string>; // Maps custom tag names to canonical target schema types
	commandMappings?: Record<string, "set" | "assert" | "eval">; // Maps custom command verbs to canonical verbs
	workspaceCommandMappings?: Record<string, import("../engine/workspace-store").WorkspaceCommandVerb>;
	attributeRules?: AttributeParserRule[]; // Profile-driven regex parser rules for enums/attributes
	evaluatorRules?: ParserDictionaryRule[]; // Dynamic regex capture evaluators
	termTokenizer?: string; // Tokenizer to parse direct database/dictionary lookup (e.g. '::')
	commentStartToken?: string; // e.g. '//'
	commentEndToken?: string; // e.g. ';'
	macroPlaceholder?: string; // e.g. '[__]'
	variableDelimiter?: string; // e.g. ','
	startTermCodeDelimiter?: string; // e.g. '@@'
	startTermDisplayDelimiter?: string; // e.g. '@#'
	startTermCodeSeparator?: string; // e.g. '#'
	startTermDelimiter?: string; // e.g. '@'
	endTermDelimiter?: string; // e.g. ';'
	attributeDelimiter?: string; // e.g. ','
	isActive?: boolean;
	schemaNamespaces?: Record<string, string[]>; // Maps schema keys or names to prioritized/allowed namespaces
	stopWordThreshold?: number; // Ratio (0.0–1.0) of stop words above which a tagless segment is treated as conversational narrative and skipped. Default: 0.6
	schemaDefaults?: Record<string, Record<string, any>>;
	defaultsStrategy?: string;
	calendarDateFormats?: DateTimeFormatConfig[];
	numericFieldFormats?: NumericFieldFormatOptions[];
	boundaryDelimiter?: string;
	transitionalWords?: string[];
	numberWordConfig?: import("../parser/utils/number-word-normalizer").NumberWordConfig;
}

export interface PatientLearningContext extends PatientLearningBucket {
	facilityId?: string;
}

export type NumericValueTarget =
	| "severity_score"
	| "pain_score"
	| "percentage"
	| "measurement_value";

export interface NumericFieldFormatOptions {
	integerDigits?: number;
	decimalDigits?: number;
	thousandsSeparator?: string;
	decimalPoint?: string;
	allowNegative?: boolean;
	exact?: boolean;
	leadingMin?: number;
	leadingMax?: number;
	currencySymbols?: string[];
	currencyPosition?: "prefix" | "suffix";
	negativeStyle?: "sign" | "parens" | "both";
	groupName?: string;
	wrap?: boolean;
	targetField?: NumericValueTarget;
	targetSchema?: string;
	priority?: number;
}

export interface ParserDictionaryRule {
	ruleId: string;
	targetField: string; // e.g. 'severity', 'blood_pressure', 'quantity', 'session_vars'
	evaluatorName: string; // e.g. 'parseSeverity', 'parseBloodPressure', 'parseQuantityUnit', 'parseSessionVars'
	regexPatterns: string[]; // e.g. ['(?<numerator>\\d+)\\s*\\/\\s*(?<denominator>\\d+)']
	namedGroupContract?: NamedGroupContract;
}

export type AttributeParserRule = {
	targetField: string;
	targetValue: string;
	regexPatterns: string[];
	isCaseInsensitive?: boolean;
	blacklistPatterns?: string[];
	priority?: number;
	calendarTokens?: DateTimeToken[];
	calendarSeparators?: string[];
	monthNames?: string[];
	dayPeriods?: {
		am: string[];
		pm: string[];
	};
	namedGroupContract?: NamedGroupContract;
	unitAnchor?: string;
	targetSchema?: string;
};

export interface FieldMappingRule<TSchema extends string = string> {
	sourceKey: string;
	targetField?: TSchema;
	namedGroupContract?: NamedGroupContract;
	valueMap?: Record<string, string | number | boolean>;
	conceptDefaultPath?: (string | number)[];
	schemaDefaultField?: string;
	compute?: (
		slots: Record<string, any>,
		conceptDefaults: any,
		rawGroups?: Record<string, string | undefined>,
	) => unknown;
}

export type DateTimeToken =
	| "YYYY"
	| "YY"
	| "MM"
	| "MM_name"
	| "DD"
	| "HH"
	| "min"
	| "SS"
	| "ampm"
	| "tz";

export interface DateTimeFormatConfig {
	tokens: DateTimeToken[];
	separators: string[];
	options?: {
		centuryDecades?: Record<string, string>;
		is24Hour?: boolean;
		exact?: boolean;
		monthNames?: string[];
	};
}

export interface NamedGroupContract {
	required?: string[];
	allowed?: string[];
	disallowed?: string[];
}

export interface ParserConceptDefault {
	anchorConceptId: string;
	targetSchema: string;
	regexPatterns: string[];
	defaultProperties: Record<string, any>;
}

export interface ParserConceptDefaultStore {
	get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null>;
	listBySchema(targetSchema: string): Promise<ParserConceptDefault[]>;
	list(): Promise<ParserConceptDefault[]>;
	set(record: ParserConceptDefault): Promise<void>;
	delete(anchorConceptId: string, targetSchema: string): Promise<void>;
}

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

import type { PipelineStep } from "@stateful-mcp/core";

export interface SlotCondition {
	pipeline: PipelineStep[];
}

export interface OutputProseSlot {
	sourcePath: string;
	format?: string;
	fallback?: string;
	conditionalDelegates?: {
		delegateTemplateId: string;
		conditions: SlotCondition;
	}[];
	defaultDelegateTemplateId?: string;
	listOptions?: {
		delimiter: string;
		lastDelimiter?: string;
	};
	conditions?: SlotCondition;
	transform?: { pipeline: PipelineStep[] };
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
	slots: Record<string, OutputProseSlot>;
}

export interface ParserMacro {
	macroId: string;
	macroName: string;
	macroTemplate: string;
	personnelId?: string;
}

export interface ParserMacroStore {
	get(macroName: string): Promise<ParserMacro | null>;
	list(): Promise<ParserMacro[]>;
	set(macro: ParserMacro): Promise<void>;
	delete(macroId: string): Promise<void>;
}

export interface SignedSoapNoteRecord {
	noteId: string;
	sessionId: string;
	patientId: string;
	documentVersion: number;
	soapNoteJson: Record<string, any>;
	events: Array<Record<string, unknown>>;
	workspaceEvents: Array<Record<string, unknown>>;
	createdAt: string;
	signedBy: string;
}

export interface SignedSoapNoteStore {
	archive(record: Omit<SignedSoapNoteRecord, "createdAt">): Promise<void>;
	get(noteId: string): Promise<SignedSoapNoteRecord | null>;
	getBySession(sessionId: string): Promise<SignedSoapNoteRecord | null>;
	listForPatient(patientId: string): Promise<SignedSoapNoteRecord[]>;
}

export interface CellStore {
	get(cellId: string): Promise<Cell | null>;
	list(sessionId: string): Promise<Cell[]>;
	save(cell: Cell): Promise<void>;
	delete(cellId: string): Promise<void>;
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

export interface SchemaParserConfig {
	schema: string;
	targetSchema: string;
	preparsedContextKeys?: string[];
	sharedFieldAnchors?: SharedFieldAnchor[];
}

export interface StopWordContext {
	personnelId: string;
	locale?: string;
	specialtyId?: string;
	facilityId?: string;
	patientContext?: PatientLearningContext;
	workspaceId?: string;
}

export interface StopWordProfile {
	profileId: string;
	personnelId: string;
	localeFiles: string[];
	specialtyFiles: string[];
	customWords: string[];
	wordListIds: string[];
	excludedWords: string[];
	additionalWords: string[];
}

export interface StopWordWordListRecord {
	id: string;
	words: string[];
}

export interface StopWordStore {
	getProfile(personnelId: string): Promise<StopWordProfile | null>;
	setProfile(profile: StopWordProfile): Promise<void>;
	deleteProfile(personnelId: string): Promise<void>;
	compileStopWords(personnelId: string): Promise<Set<string>>;
	compileStopWordsForContext(context: StopWordContext): Promise<Set<string>>;
}

export interface StopWordWordListStore {
	get(id: string): Promise<string[] | null>;
	list(): Promise<StopWordWordListRecord[]>;
	set(id: string, words: string[]): Promise<void>;
	delete(id: string): Promise<void>;
}
