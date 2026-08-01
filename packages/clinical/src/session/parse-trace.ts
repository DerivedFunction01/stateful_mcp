export enum TraceLevel {
	None = "none",
	Summary = "summary",
	Debug = "debug",
}

export enum ParseDiagnosticSeverity {
	Info = "info",
	Warning = "warning",
	Error = "error",
}

export enum ParseFieldSource {
	Capture = "capture",
	Attribute = "attribute",
	Computed = "computed",
	ConceptDefault = "concept_default",
	SchemaDefault = "schema_default",
	Unmatched = "unmatched",
}

export enum ParseRoutingReason {
	Explicit = "explicit",
	Tag = "tag",
	Concept = "concept",
	Inferred = "inferred",
	Unresolved = "unresolved",
}

export enum ParseInputSpanKind {
	Tag = "tag",
	Content = "content",
	Capture = "capture",
	Quantity = "quantity",
	Anatomy = "anatomy",
	Concept = "concept",
}

export enum ParseRuleKind {
	Attribute = "attribute",
	Evaluator = "evaluator",
	Field = "field",
	ConceptField = "concept_field",
	Default = "default",
	Anchor = "anchor",
}

export interface ParseInputSpan {
	start: number;
	end: number;
	text?: string;
	kind: ParseInputSpanKind;
}

export interface ParseRuleApplication {
	ruleId: string;
	ruleKind: ParseRuleKind;
	matched: boolean;
	spans?: Array<{ start: number; end: number }>;
	captures?: Record<string, string | undefined>;
	priority?: number;
}

export interface ParseFieldDerivation {
	fieldPath: string;
	value: unknown;
	source: ParseFieldSource;
	ruleIds: string[];
	inputSpanIds?: string[];
}

export interface ParseDiagnostic {
	code: string;
	severity: ParseDiagnosticSeverity;
	fieldPath?: string;
	ruleId?: string;
	messageKey: string;
	details?: Record<string, unknown>;
}

export interface ParseTrace {
	traceId: string;
	parserVersion?: string;
	profileId?: string;
	routing: {
		inputTag?: string;
		targetSchema?: string;
		resolvedSection?: string;
		reason: ParseRoutingReason;
	};
	inputSpans: ParseInputSpan[];
	ruleApplications: ParseRuleApplication[];
	fieldDerivations: ParseFieldDerivation[];
	diagnostics: ParseDiagnostic[];
}