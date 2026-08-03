export type ArgRef =
	| { $init: string }
	| { $var: string }
	| { $literal: unknown }
	| { $path: string[] }
	| { $fn: "now" | "utc_time" }
	| number
	| string
	| boolean;
export const OPS = [
	"neg",
	"not",
	"add",
	"sub",
	"mul",
	"div",
	"mod",
	"exp",
	"lt",
	"leq",
	"eq",
	"neq",
	"geq",
	"gt",
	"in_set",
	"not_in_set",
	"and",
	"or",
	"year",
	"month",
	"day",
	"quarter",
	"date_diff",
	"get",
	"json_parse",
	"to_string",
	"to_number",
	"round",
	"ceil",
	"floor",
	"starts_with",
	"ends_with",
	"str_contains",
	"substring",
	"trim",
	"lower",
	"upper",
	"concat",
] as const;

export type OpName = (typeof OPS)[number];

export interface PipelineStep {
	op: OpName;
	args: ArgRef[];
	return_var?: string;
	on_missing?: "null" | "error" | { literal: unknown };
}

export interface PropertyTranslation {
	internal: string; // internal column/path name
	internal_type?: "scalar" | "array"; // required for array-containment ops
	transform?: { pipeline: PipelineStep[] };
	allowed_operators?: string[]; // narrows (never widens) the table-level operator list
}

export interface TableTranslation {
	properties: Record<string, PropertyTranslation>;
	constants?: Record<string, unknown> | string; // inline Record or ResourceLocator path
	supported_op_families?: string[];
	supported_operations?: string[];
	expressible_combinations?: string[][];
}
