import { describe, expect, test } from "bun:test";
import type { SyntaxProfile } from "../src";
import { VITALS_MACRO } from "../src/macros/default-macros";
import { MacroAuthoringSession } from "../src/macros/macro-authoring-session";

const profile: SyntaxProfile = {
	profileId: "test",
	macroStartToken: "^",
	directCommandToken: "/",
	expressionToken: "#",
	conceptToken: "@",
};

describe("MacroAuthoringSession", () => {
	test("initializes with idle mode or macro mode based on draft", () => {
		expect(
			new MacroAuthoringSession({ profile, initialText: "hello" }).getSnapshot()
				.mode,
		).toBe("idle");
		expect(
			new MacroAuthoringSession({
				profile,
				initialText: "^vitals",
			}).getSnapshot().mode,
		).toBe("macro");
	});

	test("updates text and recomputes mode and cursor", () => {
		const session = new MacroAuthoringSession({ profile });
		session.dispatch({ type: "set_text", text: "^vitals 120/80" });
		const snap = session.getSnapshot();
		expect(snap.mode).toBe("macro");
		expect(snap.rawText).toBe("^vitals 120/80");
		expect(snap.cursorOffset).toBe(14);
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
