import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	createMacroWorkspace,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	createMacroRuntimeContext,
	ExtensionRuntime,
} from "@stateful-mcp/macro";
import { dispatchTerminalInput } from "../src/terminal-dispatcher";
import { parseArgs } from "../src/index";
import { loadMacroCliWorkspace } from "../src/workspace-loader";

describe("macro-cli workspace loading", () => {
	test("loads exactly the extensions listed by workspace.json", async () => {
		const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-cli-"));
		const extensions = join(root, "extensions");
		await mkdir(extensions);
		const source = join(extensions, "echo.ts");
		await writeFile(
			source,
			"export default { manifest: { id: 'echo', version: '1.0.0' }, activate() { return {}; } };\n",
		);
		const manifestPath = join(root, "workspace.json");
		await writeFile(
			manifestPath,
			JSON.stringify({
				extensions: [{ id: "echo", source: "./extensions/echo.ts", version: "1.0.0" }],
			}),
		);

		const loaded = await loadMacroCliWorkspace({ workspacePath: manifestPath });
		expect(loaded.loadedExtensions.map((item) => item.extension.manifest.id)).toEqual([
			"echo",
		]);
		expect(loaded.workspace.runtime.extensions.list()).toHaveLength(1);
		await loaded.workspace.runtime.dispose();
	});

	test("loads profile and keymap independently from extensions", async () => {
		const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-cli-"));
		const profilePath = join(root, "profile.json");
		const keymapPath = join(root, "keymap.json");
		await writeFile(profilePath, JSON.stringify({ locale: "es", decimalSeparator: "," }));
		await writeFile(keymapPath, JSON.stringify({ normal: { moveDown: "n" } }));

		const loaded = await loadMacroCliWorkspace({ profilePath, keymapPath });
		expect(loaded.profile?.decimalSeparator).toBe(",");
		expect(loaded.keymap.normal.moveDown).toBe("n");
		expect(loaded.keymap.normal.moveUp).toBe(DEFAULT_EDITOR_KEYMAP_PROFILE.normal.moveUp);
		await loaded.workspace.runtime.dispose();
	});

	test("rejects an extension version mismatch", async () => {
		const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-cli-"));
		const source = join(root, "echo.ts");
		await writeFile(
			source,
			"export default { manifest: { id: 'echo', version: '2.0.0' }, activate() { return {}; } };\n",
		);
		const manifestPath = join(root, "workspace.json");
		await writeFile(
			manifestPath,
			JSON.stringify({ extensions: [{ id: "echo", source: "./echo.ts", version: "1.0.0" }] }),
		);
		await expect(loadMacroCliWorkspace({ workspacePath: manifestPath })).rejects.toThrow(
			"version mismatch",
		);
	});

	test("rejects discovered extension modules that are not allowlisted", async () => {
		const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-cli-"));
		const extensions = join(root, "extensions");
		await mkdir(extensions);
		await writeFile(join(extensions, "listed.ts"), "export default { manifest: { id: 'listed', version: '1.0.0' }, activate() { return {}; } };\n");
		await writeFile(join(extensions, "unlisted.ts"), "export default { manifest: { id: 'unlisted', version: '1.0.0' }, activate() { return {}; } };\n");
		const manifestPath = join(root, "workspace.json");
		await writeFile(manifestPath, JSON.stringify({
			extensions: [{ id: "listed", source: "./extensions/listed.ts", version: "1.0.0" }],
		}));
		await expect(loadMacroCliWorkspace({ workspacePath: manifestPath })).rejects.toThrow(
			"discovered but not listed",
		);
	});

	test("installs executable contributions and removes them with workspace disposal", async () => {
		const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-cli-"));
		const source = join(root, "retail.ts");
		await writeFile(
			source,
			`export default {
				manifest: {
					id: "retail", version: "1.0.0",
					contributes: {
						viewsContainers: { activitybar: [{ id: "retail", title: "Retail", icon: "R", altKey: "4" }] },
						views: { retail: [{ id: "retail.lookup", name: "Lookup", containerId: "retail" }] },
						commands: [{ command: "retail.lookup", title: "Lookup SKU" }]
					}
				},
				activate() {
					return {
						contributions: {
							views: { "retail.lookup": { render() { return null; }, handleInput() { return "handled"; } } },
							commands: { "retail.lookup": { execute() { return "ok"; } } }
						}
					};
				}
			};\n`,
		);
		const manifestPath = join(root, "workspace.json");
		await writeFile(manifestPath, JSON.stringify({
			extensions: [{ id: "retail", source: "./retail.ts", version: "1.0.0" }],
		}));

		const loaded = await loadMacroCliWorkspace({ workspacePath: manifestPath });
		expect(loaded.workspace.views.getContainer("retail")?.extensionId).toBe("retail");
		expect(loaded.workspace.views.getView("retail.lookup")?.provider).toBeDefined();
		expect(await loaded.workspace.commands.executeCommand<string>("retail.lookup")).toBe("ok");
		loaded.workspace.layout.setActiveContainer("retail");
		loaded.workspace.layout.setFocusedPane("sidepanel");
		expect(await dispatchTerminalInput(loaded.workspace, DEFAULT_EDITOR_KEYMAP_PROFILE, { input: "j" })).toBe("handled");
		await loaded.workspace.dispose();
		expect(loaded.workspace.views.getContainer("retail")).toBeUndefined();
		expect(loaded.workspace.commands.getCommand("retail.lookup")).toBeUndefined();
	});
});

