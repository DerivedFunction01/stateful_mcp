import { describe, expect, test } from "bun:test";
import { normalizeBrowserChord, resolveKeymapCommand } from "../src/lib/bindings";

describe("browser host binding pipeline", () => {
	test("normalizes browser chords without hardcoded Vim actions", () => {
		expect(normalizeBrowserChord({ key: "K", code: "KeyK", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe("k");
		expect(normalizeBrowserChord({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("ctrl+up");
	});

	test("resolves arbitrary profile bindings to canonical commands", () => {
		const keymap = { bindings: [{ command: "editor.moveLineUp", chords: ["k"] }, { command: "editor.togglePanel", chords: ["ctrl+\\"] }] };
		expect(resolveKeymapCommand("k", keymap)).toBe("editor.moveLineUp");
		expect(resolveKeymapCommand("i", keymap)).toBeUndefined();
	});
});
