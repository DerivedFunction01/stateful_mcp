import { describe, expect, test } from "bun:test";
import { matchEffectiveBindings } from "@stateful-mcp/macro";
import { normalizeBrowserChord } from "../src/lib/bindings";

describe("browser host binding pipeline", () => {
	test("normalizes browser chords without hardcoded Vim actions", () => {
		expect(
			normalizeBrowserChord(
				{
					key: "K",
					code: "KeyK",
					ctrlKey: false,
					metaKey: false,
					altKey: false,
					shiftKey: false,
				},
				"windows",
			),
		).toBe("k");
		expect(
			normalizeBrowserChord(
				{
					key: "ArrowUp",
					code: "ArrowUp",
					ctrlKey: true,
					metaKey: false,
					altKey: false,
					shiftKey: false,
				},
				"windows",
			),
		).toBe("primary+up");
	});

	test("resolves arbitrary profile bindings to canonical commands", () => {
		const keymap = {
			bindings: [
				{ command: "editor.moveLineUp", chords: ["k"] },
				{ command: "editor.togglePanel", chords: ["ctrl+\\"] },
			],
		};
		expect(
			matchEffectiveBindings(keymap.bindings, "k", "NORMAL", {})?.command,
		).toBe("editor.moveLineUp");
		expect(
			matchEffectiveBindings(keymap.bindings, "i", "NORMAL", {}),
		).toBeUndefined();
	});
});
