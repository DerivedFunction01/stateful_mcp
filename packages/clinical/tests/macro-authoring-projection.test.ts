import { describe, expect, it } from "bun:test";
import { NOTE_MACRO } from "../src/bootstrap/default-macros";
import {
	findNextMacroChild,
	getActiveMacroArgumentId,
	getMacroArgumentStatuses,
	isMacroSlotResolved,
} from "../src/macros/macro-authoring-projection";
import type { MacroSlotProjection } from "../src/macros/macro-slots";

const slot = (
	argumentId: string,
	status: MacroSlotProjection["status"],
): MacroSlotProjection => ({
	macroId: NOTE_MACRO.macroId,
	macroVersion: NOTE_MACRO.version,
	argumentId,
	roleName: `note.${argumentId}`,
	start: 0,
	end: 2,
	rawText: "hp",
	displayText: "hp",
	status,
	diagnostics: [],
});

describe("macro authoring projections", () => {
	it("derives argument statuses from shared slot semantics", () => {
		const statuses = getMacroArgumentStatuses(NOTE_MACRO, [
			slot("title", "locked"),
		]);

		expect(statuses.find((status) => status.name === "title")?.status).toBe(
			"locked",
		);
		expect(statuses.find((status) => status.name === "page_num")?.status).toBe(
			"remaining",
		);
	});

	it("does not treat unresolved concept slots as resolved", () => {
		expect(isMacroSlotResolved(slot("title", "bound"), NOTE_MACRO)).toBe(false);
		expect(isMacroSlotResolved(slot("title", "locked"), NOTE_MACRO)).toBe(true);
	});

	it("finds the first child with an incomplete locked projection", () => {
		const child = { ...NOTE_MACRO, macroId: "child", macroName: "child" };
		expect(findNextMacroChild([child], [])).toBe(child);
	});

	it("derives active argument from an explicit slot before template fallback", () => {
		const active = slot("title", "locked");
		expect(
			getActiveMacroArgumentId("^note hp", active.end, [active], NOTE_MACRO),
		).toBe("title");
	});
});
