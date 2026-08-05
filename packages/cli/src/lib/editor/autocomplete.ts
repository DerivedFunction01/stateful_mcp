export interface AutocompleteSuggestion {
	label: string;
	value: string;
	type:
		| "macro"
		| "argument"
		| "concept"
		| "enum"
		| "measurement"
		| "duration"
		| "text"
		| "boolean"
		| "date"
		| "number"
		| "command"
		| "value"
		| "field"
		| "verb"
		| "arg";
	detail?: string;
	verb: string;
	completionText: string;
	group: string;
	source: "editor" | "clinical" | "macro" | "context";
	sourceKind?: "macro" | "dictionary" | "custom-expression" | "template";
	hasArgs: boolean;
	kind: "verb" | "argument" | "value" | "field" | "arg";
	argNames?: string[];
	argsRequired?: boolean[];
	argHints?: string[][];
	argIndex?: number;
	descriptionKey?: string;
	macroEvidence?: {
		score?: number;
		observationCount?: number;
		scope?: "personal" | "global";
		observationMode?: "live" | "preview" | "execution";
		reason?: "transition" | "numericFit" | "parseConfidence" | "static";
		featureKeys?: readonly string[];
	};
	provenance?: "template" | "expression" | "numeric" | "argument-name";
	targetArgument?: string;
	expressionId?: string;
	conceptId?: string;
	lookupTerm?: string;
}
