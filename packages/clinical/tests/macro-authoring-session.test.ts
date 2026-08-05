import { describe, expect, test } from "bun:test";
import type { AutocompleteSuggestion, SyntaxProfile } from "../src";
import { VITALS_MACRO } from "../src/macros/default-macros";
import { MacroAuthoringSession } from "../src/macros/macro-authoring-session";

const profile: SyntaxProfile = {
	profileId: "test",
	macroStartToken: "^",
	directCommandToken: "/",
	expressionToken: "#",
	conceptToken: "@",
};

const mockSuggestions: AutocompleteSuggestion[] = [
	{ label: "120/80 mmHg", value: "120/80", type: "measurement" },
	{ label: "130/85 mmHg", value: "130/85", type: "measurement" },
];

describe("MacroAuthoringSession", () => {
	test("initializes with idle mode or macro mode based on draft", () => {
		const session1 = new MacroAuthoringSession({
			profile,
			initialText: "hello",
		});
		expect(session1.getSnapshot().mode).toBe("idle");

		const session2 = new MacroAuthoringSession({
			profile,
			initialText: "^vitals",
		});
		expect(session2.getSnapshot().mode).toBe("macro");
	});

	test("updates text and recomputes mode and cursor", () => {
		const session = new MacroAuthoringSession({ profile });
		session.dispatch({ type: "set_text", text: "^vitals 120/80" });
		const snap = session.getSnapshot();
		expect(snap.mode).toBe("macro");
		expect(snap.rawText).toBe("^vitals 120/80");
		expect(snap.cursorOffset).toBe(14);
	});

	test("handles completion cycling with Down and Tab committing exact candidate", () => {
		const session = new MacroAuthoringSession({
			profile,
			initialText: "^vitals ",
		});
		const reqId = session.getNextRequestId();
		session.dispatch({
			type: "suggestions_resolved",
			requestId: reqId,
			candidates: mockSuggestions,
		});

		let snap = session.getSnapshot();
		expect(snap.completion.status).toBe("idle");
		expect(snap.completion.candidates).toHaveLength(2);

		// Press Down to open menu at index 0
		session.dispatch({ type: "arrow_down" });
		snap = session.getSnapshot();
		expect(snap.completion.status).toBe("cycling");
		if (snap.completion.status === "cycling") {
			expect(snap.completion.highlightIndex).toBe(0);
			expect(
				snap.completion.candidates[snap.completion.highlightIndex]!.value,
			).toBe("120/80");
		}

		// Press Tab to accept the currently highlighted item at index 0
		session.dispatch({ type: "tab" });
		snap = session.getSnapshot();
		expect(snap.rawText).toBe("^vitals 120/80 ");
		expect(snap.completion.status).toBe("idle");

		const secondSession = new MacroAuthoringSession({
			profile,
			initialText: "^vitals ",
		});
		const secondRequest = secondSession.getNextRequestId();
		secondSession.dispatch({
			type: "suggestions_resolved",
			requestId: secondRequest,
			candidates: mockSuggestions,
		});
		secondSession.dispatch({ type: "arrow_down" });
		secondSession.dispatch({ type: "arrow_down" });
		secondSession.dispatch({ type: "tab" });
		expect(secondSession.getSnapshot().rawText).toBe("^vitals 130/85 ");
	});

	test("ignores out-of-order async suggestion responses", () => {
		const session = new MacroAuthoringSession({
			profile,
			initialText: "^vitals ",
		});
		const req1 = session.getNextRequestId();
		const req2 = session.getNextRequestId();

		session.dispatch({
			type: "suggestions_resolved",
			requestId: req2,
			candidates: [mockSuggestions[1]!],
		});

		// Stale req1 response should be ignored
		session.dispatch({
			type: "suggestions_resolved",
			requestId: req1,
			candidates: [mockSuggestions[0]!],
		});

		const snap = session.getSnapshot();
		expect(snap.completion.candidates).toHaveLength(1);
		expect(snap.completion.candidates[0]!.value).toBe("130/85");
	});

	test("recomputes slots when definition is provided", () => {
		const session = new MacroAuthoringSession({
			profile,
			initialText: "^vitals heart_rate=72 blood_pressure=120/80",
		});
		session.dispatch({
			type: "inspection_resolved",
			definition: VITALS_MACRO,
		});

		const snap = session.getSnapshot();
		expect(snap.slots).toHaveLength(2);
		expect(snap.slots[0]?.argumentId).toBe("heart_rate");
		expect(snap.slots[1]?.argumentId).toBe("blood_pressure");
	});
});
