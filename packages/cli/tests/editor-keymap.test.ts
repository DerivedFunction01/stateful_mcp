import { describe, expect, test } from "bun:test";
import {
	defaultEditorKeymapProfile,
	mergeEditorKeymap,
} from "../src/bootstrap/editor-keymap-defaults";
import { SpecialKeys } from "../src/lib/editor/editor-keymap-profile";
import { resolveKey } from "../src/lib/editor/keymap";

const defaults = defaultEditorKeymapProfile;

describe("resolveKey (profile-driven)", () => {
	test("default macro key enters macro mode", () => {
		expect(resolveKey("^", {}, "NORMAL", "", defaults).action).toBe(
			"ENTER_MACRO",
		);
	});

	test("default command key opens command line", () => {
		expect(resolveKey(":", {}, "NORMAL", "", defaults).action).toBe(
			"OPEN_COMMAND_LINE",
		);
	});

	test("custom macro key enters macro mode", () => {
		const profile = mergeEditorKeymap(defaults, {
			normal: { ...defaults.normal, macro: "~" },
		});
		expect(resolveKey("~", {}, "NORMAL", "", profile).action).toBe(
			"ENTER_MACRO",
		);
		expect(resolveKey("^", {}, "NORMAL", "", profile).action).toBeNull();
	});

	test("single movement keys resolve", () => {
		expect(resolveKey("j", {}, "NORMAL", "", defaults).action).toBe(
			"MOVE_DOWN",
		);
		expect(resolveKey("k", {}, "NORMAL", "", defaults).action).toBe("MOVE_UP");
	});

	test("dd pending then delete", () => {
		expect(resolveKey("d", {}, "NORMAL", "", defaults).nextPending).toBe("d");
		expect(resolveKey("d", {}, "NORMAL", "d", defaults).action).toBe(
			"DELETE_CELL",
		);
	});

	test("gp paste above via sequence", () => {
		expect(resolveKey("g", {}, "NORMAL", "", defaults).nextPending).toBe("g");
		expect(resolveKey("p", {}, "NORMAL", "g", defaults).action).toBe(
			"PASTE_CELL_ABOVE",
		);
	});

	test("default p pastes below, P previews", () => {
		expect(resolveKey("p", {}, "NORMAL", "", defaults).action).toBe(
			"PASTE_CELL",
		);
		expect(resolveKey("P", {}, "NORMAL", "", defaults).action).toBe(
			"PREVIEW_CELL",
		);
	});

	test("ctrl+r redo", () => {
		expect(resolveKey("r", { ctrl: true }, "NORMAL", "", defaults).action).toBe(
			"REDO",
		);
	});

	test("visual mode delete/reselect via profile", () => {
		expect(resolveKey("d", {}, "VISUAL", "", defaults).action).toBe(
			"DELETE_SELECTION",
		);
		expect(resolveKey("y", {}, "VISUAL", "", defaults).action).toBe(
			"YANK_SELECTION",
		);
	});

	test("merge keeps defaults for unspecified fields", () => {
		const merged = mergeEditorKeymap(defaults, {
			normal: { ...defaults.normal, macro: "~" },
		});
		expect(merged.normal.macro).toBe("~");
		expect(merged.normal.moveDown).toBe("j");
		expect(merged.profileId).toBe("cli-default");
	});

	test("redo token constant present", () => {
		expect(defaults.normal.redo).toBe(SpecialKeys.CtrlR);
	});
});
