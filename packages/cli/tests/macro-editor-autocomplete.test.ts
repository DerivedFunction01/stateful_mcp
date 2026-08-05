import { describe, expect, test } from "bun:test";
import type { AutocompleteSuggestion } from "../src/lib/editor/autocomplete";
import { reduceCompletion } from "../src/lib/editor/completion-state";

const suggestions: AutocompleteSuggestion[] = [
	{
		label: "vitals",
		value: "vitals",
		type: "macro",
		verb: "vitals",
		completionText: "vitals",
		group: "macro",
		source: "macro",
		hasArgs: true,
		kind: "verb",
	},
	{
		label: "physical_exam",
		value: "physical_exam",
		type: "macro",
		verb: "physical_exam",
		completionText: "physical_exam",
		group: "macro",
		source: "macro",
		hasArgs: true,
		kind: "verb",
	},
];

const mockSyntaxProfile = {
	profileId: "mock",
	directCommandToken: ":",
	macroStartToken: "^",
	directCommandMappings: {},
	editorCommandMappings: {},
	variableCommandToken: "$",
	variableCommandName: "let",
	variableAssignmentDelimiter: "=",
	variableNamePattern: "[a-zA-Z_][a-zA-Z0-9_]*",
} as any;

describe("macro autocomplete state transitions", () => {
	test("Tab cycling cycles candidates without mutating draft in reduceCompletion", () => {
		const provider = () => suggestions;
		// 1. Initial tab from idle state
		let state = reduceCompletion(
			{ status: "idle" },
			{ kind: "tab", shift: false },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(state.completionState.status).toBe("cycling");
		if (state.completionState.status === "cycling") {
			expect(state.completionState.highlightIndex).toBe(0);
			expect(state.completionState.candidates).toHaveLength(2);
		}

		// 2. Next tab cycles index
		state = reduceCompletion(
			state.completionState,
			{ kind: "tab", shift: false },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(state.completionState.status).toBe("cycling");
		if (state.completionState.status === "cycling") {
			expect(state.completionState.highlightIndex).toBe(1);
		}

		// 3. Shift+Tab cycles backward
		state = reduceCompletion(
			state.completionState,
			{ kind: "tab", shift: true },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(state.completionState.status).toBe("cycling");
		if (state.completionState.status === "cycling") {
			expect(state.completionState.highlightIndex).toBe(0);
		}
	});

	test("Enter accepts the highlighted candidate and returns executeLine", () => {
		const provider = () => suggestions;
		const transition = reduceCompletion(
			{ status: "idle" },
			{ kind: "tab", shift: false },
			"^vi",
			provider,
			mockSyntaxProfile,
		);

		// Enter on cycling state
		const enterTransition = reduceCompletion(
			transition.completionState,
			{ kind: "enter" },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(enterTransition.completionState.status).toBe("idle");
		expect(enterTransition.executeLine).toBe("^vitals");
	});
});
