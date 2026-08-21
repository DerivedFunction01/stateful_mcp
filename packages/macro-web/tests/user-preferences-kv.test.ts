import { beforeEach, describe, expect, test } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core/browser";
import type { UserPreferencesDto } from "@stateful-mcp/macro-protocol";
import {
	DEFAULT_USER_PREFERENCES,
	exportUserPreferencesBundle,
	getActiveUserPreferencesBackendKind,
	importUserPreferencesBundle,
	loadUserPreferences,
	migrateUserPreferencesBackend,
	resetUserPreferences,
	saveUserPreferences,
	setUserPreferencesRepository,
	subscribeUserPreferences,
	USER_PREFERENCES_STORAGE_KEY,
	UserPreferencesRepository,
} from "../src/lib/user-preferences-storage";

describe("UserPreferencesRepository with Pluggable KvBackend", () => {
	beforeEach(() => {
		const memBackend = new MemoryKvBackend();
		const repo = new UserPreferencesRepository(memBackend, "memory");
		setUserPreferencesRepository(repo);
	});

	test("loads default user preferences when store is empty", () => {
		const prefs = loadUserPreferences();
		expect(prefs).toEqual(DEFAULT_USER_PREFERENCES);
		expect(prefs.keymapProfile).toBe("default");
		expect(prefs.vimEnabled).toBe(false);
		expect(getActiveUserPreferencesBackendKind()).toBe("memory");
	});

	test("saves and updates user preferences synchronously in memory and notifies subscribers", () => {
		let notified: UserPreferencesDto | undefined;
		const unsub = subscribeUserPreferences((updated) => {
			notified = updated;
		});

		const saved = saveUserPreferences({
			keymapProfile: "default",
			vimEnabled: true,
			theme: "midnight",
			inspectorPosition: "left",
			inspectorWidth: 380,
		});

		expect(saved.vimEnabled).toBe(true);
		expect(saved.theme).toBe("midnight");
		expect(saved.inspectorPosition).toBe("left");
		expect(saved.inspectorWidth).toBe(380);
		expect(notified).toEqual(saved);

		const reloaded = loadUserPreferences();
		expect(reloaded).toEqual(saved);

		unsub();
	});

	test("auto-migrates legacy localStorage data upon initialization", async () => {
		const memBackend = new MemoryKvBackend();
		const mockStorage: Record<string, string> = {
			[USER_PREFERENCES_STORAGE_KEY]: JSON.stringify({
				keymapProfile: "custom",
				vimEnabled: true,
				theme: "cloud",
			}),
		};
		(globalThis as any).localStorage = {
			getItem: (k: string) => mockStorage[k] ?? null,
			setItem: (k: string, v: string) => {
				mockStorage[k] = v;
			},
			removeItem: (k: string) => {
				delete mockStorage[k];
			},
			clear: () => {},
			key: () => null,
			length: 1,
		};

		const repo = new UserPreferencesRepository(memBackend, "memory");
		await repo.initialize();

		const loaded = repo.load();
		expect(loaded.keymapProfile).toBe("custom");
		expect(loaded.vimEnabled).toBe(true);
		expect(loaded.theme).toBe("cloud");
	});

	test("exports and imports user preferences bundle without loss of fidelity", async () => {
		saveUserPreferences({
			keymapProfile: "default",
			vimEnabled: true,
			theme: "violet",
			customKeybindings: [
				{ chord: "ctrl+k ctrl+s", command: "workspace.saveActive" },
			],
		});

		const bundle = await exportUserPreferencesBundle();
		expect(bundle.schemaVersion).toBe(1);
		expect(bundle.preferences.vimEnabled).toBe(true);
		expect(bundle.preferences.theme).toBe("violet");
		expect(bundle.preferences.customKeybindings).toHaveLength(1);

		// Reset preferences
		resetUserPreferences();
		expect(loadUserPreferences().vimEnabled).toBe(false);

		// Import bundle
		const imported = await importUserPreferencesBundle(bundle);
		expect(imported.vimEnabled).toBe(true);
		expect(imported.theme).toBe("violet");
		expect(imported.customKeybindings).toHaveLength(1);
		expect(loadUserPreferences().theme).toBe("violet");
	});

	test("migrates between storage backends (memory -> localstorage -> memory)", async () => {
		saveUserPreferences({
			keymapProfile: "default",
			vimEnabled: true,
			theme: "midnight",
		});

		await migrateUserPreferencesBackend("localstorage");
		expect(getActiveUserPreferencesBackendKind()).toBe("localstorage");
		expect(loadUserPreferences().theme).toBe("midnight");

		await migrateUserPreferencesBackend("memory");
		expect(getActiveUserPreferencesBackendKind()).toBe("memory");
		expect(loadUserPreferences().theme).toBe("midnight");
	});
});
