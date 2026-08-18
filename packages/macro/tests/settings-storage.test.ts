import { describe, expect, test } from "bun:test";
import {
	MemoryKvBackend,
	type SqlBackend,
	SqlExecutor,
	type SqlStatement,
} from "@stateful-mcp/core";
import {
	exportSettingsBundle,
	importSettingsBundle,
	type SettingsBundle,
} from "../src/workspace/config/bundle-manager";
import {
	computeSparseDelta,
	mergeProfile,
	resolveProfile,
} from "../src/workspace/config/profile-resolver";
import {
	CoreKvSettingsStorageDriver,
	CoreSqlSettingsStorageDriver,
} from "../src/workspace/config/storage-driver";
import type { UserMacroProfile } from "../src/contracts/extension-config";

const createMockSqlBackend = (): SqlBackend => {
	const tables: Record<string, Record<string, Record<string, any>>> = {
		macro_workspace_settings: {},
		macro_profiles: {},
		macro_extensions: {},
	};

	const backend: any = {
		dialect: "sqlite",
		conn: {} as any,
		permissionPolicy: {} as any,
		setPermissionPolicy: () => {},
		capabilities: {},
		permissions: {},
		compiler: {} as any,
		async query(sql: string, params?: any[]): Promise<Record<string, any>[]> {
			if (sql.includes("SELECT id FROM macro_profiles")) {
				return Object.keys(tables.macro_profiles ?? {}).map((id) => ({ id }));
			}
			if (sql.includes("SELECT id FROM macro_extensions")) {
				return Object.keys(tables.macro_extensions ?? {}).map((id) => ({ id }));
			}
			return [];
		},
		async queryOne(sql: string, params?: any[]): Promise<Record<string, any> | null> {
			if (sql.includes("FROM macro_workspace_settings WHERE key = ?")) {
				const key = params?.[0] as string | undefined;
				const row = key ? tables.macro_workspace_settings?.[key] : undefined;
				return row ?? null;
			}
			if (sql.includes("FROM macro_profiles WHERE id = ?")) {
				const id = params?.[0] as string | undefined;
				const row = id ? tables.macro_profiles?.[id] : undefined;
				return row ?? null;
			}
			if (sql.includes("FROM macro_extensions WHERE id = ?")) {
				const id = params?.[0] as string | undefined;
				const row = id ? tables.macro_extensions?.[id] : undefined;
				return row ?? null;
			}
			return null;
		},
		async exec(sql: string, params?: any[]): Promise<void> {
			if (sql.includes("CREATE TABLE")) return;

			if (sql.includes("INSERT INTO macro_workspace_settings")) {
				const key = params?.[0] as string;
				const data = params?.[1];
				const updated_at = params?.[2];
				if (tables.macro_workspace_settings && key) {
					tables.macro_workspace_settings[key] = { key, data, updated_at };
				}
				return;
			}

			if (sql.includes("INSERT INTO macro_profiles")) {
				const id = params?.[0] as string;
				const extends_id = params?.[1];
				const data = params?.[2];
				const updated_at = params?.[3];
				if (tables.macro_profiles && id) {
					tables.macro_profiles[id] = { id, extends_id, data, updated_at };
				}
				return;
			}

			if (sql.includes("DELETE FROM macro_profiles WHERE id = ?")) {
				const id = params?.[0] as string;
				if (tables.macro_profiles && id) {
					delete tables.macro_profiles[id];
				}
				return;
			}

			if (sql.includes("INSERT INTO macro_extensions")) {
				const id = params?.[0] as string;
				const data = params?.[1];
				const updated_at = params?.[2];
				if (tables.macro_extensions && id) {
					tables.macro_extensions[id] = { id, data, updated_at };
				}
				return;
			}
		},
		async transaction(statements: SqlStatement[]): Promise<void> {
			for (const st of statements) {
				await backend.exec(st.sql, st.params);
			}
		},
	};
	return backend as SqlBackend;
};

