import { describe, expect, test } from "bun:test";
import {
	ancestorBlockIds,
	formatBlockId,
	lowerVariableExpression,
	MemoryVariableStore,
	VariableExpressionParser,
	VariableServiceStore,
} from "../src";

describe("variable expression AST", () => {
	test("parses precedence and lowers to the existing pipeline", async () => {
		const expression = new VariableExpressionParser("weight + 2 * 3").parse();
		const lowered = await lowerVariableExpression(expression);

		expect(expression.kind).toBe("binary");
		expect(lowered.steps.map((step) => step.op)).toEqual(["mul", "add"]);
	});

	test("supports concept literals through a resolver", async () => {
		const expression = new VariableExpressionParser('@"pulmonary embolism"', {
			expressionToken: "#",
			conceptToken: "@",
		}).parse();
		const lowered = await lowerVariableExpression(expression, {
			resolveConcept: async (query) => ({
				conceptId: "PE",
				display: query,
			}),
		});

		expect(lowered.resultRef).toEqual({
			$literal: { conceptId: "PE", display: "pulmonary embolism" },
		});
	});

	test("routes configured tokens to their distinct lookup resolvers", async () => {
		const tokens = { expressionToken: "#", conceptToken: "@" };
		const expression = new VariableExpressionParser(
			'#"custom phrase"',
			tokens,
		).parse();
		const concept = new VariableExpressionParser(
			'@"concept phrase"',
			tokens,
		).parse();

		expect(expression.kind).toBe("expression");
		expect(concept.kind).toBe("concept");
		const resolved = await Promise.all([
			lowerVariableExpression(expression, {
				resolveExpression: async (query) => `expression:${query}`,
			}),
			lowerVariableExpression(concept, {
				resolveConcept: async (query) => `concept:${query}`,
			}),
		]);
		expect(resolved[0]?.resultRef).toEqual({
			$literal: "expression:custom phrase",
		});
		expect(resolved[1]?.resultRef).toEqual({
			$literal: "concept:concept phrase",
		});
	});

	test("token roles follow swapped configured literals", () => {
		const expression = new VariableExpressionParser("@term", {
			expressionToken: "@",
			conceptToken: "#",
		}).parse();
		const concept = new VariableExpressionParser("#term", {
			expressionToken: "@",
			conceptToken: "#",
		}).parse();
		expect(expression.kind).toBe("expression");
		expect(concept.kind).toBe("concept");
	});
});

describe("VariableService expression operations", () => {
	test("supports set, update, eval, assert, and concept equality", async () => {
		const service = new VariableServiceStore(new MemoryVariableStore());
		await service.setVariable("session_1", "weight", 80);
		await service.updateVariable("session_1", "weight", {
			kind: "binary",
			operator: "add",
			left: { kind: "variable", name: "weight" },
			right: { kind: "literal", value: 1 },
		});

		expect(await service.getVariable("session_1", "weight")).toBe(81);
		expect(
			await service.evaluateExpression("session_1", {
				kind: "binary",
				operator: "mul",
				left: { kind: "variable", name: "weight" },
				right: { kind: "literal", value: 2 },
			}),
		).toBe(162);
		await service.assertExpression("session_1", {
			kind: "binary",
			operator: "geq",
			left: { kind: "variable", name: "weight" },
			right: { kind: "literal", value: 80 },
		});

		const concept = { conceptId: "PE", display: "pulmonary embolism" };
		await service.setVariable("session_1", "diagnosis", concept);
		await service.assertExpression(
			"session_1",
			{
				kind: "binary",
				operator: "eq",
				left: { kind: "variable", name: "diagnosis" },
				right: { kind: "concept", query: "pulmonary embolism" },
			},
			undefined,
			{ resolveConcept: async () => ({ ...concept }) },
		);
	});

	test("update rejects an absent variable", async () => {
		const service = new VariableServiceStore(new MemoryVariableStore());
		expect(
			service.updateVariable("session_1", "missing", {
				kind: "literal",
				value: 1,
			}),
		).rejects.toThrow("does not exist");
	});
});

describe("scope hierarchy with chain-encoded blockIds", () => {
	test("formatBlockId and ancestorBlockIds build and traverse scope chains", () => {
		expect(formatBlockId({ kind: "workspace", id: "work_1" })).toBe("work_1");
		expect(
			formatBlockId({
				kind: "branch",
				id: "branch_2",
				parentScopeId: "work_1",
			}),
		).toBe("branch_2:work_1");
		expect(
			formatBlockId({
				kind: "cell",
				id: "cell_3",
				parentScopeId: "branch_2",
			}),
		).toBe("cell_3:branch_2");

		expect(ancestorBlockIds("work_1")).toEqual(["work_1"]);
		expect(ancestorBlockIds("branch_2:work_1")).toEqual([
			"branch_2:work_1",
			"work_1",
		]);
		expect(ancestorBlockIds("cell_3:branch_2:work_1")).toEqual([
			"cell_3:branch_2:work_1",
			"branch_2:work_1",
			"work_1",
		]);
	});

	test("a variable set at workspace scope is visible from a child branch scope", async () => {
		const service = new VariableServiceStore(new MemoryVariableStore());

		await service.setVariable("session_1", "age", 40, "work_1");

		const branchBlockId = formatBlockId({
			kind: "branch",
			id: "branch_2",
			parentScopeId: "work_1",
		});
		const value = await service.getVariable("session_1", "age", branchBlockId);
		expect(value).toBe(40);
	});

	test("a branch-scoped variable shadows the workspace-scoped value", async () => {
		const service = new VariableServiceStore(new MemoryVariableStore());

		await service.setVariable("session_1", "age", 40, "work_1");
		await service.setVariable("session_1", "age", 50, "branch_2:work_1");

		// Read from branch scope → sees branch value (shadowing)
		const branchValue = await service.getVariable(
			"session_1",
			"age",
			"branch_2:work_1",
		);
		expect(branchValue).toBe(50);

		// Read from workspace scope → still sees workspace value
		const wsValue = await service.getVariable("session_1", "age", "work_1");
		expect(wsValue).toBe(40);
	});

	test("getScope merges from global through each ancestor level", async () => {
		const service = new VariableServiceStore(new MemoryVariableStore());

		await service.setVariable("session_1", "global_key", "g");
		await service.setVariable("session_1", "ws_key", "w", "work_1");
		await service.setVariable(
			"session_1",
			"branch_key",
			"b",
			"branch_2:work_1",
		);

		const scope = await service.getScope("session_1", "branch_2:work_1");
		expect(scope).toMatchObject({
			global_key: "g",
			ws_key: "w",
			branch_key: "b",
		});
	});
});
