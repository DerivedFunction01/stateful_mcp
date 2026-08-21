import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_SERVER_USER_PREFERENCES,
	resolveUserPreferencesPath,
	ServerUserPreferencesStore,
} from "../src/user-preferences-store";

describe("ServerUserPreferencesStore (JSONL Backend & WAL)", () => {
	let tempDir: string;
	let filePath: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "macro-server-prefs-"));
		filePath = join(tempDir, "preferences.jsonl");
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	test("loads default preferences when JSONL file does not exist", async () => {
		const store = new ServerUserPreferencesStore({ dataFilePath: filePath });
		const prefs = await store.loadPreferences();
		expect(prefs).toEqual(DEFAULT_SERVER_USER_PREFERENCES);
		expect(prefs.keymapProfile).toBe("default");
		expect(prefs.vimEnabled).toBe(false);
	});

	test("persists preferences changes across store reinstantiations", async () => {
		const store1 = new ServerUserPreferencesStore({ dataFilePath: filePath });
		await store1.savePreferences({
			keymapProfile: "default",
			vimEnabled: true,
			theme: "midnight",
			inspectorPosition: "left",
			inspectorWidth: 420,
			customKeybindings: [
				{ chord: "ctrl+k ctrl+s", command: "workspace.saveActive" },
			],
		});

		// Create a second store pointing to the same data file
		const store2 = new ServerUserPreferencesStore({ dataFilePath: filePath });
		const reloaded = await store2.loadPreferences();

		expect(reloaded.vimEnabled).toBe(true);
		expect(reloaded.theme).toBe("midnight");
		expect(reloaded.inspectorPosition).toBe("left");
		expect(reloaded.inspectorWidth).toBe(420);
		expect(reloaded.customKeybindings).toHaveLength(1);
	});

	test("exports and imports server preferences bundle", async () => {
		const store = new ServerUserPreferencesStore({ dataFilePath: filePath });
		await store.savePreferences({
			keymapProfile: "custom-profile",
			vimEnabled: true,
			theme: "cloud",
		});

		const bundle = await store.exportBundle();
		expect(bundle.schemaVersion).toBe(1);
		expect(bundle.metadata?.backendKind).toBe("jsonl");
		expect(bundle.preferences.vimEnabled).toBe(true);
		expect(bundle.preferences.theme).toBe("cloud");

		// Import into another store
		const tempDir2 = await mkdtemp(join(tmpdir(), "macro-server-prefs-2-"));
		const filePath2 = join(tempDir2, "preferences.jsonl");
		const storeOther = new ServerUserPreferencesStore({
			dataFilePath: filePath2,
		});

		const imported = await storeOther.importBundle(bundle);
		expect(imported.vimEnabled).toBe(true);
		expect(imported.theme).toBe("cloud");

		const verified = await storeOther.loadPreferences();
		expect(verified.theme).toBe("cloud");

		await rm(tempDir2, { recursive: true, force: true });
	});

	test("resolves custom, environment, and default paths correctly", () => {
		const custom = resolveUserPreferencesPath("/custom/path/prefs.jsonl");
		expect(custom).toBe("/custom/path/prefs.jsonl");

		const oldEnv = process.env.MACRO_USER_PREFERENCES_PATH;
		try {
			process.env.MACRO_USER_PREFERENCES_PATH = "/env/path/prefs.jsonl";
			const envResolved = resolveUserPreferencesPath();
			expect(envResolved).toBe("/env/path/prefs.jsonl");
		} finally {
			if (oldEnv !== undefined) {
				process.env.MACRO_USER_PREFERENCES_PATH = oldEnv;
			} else {
				delete process.env.MACRO_USER_PREFERENCES_PATH;
			}
		}

		const defaultPath = resolveUserPreferencesPath();
		expect(defaultPath).toContain(".config/macro/preferences.jsonl");
	});
});
