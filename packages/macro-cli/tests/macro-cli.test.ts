import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	createMacroRuntimeContext,
	createMacroWorkspace,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	ExtensionRuntime,
} from "@stateful-mcp/macro";
import { parseArgs } from "../src/index";
import { dispatchTerminalInput } from "../src/terminal-dispatcher";
import {
	loadMacroCliWorkspace,
	resolveWorkspaceExtensions,
} from "../src/workspace-loader";

describe("macro-cli workspace loading", () => {
	test("resolves a named profile with automatic dependency closure", () => {
		const resolved = resolveWorkspaceExtensions({
			profiles: { clinical: ["pharmacy"] },
			activeProfile: "clinical",
			extensions: [
				{ id: "observation", source: "observation.ts", version: "1.0.0" },
				{
					id: "pharmacy",
					source: "pharmacy.ts",
					version: "1.0.0",
					requires: ["observation"],
				},
				{ id: "inventory", source: "inventory.ts", version: "1.0.0" },
			],
		});
		expect(resolved.activeProfile).toBe("clinical");
		expect(resolved.extensions.map((extension) => extension.id)).toEqual([
			"observation",
			"pharmacy",
		]);
	});

	test("rejects unknown profiles before loading extension modules", () => {
		expect(() =>
			resolveWorkspaceExtensions({
				profiles: { clinical: ["observation"] },
				activeProfile: "retail",
				extensions: [
					{ id: "observation", source: "observation.ts", version: "1.0.0" },
				],
			}),
		).toThrow("Unknown active workspace profile");
	});

	test("loads exactly the extensions listed by workspace.json", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-cli-"),
		);
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
				extensions: [
					{ id: "echo", source: "./extensions/echo.ts", version: "1.0.0" },
				],
			}),
		);

		const loaded = await loadMacroCliWorkspace({ workspacePath: manifestPath });
		expect(
			loaded.loadedExtensions.map((item) => item.extension.manifest.id),
		).toEqual(["echo"]);
		expect(loaded.workspace.runtime.extensions.list()).toHaveLength(1);
		await loaded.workspace.runtime.dispose();
	});

	test("loads profile and keymap independently from extensions", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-cli-"),
		);
		const profilePath = join(root, "profile.json");
		const keymapPath = join(root, "keymap.json");
		await writeFile(
			profilePath,
			JSON.stringify({
				locale: "es",
				values: { numeric: { decimalSeparator: "," } },
			}),
		);
		await writeFile(keymapPath, JSON.stringify({ normal: { moveDown: "n" } }));

		const loaded = await loadMacroCliWorkspace({ profilePath, keymapPath });
		expect(loaded.profile?.values?.numeric?.decimalSeparator).toBe(",");
		expect(loaded.keymap.normal.moveDown).toBe("n");
		expect(loaded.keymap.normal.moveUp).toBe(
			DEFAULT_EDITOR_KEYMAP_PROFILE.normal.moveUp,
		);
		await loaded.workspace.runtime.dispose();
	});

	test("persists namespaced extension settings and reloads them", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-cli-"),
		);
		const source = join(root, "settings.ts");
		const profilePath = join(root, "storage.jsonl");
		const manifestPath = join(root, "workspace.json");
		await writeFile(
			source,
			`export default { manifest: { id: "sample.runtime", version: "1.0.0", contributes: { settings: [{ namespace: "sample.runtime", title: "Sample", schema: [{ path: ["enabled"], type: "boolean", title: "Enabled" }], defaults: { enabled: true } }] } }, activate() { return {}; } };\n`,
		);
		await writeFile(
			manifestPath,
			JSON.stringify({
				extensions: [
					{ id: "sample.runtime", source: "./settings.ts", version: "1.0.0" },
				],
			}),
		);
		const loaded = await loadMacroCliWorkspace({
			workspacePath: manifestPath,
			profilePath,
		});
		const settings = loaded.workspace.settings!;
		expect(settings.getPath(["extensions", "sample.runtime", "enabled"])).toBe(
			true,
		);
		settings.setPath(["extensions", "sample.runtime", "enabled"], false);
		expect((await settings.save()).status).toBe("saved");
		await loaded.workspace.dispose();

		const reloaded = await loadMacroCliWorkspace({
			workspacePath: manifestPath,
			profilePath,
		});
		expect(
			reloaded.workspace.settings?.getPath([
				"extensions",
				"sample.runtime",
				"enabled",
			]),
		).toBe(false);
		await reloaded.workspace.dispose();
	});

	test("rejects an extension version mismatch", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-cli-"),
		);
		const source = join(root, "echo.ts");
		await writeFile(
			source,
			"export default { manifest: { id: 'echo', version: '2.0.0' }, activate() { return {}; } };\n",
		);
		const manifestPath = join(root, "workspace.json");
		await writeFile(
			manifestPath,
			JSON.stringify({
				extensions: [{ id: "echo", source: "./echo.ts", version: "1.0.0" }],
			}),
		);
		await expect(
			loadMacroCliWorkspace({ workspacePath: manifestPath }),
		).rejects.toThrow("version mismatch");
	});

	test("rejects discovered extension modules that are not allowlisted", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-cli-"),
		);
		const extensions = join(root, "extensions");
		await mkdir(extensions);
		await writeFile(
			join(extensions, "listed.ts"),
			"export default { manifest: { id: 'listed', version: '1.0.0' }, activate() { return {}; } };\n",
		);
		await writeFile(
			join(extensions, "unlisted.ts"),
			"export default { manifest: { id: 'unlisted', version: '1.0.0' }, activate() { return {}; } };\n",
		);
		const manifestPath = join(root, "workspace.json");
		await writeFile(
			manifestPath,
			JSON.stringify({
				extensions: [
					{ id: "listed", source: "./extensions/listed.ts", version: "1.0.0" },
				],
			}),
		);
		await expect(
			loadMacroCliWorkspace({ workspacePath: manifestPath }),
		).rejects.toThrow("discovered but not listed");
	});

	test("installs executable contributions and removes them with workspace disposal", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-cli-"),
		);
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
		await writeFile(
			manifestPath,
			JSON.stringify({
				extensions: [{ id: "retail", source: "./retail.ts", version: "1.0.0" }],
			}),
		);

		const loaded = await loadMacroCliWorkspace({ workspacePath: manifestPath });
		expect(loaded.workspace.views.getContainer("retail")?.extensionId).toBe(
			"retail",
		);
		expect(
			loaded.workspace.views.getView("retail.lookup")?.provider,
		).toBeDefined();
		expect(
			await loaded.workspace.commands.executeCommand<string>("retail.lookup"),
		).toBe("ok");
		loaded.workspace.layout.setActiveContainer("retail");
		loaded.workspace.layout.setFocusedPane("sidepanel");
		expect(
			await dispatchTerminalInput(
				loaded.workspace,
				DEFAULT_EDITOR_KEYMAP_PROFILE,
				{ input: "j" },
			),
		).toBe("handled");
		await loaded.workspace.dispose();
		expect(loaded.workspace.views.getContainer("retail")).toBeUndefined();
		expect(
			loaded.workspace.commands.getCommand("retail.lookup"),
		).toBeUndefined();
	});
});