describe("macro-cli terminal dispatcher", () => {
	test("routes palette, layout, and editor input through the workspace", async () => {
		const workspace = createMacroWorkspace();
		const keymap = DEFAULT_EDITOR_KEYMAP_PROFILE;

		expect(await dispatchTerminalInput(workspace, keymap, { input: "p", ctrl: true })).toBe("handled");
		expect(workspace.palette.getIsOpen()).toBe(true);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "x" })).toBe("handled");
		expect(workspace.palette.getQuery()).toBe("x");
		expect(await dispatchTerminalInput(workspace, keymap, { name: "escape" })).toBe("handled");
		expect(workspace.palette.getIsOpen()).toBe(false);

		expect(await dispatchTerminalInput(workspace, keymap, { input: "b", ctrl: true })).toBe("handled");
		expect(workspace.layout.getSnapshot().sidepanelOpen).toBe(false);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "i" })).toBe("handled");
		expect(await dispatchTerminalInput(workspace, keymap, { input: "a" })).toBe("handled");
		expect(workspace.editor.buffer.getText()).toBe("a");
		await workspace.runtime.dispose();
	});

	test("uses an explicitly configured macro marker without adding one implicitly", () => {
		const workspace = createMacroWorkspace({
		runtime: new ExtensionRuntime({
			context: createMacroRuntimeContext({ macroStartToken: "!" }),
		}),
		});
		expect(workspace.runtime.context.syntax.macroStartToken).toBe("!");
	});

	test("selects activity containers and manages focus through Alt-number and Ctrl+W input", async () => {
		const workspace = createMacroWorkspace();
		const keymap = DEFAULT_EDITOR_KEYMAP_PROFILE;

		// 1. Alt+3 opens journal and moves focus into activity
		expect(await dispatchTerminalInput(workspace, keymap, { input: "3", meta: true })).toBe("handled");
		expect(workspace.layout.getSnapshot().activeActivityContainerId).toBe("journal");
		expect(workspace.layout.getSnapshot().focusedPane).toBe("activity");

		// 2. Second Alt+3 dismisses focus back to editor
		expect(await dispatchTerminalInput(workspace, keymap, { input: "3", meta: true })).toBe("handled");
		expect(workspace.layout.getSnapshot().focusedPane).toBe("main");

		// 3. Ctrl+W cycles focus between panes
		expect(await dispatchTerminalInput(workspace, keymap, { input: "w", ctrl: true })).toBe("handled");
		expect(workspace.layout.getSnapshot().focusedPane).toBe("activity");

		// 4. Escape from panel drops focus back to main
		expect(await dispatchTerminalInput(workspace, keymap, { name: "escape" })).toBe("handled");
		expect(workspace.layout.getSnapshot().focusedPane).toBe("main");

		await workspace.runtime.dispose();
	});

	test("executes scratchpad lines in NORMAL and VISUAL modes with r and Enter", async () => {
		const workspace = createMacroWorkspace();
		const keymap = DEFAULT_EDITOR_KEYMAP_PROFILE;

		workspace.editor.buffer.setText("^echo msg=hello");
		await workspace.scratchpad.parseAllLines();

		// In NORMAL mode, 'r' handles execution
		workspace.editor.setMode("NORMAL");
		expect(await dispatchTerminalInput(workspace, keymap, { input: "r" })).toBe("handled");

		// In VISUAL mode, Enter handles execution and resets to NORMAL
		workspace.editor.setMode("VISUAL");
		expect(await dispatchTerminalInput(workspace, keymap, { name: "enter" })).toBe("handled");
		expect(workspace.editor.getMode()).toBe("NORMAL");

		// In NORMAL mode, ':' opens Command Palette modal
		workspace.editor.setMode("NORMAL");
		expect(await dispatchTerminalInput(workspace, keymap, { input: ":" })).toBe("handled");
		expect(workspace.palette.getIsOpen()).toBe(true);

		await workspace.runtime.dispose();
	});
});

describe("macro-cli argument parsing", () => {
	test("parses independent workspace/profile/keymap options", () => {
		expect(parseArgs([
		"--workspace=.macro/workspace.json",
		"--profile=.macro/profile.json",
		"--keymap=.macro/keymap.json",
		"--locale=es",
		"--text=hello",
	])).toEqual({
		workspacePath: ".macro/workspace.json",
		profilePath: ".macro/profile.json",
		keymapPath: ".macro/keymap.json",
		locale: "es",
		initialText: "hello",
	});
});
});
