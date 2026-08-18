import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	matchKeymapCommand,
	mergeEditorKeymap,
} from "@stateful-mcp/macro";
import { dispatchTerminalInput } from "../src/terminal-dispatcher";
import { loadMacroCliWorkspace } from "../src/workspace-loader";

const normalSettingsContext = {
	activeTabId: "settings",
	focusedPane: "modal",
	editorMode: "NORMAL" as const,
};

describe("profile-driven command keymaps", () => {
	test("inverted navigation resolves j to up and k to down", () => {
		const keymap = mergeEditorKeymap(DEFAULT_EDITOR_KEYMAP_PROFILE, {
			keybindings: {
				"cursor.moveUp": ["j"],
				"cursor.moveDown": ["k"],
			},
		});

		expect(
			matchKeymapCommand(
				keymap,
				{ char: "j" },
				{
					activeTabId: "text-editor",
					editorMode: "NORMAL",
				},
			),
		).toBe("cursor.moveUp");
		expect(
			matchKeymapCommand(
				keymap,
				{ char: "k" },
				{
					activeTabId: "text-editor",
					editorMode: "NORMAL",
				},
			),
		).toBe("cursor.moveDown");
	});

	test("custom settings chords ignore j and k", async () => {
		const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "keymap-"));
		const keymapPath = join(root, "keymap.json");
		await writeFile(
			keymapPath,
			JSON.stringify({
				keybindings: {
					"settings.navigateUp": ["w"],
					"settings.navigateDown": ["s"],
				},
			}),
		);
		const loaded = await loadMacroCliWorkspace({ keymapPath });
		loaded.workspace.settingsModal?.open();
		loaded.workspace.settingsModal?.setFocus("categories");

		expect(
			await dispatchTerminalInput(loaded.workspace, loaded.keymap, {
				input: "j",
			}),
		).toBe("ignored");
		expect(
			await dispatchTerminalInput(loaded.workspace, loaded.keymap, {
				input: "s",
			}),
		).toBe("handled");
		expect(loaded.workspace.settingsNavigation.getSnapshot().section).toBe(
			"values",
		);
		await loaded.workspace.runtime.dispose();
	});

	test("custom save replaces Ctrl+S", () => {
		const keymap = mergeEditorKeymap(DEFAULT_EDITOR_KEYMAP_PROFILE, {
			keybindings: { "editor.save": ["ctrl+x"] },
		});
		expect(
			matchKeymapCommand(
				keymap,
				{ char: "s", ctrl: true },
				{
					activeTabId: "text-editor",
					editorMode: "NORMAL",
				},
			),
		).not.toBe("editor.save");
		expect(
			matchKeymapCommand(
				keymap,
				{ char: "x", ctrl: true },
				{
					activeTabId: "text-editor",
					editorMode: "NORMAL",
				},
			),
		).toBe("editor.save");
	});

	test("explicit empty variants unmap defaults and variants share a command", () => {
		const unbound = mergeEditorKeymap(DEFAULT_EDITOR_KEYMAP_PROFILE, {
			keybindings: { "settings.navigateDown": [] },
		});
		expect(
			matchKeymapCommand(unbound, { char: "j" }, normalSettingsContext),
		).toBeUndefined();

		const variants = mergeEditorKeymap(DEFAULT_EDITOR_KEYMAP_PROFILE, {
			keybindings: { "settings.navigateDown": ["j", "down"] },
		});
		expect(
			matchKeymapCommand(variants, { char: "j" }, normalSettingsContext),
		).toBe("settings.navigateDown");
		expect(
			matchKeymapCommand(variants, { name: "down" }, normalSettingsContext),
		).toBe("settings.navigateDown");
	});
});
