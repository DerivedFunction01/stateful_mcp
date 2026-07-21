// REFERENCE: docs/variable.md
import {
	MemoryVariableStore,
	VariableServiceStore,
} from "../src/middleware/variable/store";
import type { PipelineStep } from "../src/translation/types";

export async function runVariableTests() {
	console.log("\n🚀 Starting Variable Service tests...\n");

	const variableService = new VariableServiceStore(new MemoryVariableStore());
	const sessionId = "session_var_test_101";

	// Test Case 1: Set and Get Single Variable
	await variableService.setVariable(sessionId, "x", 10);
	const xVal = await variableService.getVariable<number>(sessionId, "x");
	if (xVal !== 10)
		throw new Error(`Set/Get variable failed. Expected 10, got ${xVal}`);
	console.log("✓ Set and Get single variable verified successfully.");

	// Test Case 2: Batch Set Variables (Object & Array Forms)
	await variableService.setVariables(sessionId, { y: 20, threshold: 0.85 });
	await variableService.setVariables(sessionId, [
		{ key: "a", value: 100 },
		{ key: "b", value: 200 },
	]);
	const multiGet = (await variableService.getVariable(sessionId, [
		"x",
		"a",
	])) as Record<string, number>;
	if (multiGet.x !== 10 || multiGet.a !== 100) {
		throw new Error(
			`getVariable array form failed. Expected {x: 10, a: 100}, got ${JSON.stringify(multiGet)}`,
		);
	}
	console.log(
		"✓ Batch set and get variables (Object & Array forms) verified successfully.",
	);

	// Test Case 3: 2-Tier Hierarchical Scoping (Block Instance Scope vs Session Scope)
	const blockId = "block_pediatric_dosing";
	await variableService.setVariable(sessionId, "x", 99, blockId);
	const globalX = await variableService.getVariable<number>(sessionId, "x");
	const blockX = await variableService.getVariable<number>(
		sessionId,
		"x",
		blockId,
	);

	if (globalX !== 10)
		throw new Error(
			`Global scope variable leakage. Expected 10, got ${globalX}`,
		);
	if (blockX !== 99)
		throw new Error(
			`Block instance scope override failed. Expected 99, got ${blockX}`,
		);

	const mergedBlockScope = await variableService.getScope(sessionId, blockId);
	if (mergedBlockScope.x !== 99 || mergedBlockScope.y !== 20) {
		throw new Error(
			`Merged block scope resolution failed: ${JSON.stringify(mergedBlockScope)}`,
		);
	}
	console.log(
		"✓ 2-Tier hierarchical scoping (session vs block instance) verified successfully.",
	);

	// Test Case 4: AST Pipeline Evaluation with Active Scope
	const pipeline: PipelineStep[] = [
		{ op: "mul", args: [{ $var: "x" }, { $var: "y" }], return_var: "product" },
		{ op: "add", args: [{ $var: "product" }, 5], return_var: "total" },
	];

	const evalResultGlobal = await variableService.evaluatePipeline(
		sessionId,
		pipeline,
	);
	if (evalResultGlobal !== 205) {
		// (10 * 20) + 5 = 205
		throw new Error(
			`evaluatePipeline global scope failed. Expected 205, got ${evalResultGlobal}`,
		);
	}

	const evalResultBlock = await variableService.evaluatePipeline(
		sessionId,
		pipeline,
		blockId,
	);
	if (evalResultBlock !== 1985) {
		// (99 * 20) + 5 = 1985
		throw new Error(
			`evaluatePipeline block scope failed. Expected 1985, got ${evalResultBlock}`,
		);
	}
	console.log(
		"✓ AST pipeline evaluation against active variable scopes verified successfully.",
	);

	// Test Case 5: Reactive Subscription & Events
	let eventCaptured = false;
	const unsubscribe = variableService.subscribe(sessionId, (event) => {
		if (event.key === "z" && event.value === 100) {
			eventCaptured = true;
		}
	});

	await variableService.setVariable(sessionId, "z", 100);
	unsubscribe();
	await variableService.setVariable(sessionId, "z", 200);

	if (!eventCaptured)
		throw new Error(
			"Reactive variable mutation listener failed to capture event.",
		);
	console.log(
		"✓ Reactive pub/sub variable mutation events verified successfully.",
	);

	// Test Case 6: Delete & Clear Scope (Single & Array Forms)
	await variableService.deleteVariable(sessionId, ["z", "a", "b"]);
	const zVal = await variableService.getVariable(sessionId, "z");
	const aVal = await variableService.getVariable(sessionId, "a");
	if (zVal !== undefined || aVal !== undefined)
		throw new Error("deleteVariable array form failed.");

	// Test Case 7: Clinical IDE Variable Condition Testing (ex. set x leq 20, then evaluate "x", 25 vs 15)
	await variableService.setVariables(sessionId, [
		{ key: "age_rule", condition: { op: "leq", targetValue: 20 } },
	]);

	const testFail = await variableService.testVariableCondition(
		sessionId,
		"age_rule",
		25,
	);
	if (testFail.passed !== false) {
		throw new Error(
			`testVariableCondition failed: expected 25 leq 20 to be false, got ${testFail.passed}`,
		);
	}

	const testPass = await variableService.testVariableCondition(
		sessionId,
		"age_rule",
		15,
	);
	if (testPass.passed !== true) {
		throw new Error(
			`testVariableCondition failed: expected 15 leq 20 to be true, got ${testPass.passed}`,
		);
	}
	console.log(
		"✓ Clinical IDE variable condition testing (set x leq 20, test 25 vs 15) verified successfully.",
	);
}
