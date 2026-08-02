import { describe, expect, test } from "bun:test";
import {
	cellDocumentExtension,
	commandInputExtension,
	coreEditorExtension,
	visualSelectionExtension,
} from "../src/lib/builtin-extensions";
import type { WindowScope } from "../src/lib/editor-extension";
import {
	ExtensionRegistry,
	IntentDispatcher,
} from "../src/lib/extension-registry";
import { IntentCatalog } from "../src/lib/intent-catalog";
import {
	buildNotebookExtension,
	commandResultToEffects,
	dispatchGeneralWindowCommand,
} from "../src/lib/notebook-extension";
import { buildWorkspaceExtension } from "../src/lib/workspace-extension";

const scope: WindowScope = {
	windowKind: "notebook",
	sessionId: "session_1",
	collection: { kind: "notebook", collectionId: "session_1" },
};

const otherScope: WindowScope = {
	windowKind: "workspace",
	sessionId: "session_1",
	collection: { kind: "workspace", collectionId: "work_1" },
};

const editor = {
	verb: "w",
	aliases: ["save"],
	group: "editor",
	descriptionKey: "cmd.w",
	args: [],
};
const cell = {
	verb: "branch",
	aliases: [],
	group: "cell",
	descriptionKey: "cmd.branch",
	args: [{ name: "name", required: true, descriptionKey: "arg" }],
};

describe("ScopedRegistry window isolation", () => {
	test("commands registered for notebook are not visible in workspace scope", () => {
		const registry = new ExtensionRegistry();
		registry.registerExtension(
			buildNotebookExtension({
				editorDescriptors: [editor as any],
				cellDescriptors: [cell as any],
				onCommand: async () => [],
			}),
			scope,
		);
		const notebookCmds = registry.commandsFor(scope);
		expect(notebookCmds.length).toBeGreaterThan(0);
		expect(registry.commandsFor(otherScope).length).toBe(0);
	});

	test("notebook and workspace contributions remain isolated in both directions", () => {
		const registry = new ExtensionRegistry();
		registry.registerExtension(
			buildNotebookExtension({
				editorDescriptors: [editor as any],
				cellDescriptors: [cell as any],
				onCommand: async () => [],
			}),
			scope,
		);
		registry.registerExtension(
			buildWorkspaceExtension({
				profile: {} as any,
				snapshot: null,
				editorDescriptors: [],
				onCommand: async () => [],
			}),
			otherScope,
		);
		expect(registry.commandsFor(scope).map((command) => command.id)).toEqual([
			"w",
			"branch",
		]);
		expect(
			registry.commandsFor(otherScope).map((command) => command.id),
		).not.toContain("branch");
	});
});

describe("IntentCatalog", () => {
	test("resolves commands and arg completions in scope", () => {
		const registry = new ExtensionRegistry();
		registry.registerExtension(
			buildNotebookExtension({
				editorDescriptors: [editor as any],
				cellDescriptors: [cell as any],
				onCommand: async () => [],
			}),
			scope,
		);
		const catalog = new IntentCatalog(registry);
		expect(catalog.findByVerb("w", scope)).toBeDefined();
		expect(catalog.findByVerb("save", scope)).toBeDefined();
		const cellMatch = catalog.matchCommandLine(":branch PE", scope);
		expect(cellMatch?.intentType).toContain("branch");
	});
});

describe("builtin extensions", () => {
	test("defines core, command-input, doc, and visual extensions", () => {
		expect(coreEditorExtension.keybindings?.length).toBeGreaterThan(0);
		expect(commandInputExtension.keybindings?.length).toBeGreaterThan(0);
		expect(cellDocumentExtension.keybindings?.length).toBeGreaterThan(0);
		expect(visualSelectionExtension.keybindings?.length).toBeGreaterThan(0);
	});
});

describe("command result → effects", () => {
	test("routes common result actions to effects", () => {
		expect(commandResultToEffects({ success: true, action: "quit" })).toEqual([
			{ type: "app.quit" },
		]);
		const help = commandResultToEffects({ success: true, action: "show_help" });
		expect(help[0]).toEqual({ type: "router.open", route: "help" });
		const undo = commandResultToEffects({ success: true, action: "undo" });
		expect(undo[0]).toEqual({
			type: "document.dispatch",
			action: { type: "undo" },
		});
		const toggle = commandResultToEffects({
			success: true,
			action: "toggle_workspace",
		});
		expect(toggle).toEqual([
			{ type: "router.switchWindow", windowKind: "workspace" },
		]);
		const switchWin = commandResultToEffects({
			success: true,
			action: "switch_window",
			data: { windowKind: "notebook" },
		});
		expect(switchWin).toEqual([
			{ type: "router.switchWindow", windowKind: "notebook" },
		]);
		expect(dispatchGeneralWindowCommand(":save")?.action).toBe("save");
		expect(dispatchGeneralWindowCommand(":quit")?.action).toBe("quit");
		expect(dispatchGeneralWindowCommand(":wq")?.action).toBe("save_quit");
		expect(
			commandResultToEffects({ success: true, action: "save_quit" }),
		).toEqual([{ type: "app.quit" }]);
		expect(
			commandResultToEffects({
				success: true,
				action: "set_default_insert",
				data: { section: "objective", schema: "VitalsMeasurementEvent" },
			}),
		).toEqual([
			{
				type: "editor.defaultInsert",
				section: "objective",
				schema: "VitalsMeasurementEvent",
			},
		]);
	});
});

describe("IntentDispatcher", () => {
	test("dispatches intents to registered handlers", async () => {
		const registry = new ExtensionRegistry();
		registry.registerExtension(
			buildNotebookExtension({
				editorDescriptors: [editor as any],
				cellDescriptors: [],
				onCommand: async () => [{ type: "editor.message", message: "ran" }],
			}),
			scope,
		);
		const dispatcher = new IntentDispatcher(registry);
		const intent = {
			id: "command.editor.w",
			source: "commandLine" as const,
			scope,
			arguments: { _verb: "w", _rest: "" },
			correlationId: "c1",
		};
		const effects = await dispatcher.dispatch(intent, {
			scope,
			editorState: {} as any,
			document: {} as any,
			services: {},
		});
		expect(effects).toEqual([{ type: "editor.message", message: "ran" }]);
	});
});
