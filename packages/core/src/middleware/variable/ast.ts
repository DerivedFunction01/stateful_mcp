import type { OpName, PipelineStep } from "../../translation/types";

export interface VariableSourceSpan {
	start: number;
	end: number;
	line?: number;
	column?: number;
}

export type VariableLiteral = string | number | boolean | null;

export type VariableExpression =
	| { kind: "literal"; value: VariableLiteral; sourceSpan?: VariableSourceSpan }
	| { kind: "concept"; query: string; sourceSpan?: VariableSourceSpan }
	| { kind: "variable"; name: string; sourceSpan?: VariableSourceSpan }
	| {
			kind: "array";
			elements: VariableExpression[];
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "unary";
			operator: "negate" | "not";
			operand: VariableExpression;
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "binary";
			operator: VariableBinaryOperator;
			left: VariableExpression;
			right: VariableExpression;
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "call";
			name: VariableFunctionName;
			args: VariableExpression[];
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "property";
			object: VariableExpression;
			property: string;
			sourceSpan?: VariableSourceSpan;
	  };

export type VariableBinaryOperator =
	| "add"
	| "sub"
	| "mul"
	| "div"
	| "mod"
	| "exp"
	| "lt"
	| "leq"
	| "eq"
	| "neq"
	| "geq"
	| "gt"
	| "and"
	| "or"
	| "in_set"
	| "not_in_set";

export type VariableFunctionName =
	| "year"
	| "month"
	| "day"
	| "quarter"
	| "date_diff"
	| "get"
	| "json_parse"
	| "to_string"
	| "to_number"
	| "round"
	| "ceil"
	| "floor"
	| "starts_with"
	| "ends_with"
	| "str_contains"
	| "substring"
	| "trim"
	| "lower"
	| "upper"
	| "concat";

export interface VariableScopeRef {
	kind: "session" | "workspace" | "branch" | "cell" | "block";
	id: string;
	parentScopeId?: string;
}

/** Encode a scope chain into a blockInstanceId string that supports ancestor resolution.
 *  The format chains ids with `:` separator: e.g. `"cell_3:branch_2:work_1"`
 *  where the first segment is the most specific scope and each subsequent segment
 *  is the parent. A scope chain of length 1 behaves identically to current system. */
export function formatBlockId(scope: VariableScopeRef | undefined): string {
	if (!scope) return "";
	if (
		scope.kind === "session" ||
		(scope.parentScopeId === undefined && scope.kind === "workspace")
	) {
		return scope.id;
	}
	const parts: string[] = [scope.id];
	let parentId: string | undefined = scope.parentScopeId;
	while (parentId) {
		parts.push(parentId);
		parentId = undefined;
	}
	return parts.join(":");
}

/** Walk up ancestor blockIds derived from a chain-encoded blockInstanceId.
 *  Returns all possible blockIds from most specific to least specific.
 *  A single-segment blockId (no colons, e.g. "person") returns only itself. */
export function ancestorBlockIds(blockInstanceId: string): string[] {
	if (!blockInstanceId) return [];
	return blockInstanceId.split(":").reduce<string[]>((acc, _, i, parts) => {
		acc.push(parts.slice(i).join(":"));
		return acc;
	}, []);
}

export interface VariableTarget {
	name: string;
	scope?: VariableScopeRef;
}

export type VariableStatement =
	| {
			kind: "set";
			target: VariableTarget;
			value: VariableExpression;
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "update";
			target: VariableTarget;
			value: VariableExpression;
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "eval";
			expression: VariableExpression;
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "assert";
			expression: VariableExpression;
			sourceSpan?: VariableSourceSpan;
	  }
	| {
			kind: "remove";
			target: VariableTarget;
			sourceSpan?: VariableSourceSpan;
	  };

export interface VariableDiagnostic {
	message: string;
	span?: VariableSourceSpan;
	code?: string;
}

export interface LoweredVariableExpression {
	steps: PipelineStep[];
	resultRef: { $var: string } | { $literal: unknown };
	diagnostics: VariableDiagnostic[];
}

export type VariableConceptResolver = (query: string) => Promise<unknown>;

export interface VariableLoweringContext {
	resolveConcept?: VariableConceptResolver;
	variablePrefix?: string;
}

export function isVariableExpression(
	value: unknown,
): value is VariableExpression {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		typeof (value as { kind?: unknown }).kind === "string"
	);
}

export function isPipelineOperator(value: string): value is OpName {
	return [
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
	].includes(value as OpName);
}
