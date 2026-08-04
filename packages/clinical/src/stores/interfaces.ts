import type { PatientLearningBucket } from "../schemas/schemas-interface/patient";

export interface PatientLearningContext extends PatientLearningBucket {
	facilityId?: string;
}

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
	priority?: number;
}

export interface QuantityDisplayProfile {
	units?: Record<string, { short?: string; long?: string; narrow?: string }>;
	operators?: Record<
		"eq" | "gt" | "gte" | "lt" | "lte",
		{ symbol: string; label?: string }
	>;
}


export interface NamedGroupContract {
	required?: string[];
	allowed?: string[];
	disallowed?: string[];
}

import type { PipelineStep } from "@stateful-mcp/core";
import type { Position } from "./auto-complete/interfaces";

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
	slotPosition: Position;
	templateText: string;
	slots: Record<string, OutputProseSlot>;
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
	set(profile: StopWordProfile): Promise<void>;
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
