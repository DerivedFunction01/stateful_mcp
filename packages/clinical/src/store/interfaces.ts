import type {
	AllowedUnit,
	MeasurementOperator,
	MeasurementUnitAnchor,
} from "../schemas/measurement";
import type {
	FrequencyShorthand,
	PhysiologicalEventAnchor,
} from "../schemas/medication";
import type { PatientLearningBucket } from "../schemas/patient";
import type {
	Certainty,
	Route,
	SeverityLevel,
	Status,
	StringifiedBoolean,
} from "../schemas/shared";
import type { TimePrecisionLevel } from "../schemas/time";

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

export type AttributeRuleMapping =
	| {
			targetField: "calendar_date";
			targetValue: "calendar_date";
			unitAnchor?: undefined;
	  }
	| {
			targetField: "severity_score";
			targetValue: "number";
			unitAnchor?: undefined;
	  }
	| {
			targetField: "pain_score";
			targetValue: "number";
			unitAnchor?: undefined;
	  }
	| {
			targetField: "percentage";
			targetValue: "number";
			unitAnchor?: undefined;
	  }
	| {
			targetField: "measurement_value";
			targetValue: "number";
			unitAnchor?: undefined;
	  }
	| { targetField: "certainty"; targetValue: Certainty; unitAnchor?: undefined }
	| { targetField: "status"; targetValue: Status; unitAnchor?: undefined }
	| {
			targetField: "severity";
			targetValue: SeverityLevel;
			unitAnchor?: undefined;
	  }
	| { targetField: "route"; targetValue: Route; unitAnchor?: undefined }
	| {
			targetField: "frequency_prn";
			targetValue: StringifiedBoolean;
			unitAnchor?: undefined;
	  }
	| {
			targetField: "frequency_event_anchor";
			targetValue: PhysiologicalEventAnchor;
			unitAnchor?: undefined;
	  }
	| {
			targetField: "frequency_shorthand";
			targetValue: FrequencyShorthand;
			unitAnchor?: undefined;
	  }
	| {
			targetField: "operator" | "measurement_operator";
			targetValue: MeasurementOperator;
			unitAnchor?: undefined;
	  }
	| {
			targetField: "unit" | "measurement_unit";
			targetValue: AllowedUnit;
			unitAnchor?: MeasurementUnitAnchor;
	  }
	| {
			targetField: "time_unit";
			targetValue: TimePrecisionLevel;
			unitAnchor?: undefined;
	  }
	| {
			targetField: "time_relative_marker";
			targetValue: "retrospective" | "prospective";
			unitAnchor?: undefined;
	  }
	| {
			targetField: "time_boundary_marker";
			targetValue: "to";
			unitAnchor?: undefined;
	  }
	| {
			targetField: "time_exclusion_marker";
			targetValue: "except";
			unitAnchor?: undefined;
	  }
	| {
			targetField: "time_repeat_daily";
			targetValue: "daily";
			unitAnchor?: undefined;
	  };

export type AttributeParserRule = AttributeRuleMapping & {
	regexPatterns: string[];
	isCaseInsensitive?: boolean;
	blacklistPatterns?: string[];
	priority?: number;
	calendarTokens?: DateTimeToken[];
	calendarSeparators?: string[];
	monthNames?: string[];
	namedGroupContract?: NamedGroupContract;
};

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
	set(record: ParserConceptDefault): Promise<void>;
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

export interface IClinicalProseTemplateStore {
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

export interface StopWordContext {
	personnelId: string;
	locale?: string;
	specialtyId?: string;
	facilityId?: string;
	patientContext?: PatientLearningContext;
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
	compileStopWordsForContext(context: StopWordContext): Promise<Set<string>>;
}