describe("Settings Storage & Profile Inheritance Engine", () => {
	const baseProfile: UserMacroProfile = {
		id: "base",
		locale: "en-US",
		decimalSeparator: ".",
		syntax: {
			macroStartToken: "@",
			conceptToken: "#",
			argumentAssign: "=",
		},
		unitAliases: {
			"mass::milligram": ["mg"],
			"volume::milliliter": ["mL"],
		},
		rangeDelimiters: ["-", "to"],
	};

	test("CoreKvSettingsStorageDriver persists settings, profiles, and extensions", async () => {
		const kv = new MemoryKvBackend();
		const driver = new CoreKvSettingsStorageDriver(kv);

		await driver.saveSettings({ activeProfile: "spanish", theme: "dark-modern" });
		const loadedSettings = await driver.loadSettings();
		expect(loadedSettings.activeProfile).toBe("spanish");
		expect(loadedSettings.theme).toBe("dark-modern");

		await driver.saveProfile("base", baseProfile);
		const spanishDelta: Partial<UserMacroProfile> = {
			locale: "es-ES",
			decimalSeparator: ",",
			unitAliases: { "mass::milligram": ["miligramos"] },
			rangeDelimiters: ["hasta"],
		};
		await driver.saveProfile("spanish", { ...spanishDelta, extends: "base" } as any);

		const profiles = await driver.listProfiles();
		expect(profiles).toContain("base");
		expect(profiles).toContain("spanish");

		const loadedSpanish = await driver.loadProfile("spanish");
		expect(loadedSpanish).toBeDefined();
		expect(loadedSpanish?.locale).toBe("es-ES");

		await driver.saveExtensionConfig("clinical", { strictPrescriptions: true });
		const loadedExt = await driver.loadExtensionConfig("clinical");
		expect(loadedExt?.strictPrescriptions).toBe(true);

		await driver.deleteProfile("spanish");
		const profilesAfterDelete = await driver.listProfiles();
		expect(profilesAfterDelete).not.toContain("spanish");
	});

	test("CoreSqlSettingsStorageDriver persists settings, profiles, and extensions", async () => {
		const mockSql = createMockSqlBackend();
		const executor = new SqlExecutor(mockSql);
		const driver = new CoreSqlSettingsStorageDriver(executor);

		await driver.saveSettings({ activeProfile: "cardio", density: "comfortable" });
		const loadedSettings = await driver.loadSettings();
		expect(loadedSettings.activeProfile).toBe("cardio");
		expect(loadedSettings.density).toBe("comfortable");

		await driver.saveProfile("base", baseProfile);
		await driver.saveProfile("cardio", {
			extends: "base",
			unitAliases: { "frequency::bpm": ["bpm", "beats/min"] },
		} as any);

		const profiles = await driver.listProfiles();
		expect(profiles).toContain("base");
		expect(profiles).toContain("cardio");

		const loadedCardio = await driver.loadProfile("cardio");
		expect(loadedCardio).toBeDefined();
		expect((loadedCardio as any).unitAliases?.["frequency::bpm"]).toContain("bpm");
	});

	test("ProfileResolver resolves deep inheritance and unions additive aliases", async () => {
		const kv = new MemoryKvBackend();
		const driver = new CoreKvSettingsStorageDriver(kv);

		await driver.saveProfile("base", baseProfile);
		await driver.saveProfile("spanish", {
			id: "spanish",
			extends: "base",
			locale: "es-ES",
			decimalSeparator: ",",
			unitAliases: {
				"mass::milligram": ["miligramos"],
				"packaging::box": ["caja"],
			},
			rangeDelimiters: ["hasta", "a"],
		} as any);

		const resolved = await resolveProfile("spanish", driver);

		// Scalar properties are overridden
		expect(resolved.locale).toBe("es-ES");
		expect(resolved.decimalSeparator).toBe(",");

		// Syntax is inherited from base
		expect(resolved.syntax?.macroStartToken).toBe("@");
		expect(resolved.syntax?.conceptToken).toBe("#");

		// Additive maps (unitAliases) are unioned
		expect(resolved.unitAliases?.["mass::milligram"]).toEqual(["mg", "miligramos"]);
		expect(resolved.unitAliases?.["volume::milliliter"]).toEqual(["mL"]);
		expect(resolved.unitAliases?.["packaging::box"]).toEqual(["caja"]);

		// Additive arrays (rangeDelimiters) are unioned
		expect(resolved.rangeDelimiters).toEqual(["-", "to", "hasta", "a"]);
	});

	test("ProfileResolver detects circular inheritance chains", async () => {
		const kv = new MemoryKvBackend();
		const driver = new CoreKvSettingsStorageDriver(kv);

		await driver.saveProfile("prof_a", { extends: "prof_b" } as any);
		await driver.saveProfile("prof_b", { extends: "prof_a" } as any);

		expect(resolveProfile("prof_a", driver)).rejects.toThrow("Circular profile inheritance detected");
	});

	test("computeSparseDelta strips unmodified base properties", () => {
		const derived: UserMacroProfile = {
			id: "spanish",
			locale: "es-ES",
			decimalSeparator: ",",
			syntax: {
				macroStartToken: "@",
				conceptToken: "#",
				argumentAssign: "=",
			},
			unitAliases: {
				"mass::milligram": ["miligramos"],
			},
		};

		const delta = computeSparseDelta(derived, baseProfile);
		expect(delta.locale).toBe("es-ES");
		expect(delta.decimalSeparator).toBe(",");
		expect(delta.unitAliases).toBeDefined();

		// Syntax was identical to base, so it was pruned from delta
		expect(delta.syntax).toBeUndefined();
	});

	test("SettingsBundle export and import round-trip", async () => {
		const sourceKv = new MemoryKvBackend();
		const sourceDriver = new CoreKvSettingsStorageDriver(sourceKv);

		await sourceDriver.saveSettings({ activeProfile: "spanish", theme: "dark-modern" });
		await sourceDriver.saveProfile("base", baseProfile);
		await sourceDriver.saveProfile("spanish", {
			extends: "base",
			locale: "es-ES",
			decimalSeparator: ",",
		} as any);
		await sourceDriver.saveExtensionConfig("clinical", { defaultUnit: "mg" });

		const bundle = await exportSettingsBundle(sourceDriver);
		expect(bundle.version).toBe(1);
		expect(bundle.workspace?.activeProfile).toBe("spanish");
		expect(bundle.profiles?.["spanish"]?.locale).toBe("es-ES");
		expect(bundle.extensions?.["clinical"]?.defaultUnit).toBe("mg");

		const destKv = new MemoryKvBackend();
		const destDriver = new CoreKvSettingsStorageDriver(destKv);

		await importSettingsBundle(bundle, destDriver, "replace");

		const importedSettings = await destDriver.loadSettings();
		expect(importedSettings.activeProfile).toBe("spanish");

		const importedSpanish = await destDriver.loadProfile("spanish");
		expect(importedSpanish?.locale).toBe("es-ES");

		const importedExt = await destDriver.loadExtensionConfig("clinical");
		expect(importedExt?.defaultUnit).toBe("mg");
	});
});