describe("macro-cli terminal dispatcher", () => {
	test("routes palette, layout, and editor input through the workspace", async () => {
		const workspace = createMacroWorkspace();
		const keymap = DEFAULT_EDITOR_KEYMAP_PROFILE;

		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "p",
				ctrl: true,
			}),
		).toBe("handled");
		expect(workspace.palette.getIsOpen()).toBe(true);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "x" })).toBe(
			"handled",
		);
		expect(workspace.palette.getQuery()).toBe("x");
		expect(
			await dispatchTerminalInput(workspace, keymap, { name: "escape" }),
		).toBe("handled");
		expect(workspace.palette.getIsOpen()).toBe(false);

		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "b",
				ctrl: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().sidepanelOpen).toBe(false);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "i" })).toBe(
			"handled",
		);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "a" })).toBe(
			"handled",
		);
		expect(workspace.editor.buffer.getText()).toBe("a");
		await workspace.runtime.dispose();
	});

	test("keeps command bar separate from palette and preserves Vim w", async () => {
		const workspace = createMacroWorkspace({ initialText: "one two" });
		const keymap = DEFAULT_EDITOR_KEYMAP_PROFILE;
		await dispatchTerminalInput(workspace, keymap, { input: "w" });
		expect(workspace.editor.buffer.getCursor().col).toBe(4);
		await dispatchTerminalInput(workspace, keymap, { input: ":" });
		expect(workspace.palette.getIsOpen()).toBe(false);
		expect(workspace.editor.getMode()).toBe("COMMAND");
		await dispatchTerminalInput(workspace, keymap, { input: "w" });
		expect(workspace.editor.buffer.getCursor().col).toBe(4);
		expect(workspace.editor.getCommandText()).toBe("w");
		await dispatchTerminalInput(workspace, keymap, { name: "return" });
		expect(workspace.editor.getMode()).toBe("NORMAL");
		await workspace.dispose();
	});

	test("uses an explicitly configured macro marker without adding one implicitly", () => {
		const workspace = createMacroWorkspace({
			runtime: new ExtensionRuntime({
				context: createMacroRuntimeContext({ macroStartToken: "!" }),
			}),
		});
		expect(workspace.runtime.context.syntax.macroStartToken).toBe("!");
	});

	test("selects activity containers and manages focus through Alt-number, Ctrl+E, and Ctrl+W input", async () => {
		const workspace = createMacroWorkspace();
		const keymap = DEFAULT_EDITOR_KEYMAP_PROFILE;

		// 1. Alt+3 opens journal and moves focus into activity
		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "3",
				meta: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().activeActivityContainerId).toBe(
			"journal",
		);
		expect(workspace.layout.getSnapshot().focusedPane).toBe("activity");
		expect(workspace.layout.getSnapshot().regions.activity.open).toBe(true);

		// 2. Second Alt+3 when focused toggles/closes the activity region and returns focus to main
		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "3",
				meta: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().regions.activity.open).toBe(false);
		expect(workspace.layout.getSnapshot().focusedPane).toBe("main");

		// 3. Ctrl+E toggles activity panel open/closed
		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "e",
				ctrl: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().regions.activity.open).toBe(true);
		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "e",
				ctrl: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().regions.activity.open).toBe(false);

		// 3b. Test Ctrl+B toggles inspector / sidepanel
		const initialInspectorOpen =
			workspace.layout.getSnapshot().regions.inspector.open;
		expect(
			await dispatchTerminalInput(workspace, keymap, {
				name: "b",
				ctrl: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().regions.inspector.open).toBe(
			!initialInspectorOpen,
		);

		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "\x02",
				ctrl: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().regions.inspector.open).toBe(
			initialInspectorOpen,
		);

		// 4. Reopen and test Ctrl+W focus cycling
		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "e",
				ctrl: true,
			}),
		).toBe("handled");
		expect(
			await dispatchTerminalInput(workspace, keymap, {
				input: "w",
				ctrl: true,
			}),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().focusedPane).toBe("activity");

		// 5. Escape from panel drops focus back to main
		expect(
			await dispatchTerminalInput(workspace, keymap, { name: "escape" }),
		).toBe("handled");
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
		expect(await dispatchTerminalInput(workspace, keymap, { input: "r" })).toBe(
			"handled",
		);

		// In VISUAL mode, Enter handles execution and resets to NORMAL
		workspace.editor.setMode("VISUAL");
		expect(
			await dispatchTerminalInput(workspace, keymap, { name: "enter" }),
		).toBe("handled");
		expect(workspace.editor.getMode()).toBe("NORMAL");

		// In NORMAL mode, ':' enters the command bar, not the palette.
		workspace.editor.setMode("NORMAL");
		expect(await dispatchTerminalInput(workspace, keymap, { input: ":" })).toBe(
			"handled",
		);
		expect(workspace.palette.getIsOpen()).toBe(false);
		expect(workspace.editor.getMode()).toBe("COMMAND");

		await workspace.runtime.dispose();
	});

	test("navigates and modifies settings tab with keyboard commands", async () => {
		const loaded = await loadMacroCliWorkspace();
		const { workspace, keymap } = loaded;

		// 1. Open settings tab
		workspace.layout.setActiveTab("settings");
		workspace.layout.setFocusedPane("main");
		expect(workspace.layout.getSnapshot().activeTabId).toBe("settings");

		// 2. Navigate down sections with 'j' and 'down'
		expect(await dispatchTerminalInput(workspace, keymap, { input: "j" })).toBe(
			"handled",
		);
		expect(workspace.settingsNavigation.getSnapshot().section).toBe("values");

		expect(
			await dispatchTerminalInput(workspace, keymap, { name: "down" }),
		).toBe("handled");
		expect(workspace.settingsNavigation.getSnapshot().section).toBe(
			"appearance",
		);

		// 3. Navigate up with 'k' and 'up'
		expect(await dispatchTerminalInput(workspace, keymap, { input: "k" })).toBe(
			"handled",
		);
		expect(workspace.settingsNavigation.getSnapshot().section).toBe("values");

		expect(await dispatchTerminalInput(workspace, keymap, { name: "up" })).toBe(
			"handled",
		);
		expect(workspace.settingsNavigation.getSnapshot().section).toBe("syntax");

		// 4. Focus content region with 'l' or 'right'
		expect(await dispatchTerminalInput(workspace, keymap, { input: "l" })).toBe(
			"handled",
		);

		// 5. Toggle or cycle settings value with Enter
		expect(
			await dispatchTerminalInput(workspace, keymap, { name: "enter" }),
		).toBe("handled");

		// 6. Return focus to navigation with 'h'
		expect(await dispatchTerminalInput(workspace, keymap, { input: "h" })).toBe(
			"handled",
		);

		// 7. Search filtering with '/'
		expect(await dispatchTerminalInput(workspace, keymap, { input: "/" })).toBe(
			"handled",
		);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "u" })).toBe(
			"handled",
		);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "n" })).toBe(
			"handled",
		);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "i" })).toBe(
			"handled",
		);
		expect(await dispatchTerminalInput(workspace, keymap, { input: "t" })).toBe(
			"handled",
		);
		expect(
			await dispatchTerminalInput(workspace, keymap, { name: "enter" }),
		).toBe("handled");

		// 8. Return to navigation with 'h' and escape to scratchpad
		expect(await dispatchTerminalInput(workspace, keymap, { input: "h" })).toBe(
			"handled",
		);
		expect(
			await dispatchTerminalInput(workspace, keymap, { name: "escape" }),
		).toBe("handled");
		expect(workspace.layout.getSnapshot().activeTabId).toBe("scratchpad");

		await workspace.dispose();
	});

	test("isolates keyboard input to the active tab without letting background scratchpad intercept", async () => {
		const loaded = await loadMacroCliWorkspace();
		const { workspace, keymap } = loaded;

		// Set initial scratchpad text and mode
		workspace.editor.buffer.setText("^initial scratchpad content");
		workspace.editor.setMode("NORMAL");

		// Switch to settings tab
		workspace.layout.setActiveTab("settings");
		workspace.layout.setFocusedPane("main");

		// Typing 'i' on settings should NOT enter INSERT mode on the scratchpad editor
		await dispatchTerminalInput(workspace, keymap, { input: "i" });
		expect(workspace.editor.getMode()).toBe("NORMAL");

		// Typing text on settings should NOT modify the background scratchpad buffer
		await dispatchTerminalInput(workspace, keymap, { input: "x" });
		expect(workspace.editor.buffer.getText()).toBe(
			"^initial scratchpad content",
		);

		// 'dd' should NOT delete scratchpad lines when settings tab is active
		await dispatchTerminalInput(workspace, keymap, { input: "d" });
		await dispatchTerminalInput(workspace, keymap, { input: "d" });
		expect(workspace.editor.buffer.getText()).toBe(
			"^initial scratchpad content",
		);

		await workspace.dispose();
	});
});

describe("macro-cli argument parsing", () => {
	test("parses independent workspace/profile/keymap options", () => {
		expect(
			parseArgs([
				"--workspace=.macro/workspace.json",
				"--profile=.macro/profile.json",
				"--keymap=.macro/keymap.json",
				"--locale=es",
				"--text=hello",
			]),
		).toEqual({
			workspacePath: ".macro/workspace.json",
			profilePath: ".macro/profile.json",
			keymapPath: ".macro/keymap.json",
			locale: "es",
			initialText: "hello",
		});
	});
});
