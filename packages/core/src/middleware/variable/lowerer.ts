import type { ArgRef, OpName, PipelineStep } from "../../translation/types";
import type {
	LoweredVariableExpression,
	VariableBinaryOperator,
	VariableExpression,
	VariableLoweringContext,
} from "./ast";

export async function lowerVariableExpression(
	expression: VariableExpression,
	context: VariableLoweringContext = {},
): Promise<LoweredVariableExpression> {
	let counter = 0;
	const steps: PipelineStep[] = [];
	const diagnostics: LoweredVariableExpression["diagnostics"] = [];
	const prefix = context.variablePrefix ?? "__var_tmp";

	const lower = async (node: VariableExpression): Promise<ArgRef> => {
		switch (node.kind) {
			case "literal":
				return { $literal: node.value };
			case "concept": {
				if (!context.resolveConcept) {
					diagnostics.push({
						message: `concept resolver is not configured for '${node.query}'`,
						span: node.sourceSpan,
						code: "CONCEPT_RESOLVER_NOT_CONFIGURED",
					});
					return { $literal: node.query };
				}
				return { $literal: await context.resolveConcept(node.query) };
			}
			case "variable":
				return { $var: node.name };
			case "array": {
				const values: unknown[] = [];
				for (const element of node.elements) {
					const ref = await lower(element);
					if (typeof ref === "object" && ref !== null && "$literal" in ref)
						values.push(ref.$literal);
					else {
						diagnostics.push({
							message: "array elements must be literal values",
							span: element.sourceSpan,
							code: "DYNAMIC_ARRAY_ELEMENT",
						});
					}
				}
				return { $literal: values };
			}
			case "unary": {
				const operand = await lower(node.operand);
				return materialize(
					operand,
					node.operator === "negate" ? "neg" : "not",
					node.operator === "negate" ? "neg" : "not",
				);
			}
			case "binary": {
				const left = await lower(node.left);
				const right = await lower(node.right);
				return materializeBinary(left, right, node.operator);
			}
			case "property": {
				const object = await lower(node.object);
				return materialize(object, "get", "get", [{ $literal: node.property }]);
			}
			case "call": {
				const args: ArgRef[] = [];
				for (const arg of node.args) args.push(await lower(arg));
				return materializeArgs(args, node.name, node.name);
			}
		}
	};

	const resultRef = await lower(expression);
	return {
		steps,
		resultRef:
			typeof resultRef === "object" &&
			resultRef !== null &&
			("$var" in resultRef || "$literal" in resultRef)
				? resultRef
				: { $literal: resultRef },
		diagnostics,
	};

	async function materialize(
		ref: ArgRef,
		name: string,
		op?: OpName,
		extraArgs: ArgRef[] = [],
	): Promise<{ $var: string }> {
		return materializeArgs([ref, ...extraArgs], op ?? (name as OpName), name);
	}

	async function materializeArgs(
		args: ArgRef[],
		op: OpName,
		name: string,
	): Promise<{ $var: string }> {
		const returnVar = `${prefix}_${name}_${counter++}`;
		steps.push({ op, args, return_var: returnVar });
		return { $var: returnVar };
	}

	async function materializeBinary(
		left: ArgRef,
		right: ArgRef,
		operator: VariableBinaryOperator,
	): Promise<{ $var: string }> {
		return materializeArgs([left, right], operatorToOp(operator), operator);
	}
}

function operatorToOp(operator: VariableBinaryOperator): OpName {
	return operator as OpName;
}
