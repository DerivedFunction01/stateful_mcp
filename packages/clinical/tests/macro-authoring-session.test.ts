import { describe, expect, test } from "bun:test";
import type { SyntaxProfile } from "../src";
import { VITALS_MACRO } from "../src/macros/default-macros";
import { MacroAuthoringSession } from "../src/macros/macro-authoring-session";
import type { MacroExecutionPlan } from "../src/macros/macro-plan";
import type { MacroSlotProjection } from "../src/macros/macro-slots";

const profile: SyntaxProfile = {
	profileId: "test",
	macroStartToken: "^",
	directCommandToken: "/",
	expressionToken: "#",
	conceptToken: "@",
};

describe("MacroAuthoringSession", () => {
	function plan(): MacroExecutionPlan {
		return {
			groupId: "group-1",
			scope: { kind: "clinical_document", sessionId: "session-1" },
			macroDefinitions: [
				{ macroId: VITALS_MACRO.macroId, macroName: "vitals", version: 1 },
			],
			operations: [],
			links: [],
			generatedCells: [],
			expectedVersions: [],
			fingerprint: {
				value: "fingerprint-1",
				algorithm: "v2-plan-fingerprint-v1",
			},
			diagnostics: [],
		};
	}

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

	test("finalizes one immutable snapshot from the current slots and plan", () => {
		const session = new MacroAuthoringSession({
			profile,
			initialText: "^vitals heart_rate=72 blood_pressure=120/80 respiration=16",
		});
		session.dispatch({ type: "inspection_resolved", definition: VITALS_MACRO });
		session.setExecutablePreview({
			status: "valid",
			macroName: "vitals",
			macroId: VITALS_MACRO.macroId,
			macroVersion: 1,
			plan: plan(),
			diagnostics: [],
		});

		const result = session.finalize();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.authoredText).toBe(
			"^vitals heart_rate=72 blood_pressure=120/80 respiration=16",
		);
		expect(result.macroDefinitionId).toBe(VITALS_MACRO.macroId);
		expect(result.fingerprint).toBe("fingerprint-1");
		expect(result.bindings.map((binding) => binding.rawValue)).toEqual([
			"72",
			"120/80",
			"16",
		]);
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.bindings)).toBe(true);
		expect(Object.isFrozen(result.plan)).toBe(true);
	});

	test("uses the inspected authoring projection when its syntax differs from the parser", () => {
		const text = "^vitals [72] [120/80] [16]";
		const slot = (
			argumentId: string,
			rawText: string,
			start: number,
		): MacroSlotProjection => ({
			macroId: VITALS_MACRO.macroId,
			macroVersion: VITALS_MACRO.version,
			argumentId,
			roleName: `vitals.${argumentId}`,
			start,
			end: start + rawText.length,
			rawText,
			displayText: rawText,
			bindingSource: "friendly",
			status: "bound",
			diagnostics: [],
		});
		const session = new MacroAuthoringSession({ profile, initialText: text });
		session.dispatch({
			type: "inspection_resolved",
			definition: VITALS_MACRO,
			slots: [
				slot("heart_rate", "72", text.indexOf("72")),
				slot("blood_pressure", "120/80", text.indexOf("120/80")),
				slot("respiration", "16", text.indexOf("16")),
			],
		});
		session.setExecutablePreview({
			status: "valid",
			macroName: "vitals",
			macroId: VITALS_MACRO.macroId,
			macroVersion: VITALS_MACRO.version,
			plan: plan(),
			diagnostics: [],
		});

		const result = session.finalize();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.bindings.map((binding) => binding.rawValue)).toEqual([
			"72",
			"120/80",
			"16",
		]);
	});

	test("rejects incomplete authoring without a finalized plan", () => {
		const session = new MacroAuthoringSession({
			profile,
			initialText: "^vitals heart_rate=72",
		});
		session.dispatch({ type: "inspection_resolved", definition: VITALS_MACRO });

		const result = session.finalize();
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(
			result.diagnostics.some(
				(diagnostic) => diagnostic.code === "INCOMPLETE_ARGUMENT",
			),
		).toBe(true);
	});

	test("rejects an invalid machine preview without creating a commit", () => {
		const session = new MacroAuthoringSession({
			profile,
			initialText: "^vitals heart_rate=72 blood_pressure=bad",
		});
		session.dispatch({ type: "inspection_resolved", definition: VITALS_MACRO });
		session.setExecutablePreview({
			status: "invalid",
			macroName: "vitals",
			macroId: VITALS_MACRO.macroId,
			macroVersion: 1,
			diagnostics: ["blood pressure is invalid"],
		});

		const result = session.finalize();
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(
			result.diagnostics.map((diagnostic) => diagnostic.message),
		).toContain("blood pressure is invalid");
	});

	test("preserves a locked span and its binding in the finalized payload", () => {
		const text = "^vitals heart_rate=72 blood_pressure=120/80 respiration=16";
		const session = new MacroAuthoringSession({ profile, initialText: text });
		session.dispatch({ type: "inspection_resolved", definition: VITALS_MACRO });
		session.dispatch({ type: "set_cursor", cursorOffset: text.length - 2 });
		session.dispatch({ type: "lock_active" });
		session.setExecutablePreview({
			status: "valid",
			macroName: "vitals",
			macroId: VITALS_MACRO.macroId,
			macroVersion: 1,
			plan: plan(),
			diagnostics: [],
		});

		const result = session.finalize();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const bloodPressure = result.bindings.find(
			(binding) => binding.argumentId === "blood_pressure",
		);
		expect(bloodPressure?.rawValue).toBe("120/80");
		expect(bloodPressure?.start).toBe(text.indexOf("120/80"));
		expect(bloodPressure?.end).toBe(text.indexOf("120/80") + "120/80".length);
	});
});
