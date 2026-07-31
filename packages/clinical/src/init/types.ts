export type ClinicalInitMode = "bootstrap" | "full";
export type ClinicalInitSeedPolicy = "never" | "if_empty" | "force";
export type ClinicalInitValidationLevel = "none" | "bootstrap" | "full";

export interface ClinicalInitExpansionConfig {
	enabled?: boolean;
	lazy?: boolean;
	sources?: Record<string, unknown>;
}

export interface ClinicalInitConfig {
	enabled?: boolean;
	mode?: ClinicalInitMode;
	seedPolicy?: ClinicalInitSeedPolicy;
	validate?: ClinicalInitValidationLevel;
	registerSchemas?: boolean;
	seedSource?: "external" | "starter" | "none";
	expansion?: ClinicalInitExpansionConfig;
}

export enum ClinicalInitConfigDiagnosticCode {
	INIT_DISABLED_WITH_SOURCE = "INIT_DISABLED_WITH_SOURCE",
	FORCE_SEED_WITHOUT_SOURCE = "FORCE_SEED_WITHOUT_SOURCE",
	EXPANSION_WITH_BOOTSTRAP_MODE = "EXPANSION_WITH_BOOTSTRAP_MODE",
}

export enum ClinicalInitSeedDiagnosticCode {
	DUPLICATE_SEED_MODULE_ID = "DUPLICATE_SEED_MODULE_ID",
	MISSING_SEED_MODULE_DEPENDENCY = "MISSING_SEED_MODULE_DEPENDENCY",
	MISSING_STARTER_KIND = "MISSING_STARTER_KIND",
	DUPLICATE_SEED_RECORD_ID = "DUPLICATE_SEED_RECORD_ID",
	MISSING_SEED_DEPENDENCY = "MISSING_SEED_DEPENDENCY",
	DUPLICATE_VARIATION_ID = "DUPLICATE_VARIATION_ID",
	MISSING_VARIATION_GROUP = "MISSING_VARIATION_GROUP",
	OVERLAPPING_VARIANTS = "OVERLAPPING_VARIANTS",
	INVALID_AMBIGUITY_POLICY = "INVALID_AMBIGUITY_POLICY",
	BOOTSTRAP_WRITE_ERROR = "BOOTSTRAP_WRITE_ERROR",
	DICTIONARY_EXPRESSION_WARNING = "DICTIONARY_EXPRESSION_WARNING",
	DECLARED_EMPTY_STORE = "DECLARED_EMPTY_STORE",
}

export type ClinicalInitDiagnosticCode =
	| ClinicalInitConfigDiagnosticCode
	| ClinicalInitSeedDiagnosticCode;

export type ClinicalInitPhase =
	| "config"
	| "storage"
	| "bootstrap"
	| "expansion"
	| "validation";

export type ClinicalInitDiagnosticSeverity = "info" | "warning" | "error";

export interface ClinicalInitDiagnostic {
	severity: ClinicalInitDiagnosticSeverity;
	code: ClinicalInitDiagnosticCode;
	message: string;
	phase?: ClinicalInitPhase;
	recordId?: string;
	path?: string;
}

export interface ClinicalInitReport {
	source: "external" | "packaged-starter" | "none";
	mode: ClinicalInitMode;
	readiness: "not-checked" | "bootstrap-ready" | "full-ready" | "degraded";
	completedPhases: ClinicalInitPhase[];
	diagnostics: ClinicalInitDiagnostic[];
}

export type ClinicalInitVariationAmbiguityPolicy =
	| "first"
	| "highest_priority"
	| "reject"
	| "collect";

export interface ClinicalInitVariation {
	variationId: string;
	variationGroup: string;
	semanticTarget: string;
	priority?: number;
	enabled?: boolean;
	locale?: string;
	personnelId?: string;
	requires?: string[];
	ambiguityPolicy?: ClinicalInitVariationAmbiguityPolicy;
	payload: Record<string, unknown>;
}
