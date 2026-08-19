import { describe, expect, test } from "bun:test";
import { matchEffectiveBindings } from "../../../src/workspace/keymaps/matcher";

describe("matchEffectiveBindings", () => {
	test("matches a canonical chord and respects mode", () => {
		const bindings = [
			{ command: "editor.insert", chords: ["i"], modes: ["NORMAL"] as const },
			{ command: "editor.visual", chords: ["v"], modes: ["VISUAL"] as const },
		];

		expect(matchEffectiveBindings(bindings, "i", "NORMAL", {})?.command).toBe(
			"editor.insert",
		);
		expect(matchEffectiveBindings(bindings, "v", "NORMAL", {})).toBeUndefined();
	});

	test("evaluates when expressions against the active context", () => {
		const bindings = [
			{
				command: "workspace.openSettings",
				chords: ["ctrl+,"],
				when: { key: "activeTabId", equals: "settings" } as const,
			},
		];

		expect(
			matchEffectiveBindings(bindings, "ctrl+,", "NORMAL", {
				activeTabId: "settings",
			})?.command,
		).toBe("workspace.openSettings");
		expect(
			matchEffectiveBindings(bindings, "ctrl+,", "NORMAL", {
				activeTabId: "scratchpad",
			}),
		).toBeUndefined();
	});
});
