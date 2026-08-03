import type { OpName, PipelineStep } from "@stateful-mcp/core";

export type PipelineVariable = string;
export type PipelineValue = string | number | boolean | null;

export interface PipelineContext {
	variables: Map<PipelineVariable, PipelineValue>;
	inputs: Record<string, PipelineValue>;
}

export interface PipelineDiagnostic {
	code:
		| "unsupported_op"
		| "max_depth_exceeded"
		| "undefined_variable"
		| "invalid_argument"
		| "missing_return_var"
		| "duplicate_return_var"
		| "pipeline_too_deep";
	step: number;
	message: string;
}

export interface PipelineResult {
	value?: PipelineValue;
	diagnostics: PipelineDiagnostic[];
}

const MAX_PIPELINE_DEPTH = 20;
const ALLOWED_OPS = new Set<OpName>([
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
]);

export function validatePipeline(steps: PipelineStep[]): PipelineDiagnostic[] {
	const diagnostics: PipelineDiagnostic[] = [];
	if (steps.length > MAX_PIPELINE_DEPTH) {
		diagnostics.push({
			code: "pipeline_too_deep",
			step: steps.length,
			message: `Pipeline exceeds maximum depth of ${MAX_PIPELINE_DEPTH}`,
		});
	}
	const definedVars = new Set<PipelineVariable>();
	for (const [index, step] of steps.entries()) {
		if (!ALLOWED_OPS.has(step.op)) {
			diagnostics.push({
				code: "unsupported_op",
				step: index,
				message: `Unsupported operation '${String(step.op)}'`,
			});
		}
		for (const arg of step.args) {
			if (arg && typeof arg === "object" && "$var" in arg) {
				const varName = String((arg as { $var: string }).$var);
				if (!definedVars.has(varName)) {
					diagnostics.push({
						code: "undefined_variable",
						step: index,
						message: `Variable '${varName}' must refer to an earlier return_var`,
					});
				}
			}
		}
		if (step.return_var) {
			if (definedVars.has(step.return_var)) {
				diagnostics.push({
					code: "duplicate_return_var",
					step: index,
					message: `Variable '${step.return_var}' is already defined`,
				});
			}
			definedVars.add(step.return_var);
		}
	}
	return diagnostics;
}

export function evaluatePipeline(
	steps: PipelineStep[],
	context: PipelineContext,
): PipelineResult {
	const diagnostics: PipelineDiagnostic[] = [];
	const variables = new Map(context.variables);
	for (const [index, step] of steps.entries()) {
		if (index >= MAX_PIPELINE_DEPTH) {
			diagnostics.push({
				code: "max_depth_exceeded",
				step: index,
				message: `Pipeline execution exceeded maximum depth at step ${index}`,
			});
			break;
		}
		const resolvedArgs = step.args.map((arg) => {
			if (arg && typeof arg === "object" && "$var" in arg) {
				const varName = String((arg as { $var: string }).$var);
				return variables.get(varName) ?? null;
			}
			return arg;
		});
		const result = executeStep(step.op, resolvedArgs, index);
		if (result.diagnostics.length) {
			diagnostics.push(...result.diagnostics);
		}
		if (step.return_var && result.value !== undefined) {
			variables.set(step.return_var, result.value);
		}
	}
	const lastReturnVar = steps[steps.length - 1]?.return_var;
	return {
		value: lastReturnVar ? variables.get(lastReturnVar) : undefined,
		diagnostics,
	};
}

