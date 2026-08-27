import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost, createMacroProject } from "@stateful-mcp/macro-host";
import type { HostClient } from "../src/lib/host-client";
import {
	DEFAULT_USER_PREFERENCES,
	loadUserPreferences,
	resetUserPreferences,
	saveUserPreferences,
	subscribeUserPreferences,
} from "../src/lib/user-preferences-storage";
import { BrowserWorkspaceStore } from "../src/lib/workspace-store";
import { HostSessionManager } from "../src/server/host-session-manager";

describe("Chunk 5 User Preferences and Durable Storage", () => {
	beforeEach(() => {
		resetUserPreferences();
	});

	test("loads default user preferences when storage is empty", () => {
		const prefs = loadUserPreferences();
		expect(prefs).toEqual(DEFAULT_USER_PREFERENCES);
		expect(prefs.keymapProfile).toBe("default");
		expect(prefs.vimEnabled).toBe(false);
		expect(prefs.theme).toBe("dark");
		expect(prefs.locale).toBe("en");
	});

	test("saves and updates user preferences reactively", () => {
		let notified = false;
		const unsubscribe = subscribeUserPreferences((updated) => {
			notified = true;
			expect(updated.keymapProfile).toBe("default");
			expect(updated.vimEnabled).toBe(true);
		});

		const saved = saveUserPreferences({
			keymapProfile: "default",
			vimEnabled: true,
			theme: "light",
			customKeybindings: [
				{ chord: "ctrl+k ctrl+s", command: "workbench.saveProject" },
			],
		});

		expect(saved.keymapProfile).toBe("default");
		expect(saved.vimEnabled).toBe(true);
		expect(saved.theme).toBe("light");
		expect(saved.customKeybindings).toHaveLength(1);
		expect(notified).toBe(true);

		const reloaded = loadUserPreferences();
		expect(reloaded.keymapProfile).toBe("default");
		expect(reloaded.vimEnabled).toBe(true);

		unsubscribe();
	});

	test("workspace store automatically hydrates user keymap preference on boot", async () => {
		// Set user preference
		saveUserPreferences({ keymapProfile: "default", vimEnabled: true });

		const host = await createMacroHost({ defaults: {} });
		const sessions = new HostSessionManager(host, 60_000);
		const initial = await sessions.create();

		const mockClient: HostClient = {
			createSession: async () => initial,
			getSnapshot: async () => sessions.snapshotFor(initial.sessionId),
			executeCommand: async () => undefined,
			selectKeymap: async (profileId: string) =>
				sessions.selectKeymap(initial.sessionId, profileId),
			resolveBinding: async () => ({ chord: "", diagnostics: [] }),
			applySettings: async () => ({}) as any,
			applySettingsUi: async () => ({}) as any,
			applySettingsBundle: async () => ({}) as any,
			valueAuthoringLoad: async () => ({}) as any,
			valueAuthoringValidate: async () => ({}) as any,
			valueAuthoringPreview: async () => ({}) as any,
			valueAuthoringSave: async () => ({}) as any,
			applyEditorOperation: async () => ({}) as any,
			browseFs: async () => ({
				currentPath: "/",
				parentPath: null,
				entries: [],
			}),
			createDirectory: async () => ({ path: "" }),
			openProject: async () => initial,
			initProject: async () => initial,
			saveAsProject: async () => initial,
			closeProject: async () => initial,
			subscribe: () => () => undefined,
			subscribeState: (listener) => {
				listener("connected");
				return () => undefined;
			},
			getState: () => "connected",
			getSessionId: () => initial.sessionId,
		};

		const store = new BrowserWorkspaceStore(mockClient);
		await store.start();

		// Should have hydrated the default keymap profile automatically
		const snapshot = store.getSnapshot().snapshot;
		expect(snapshot?.keymap.profileId).toBe("default");

		await sessions.disposeAll();
		await host.dispose();
	});

	test("preserves and re-asserts user keymap preference when switching projects", async () => {
		saveUserPreferences({ keymapProfile: "default", vimEnabled: true });

		const rootA = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-pref-a-"),
		);
		const rootB = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-pref-b-"),
		);
		await createMacroProject({ rootPath: rootA });
		await createMacroProject({ rootPath: rootB });

		const host = await createMacroHost({ defaults: {}, projectRoot: rootA });
		const sessions = new HostSessionManager(host, 60_000, rootA);
		const initial = await sessions.create();

		const mockClient: HostClient = {
			createSession: async () => initial,
			getSnapshot: async () => sessions.snapshotFor(initial.sessionId),
			executeCommand: async () => undefined,
			selectKeymap: async (profileId: string) =>
				sessions.selectKeymap(initial.sessionId, profileId),
			resolveBinding: async () => ({ chord: "", diagnostics: [] }),
			applySettings: async () => ({}) as any,
			applySettingsUi: async () => ({}) as any,
			applySettingsBundle: async () => ({}) as any,
			valueAuthoringLoad: async () => ({}) as any,
			valueAuthoringValidate: async () => ({}) as any,
			valueAuthoringPreview: async () => ({}) as any,
			valueAuthoringSave: async () => ({}) as any,
			applyEditorOperation: async () => ({}) as any,
			browseFs: async () => ({
				currentPath: "/",
				parentPath: null,
				entries: [],
			}),
			createDirectory: async () => ({ path: "" }),
			openProject: async (path: string) =>
				sessions.openProject(initial.sessionId, path),
			initProject: async () => initial,
			saveAsProject: async () => initial,
			closeProject: async () => sessions.closeProject(initial.sessionId),
			subscribe: () => () => undefined,
			subscribeState: (listener) => {
				listener("connected");
				return () => undefined;
			},
			getState: () => "connected",
			getSessionId: () => initial.sessionId,
		};

		const store = new BrowserWorkspaceStore(mockClient);
		await store.start();
		expect(store.getSnapshot().snapshot?.keymap.profileId).toBe("default");

		// Open Project B
		await store.openProject(rootB);
		expect(store.getSnapshot().snapshot?.keymap.profileId).toBe("default");

		// Close Project B (back to in-memory)
		await store.closeProject();
		expect(store.getSnapshot().snapshot?.keymap.profileId).toBe("default");

		await sessions.disposeAll();
		await host.dispose();
	});

	test("persists inspectorPosition (left/right) and inspectorWidth", () => {
		const initial = loadUserPreferences();
		expect(initial.inspectorPosition).toBe("right");
		expect(initial.inspectorWidth).toBe(320);

		saveUserPreferences({ inspectorPosition: "left", inspectorWidth: 400 });
		const updated = loadUserPreferences();
		expect(updated.inspectorPosition).toBe("left");
		expect(updated.inspectorWidth).toBe(400);

		// Switch back to right
		saveUserPreferences({ inspectorPosition: "right" });
		const reloaded = loadUserPreferences();
		expect(reloaded.inspectorPosition).toBe("right");
		expect(reloaded.inspectorWidth).toBe(400);
	});
});
