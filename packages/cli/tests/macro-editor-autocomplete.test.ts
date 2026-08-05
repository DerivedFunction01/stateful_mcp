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
	test("Tab accepts the highlighted candidate for insertion", () => {
		const provider = () => suggestions;
		// Down opens the menu at the first candidate.
		let state = reduceCompletion(
			{ status: "idle" },
			{ kind: "down" },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(state.completionState.status).toBe("cycling");
		if (state.completionState.status === "cycling") {
			expect(state.completionState.highlightIndex).toBe(0);
			expect(state.completionState.candidates).toHaveLength(2);
		}

		// Down moves the highlight to the second candidate.
		state = reduceCompletion(
			state.completionState,
			{ kind: "down" },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(state.completionState.status).toBe("cycling");
		if (state.completionState.status === "cycling") {
			expect(state.completionState.highlightIndex).toBe(1);
		}

		// Tab accepts the highlighted second candidate, rather than advancing.
		state = reduceCompletion(
			state.completionState,
			{ kind: "tab", shift: false },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(state.completionState.status).toBe("idle");
		expect(state.committedLine).toBe("^physical_exam ");

		// Shift+Tab from idle selects the last candidate when opening directly.
		state = reduceCompletion(
			{ status: "idle" },
			{ kind: "tab", shift: true },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		expect(state.completionState.status).toBe("idle");
		expect(state.committedLine).toBe("^physical_exam ");
	});

	test("Enter accepts the highlighted candidate and returns executeLine", () => {
		const provider = () => suggestions;
		const transition = reduceCompletion(
			{ status: "idle" },
			{ kind: "down" },
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

	test("Up and Down open an idle suggestion list with edge highlights", () => {
		const provider = () => suggestions;
		const down = reduceCompletion(
			{ status: "idle" },
			{ kind: "down" },
			"^vi",
			provider,
			mockSyntaxProfile,
		);
		const up = reduceCompletion(
			{ status: "idle" },
			{ kind: "up" },
			"^vi",
			provider,
			mockSyntaxProfile,
		);

		expect(down.completionState).toMatchObject({
			status: "cycling",
			highlightIndex: 0,
		});
		expect(up.completionState).toMatchObject({
			status: "cycling",
			highlightIndex: suggestions.length - 1,
		});
	});
});