function executeStep(
	op: OpName,
	args: unknown[],
	stepIndex: number,
): PipelineResult {
	const diagnostics: PipelineDiagnostic[] = [];
	try {
		switch (op) {
			case "eq":
				return { value: args[0] === args[1], diagnostics };
			case "neq":
				return { value: args[0] !== args[1], diagnostics };
			case "lt":
				return { value: toNumber(args[0]) < toNumber(args[1]), diagnostics };
			case "leq":
				return { value: toNumber(args[0]) <= toNumber(args[1]), diagnostics };
			case "gt":
				return { value: toNumber(args[0]) > toNumber(args[1]), diagnostics };
			case "geq":
				return { value: toNumber(args[0]) >= toNumber(args[1]), diagnostics };
			case "and":
				return { value: Boolean(args[0]) && Boolean(args[1]), diagnostics };
			case "or":
				return { value: Boolean(args[0]) || Boolean(args[1]), diagnostics };
			case "not":
				return { value: !Boolean(args[0]), diagnostics };
			case "neg":
				return { value: -(toNumber(args[0])), diagnostics };
			case "add":
				return { value: toNumber(args[0]) + toNumber(args[1]), diagnostics };
			case "sub":
				return { value: toNumber(args[0]) - toNumber(args[1]), diagnostics };
			case "mul":
				return { value: toNumber(args[0]) * toNumber(args[1]), diagnostics };
			case "div":
				return { value: toNumber(args[0]) / toNumber(args[1]), diagnostics };
			case "mod":
				return { value: toNumber(args[0]) % toNumber(args[1]), diagnostics };
			case "exp":
				return { value: Math.pow(toNumber(args[0]), toNumber(args[1])), diagnostics };
			case "in_set":
				return { value: Array.isArray(args[1]) && args[1].includes(args[0]), diagnostics };
			case "not_in_set":
				return { value: !Array.isArray(args[1]) || !args[1].includes(args[0]), diagnostics };
			case "to_number":
				return { value: Number(args[0]), diagnostics };
			case "to_string":
				return { value: String(args[0]), diagnostics };
			case "round":
				return { value: Math.round(toNumber(args[0])), diagnostics };
			case "ceil":
				return { value: Math.ceil(toNumber(args[0])), diagnostics };
			case "floor":
				return { value: Math.floor(toNumber(args[0])), diagnostics };
			case "lower":
				return { value: String(args[0]).toLowerCase(), diagnostics };
			case "upper":
				return { value: String(args[0]).toUpperCase(), diagnostics };
			case "trim":
				return { value: String(args[0]).trim(), diagnostics };
			case "starts_with":
				return { value: String(args[0]).startsWith(String(args[1])), diagnostics };
			case "ends_with":
				return { value: String(args[0]).endsWith(String(args[1])), diagnostics };
			case "str_contains":
				return { value: String(args[0]).includes(String(args[1])), diagnostics };
			case "concat":
				return { value: args.map(String).join(""), diagnostics };
			case "get":
				return { value: args[0] != null ? (args[0] as Record<string, PipelineValue>)[String(args[1])] : null, diagnostics };
			case "json_parse":
				return { value: JSON.parse(String(args[0])) as PipelineValue, diagnostics };
			case "year":
				return { value: new Date(String(args[0])).getFullYear(), diagnostics };
			case "month":
				return { value: new Date(String(args[0])).getMonth() + 1, diagnostics };
			case "day":
				return { value: new Date(String(args[0])).getDate(), diagnostics };
			case "quarter":
				return { value: Math.floor((new Date(String(args[0])).getMonth() + 3) / 3), diagnostics };
			case "date_diff":
				return { value: new Date(String(args[1])).getTime() - new Date(String(args[0])).getTime(), diagnostics };
			default:
				diagnostics.push({
					code: "unsupported_op",
					step: stepIndex,
					message: `Unsupported operation '${String(op)}'`,
				});
				return { diagnostics };
		}
	} catch {
		diagnostics.push({
			code: "invalid_argument",
			step: stepIndex,
			message: `Operation '${String(op)}' failed with provided arguments`,
		});
		return { diagnostics };
	}
}

function toNumber(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const num = Number(value);
		if (!Number.isFinite(num)) throw new Error(`Cannot convert '${value}' to number`);
		return num;
	}
	if (typeof value === "boolean") return value ? 1 : 0;
	throw new Error(`Cannot convert ${typeof value} to number`);
}