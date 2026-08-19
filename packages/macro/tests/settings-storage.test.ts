import { describe, expect, test } from "bun:test";
import { MemoryKvBackend, SqlBackend, SqlExecutor } from "@stateful-mcp/core";
import type { UserMacroProfile } from "../src/contracts/extension-config";
import {
	exportSettingsBundle,
	importSettingsBundle,
} from "../src/workspace/config/bundle-manager";
import {
	computeSparseDelta,
	resolveProfile,
} from "../src/workspace/config/profile-resolver";
import {
	CoreKvSettingsBundleStorage,
	CoreSqlSettingsBundleStorage,
} from "../src/workspace/config/settings-bundle";
import {
	CoreKvSettingsStorageDriver,
	CoreSqlSettingsStorageDriver,
} from "../src/workspace/config/storage-driver";

describe("Settings Storage & Profile Inheritance Engine", () => {
	const baseProfile: UserMacroProfile = {
		id: "base",
		locale: "en-US",
		values: {
			numeric: {
				decimalSeparator: ".",
			},
		},
		syntax: {
			macroStartToken: "@",
			conceptToken: "#",
			argumentDelimiter: "=",
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

		await driver.saveSettings({
			activeProfile: "spanish",
			theme: "dark-modern",
		});
		const loadedSettings = await driver.loadSettings();
		expect(loadedSettings.activeProfile).toBe("spanish");
		expect(loadedSettings.theme).toBe("dark-modern");

		await driver.saveProfile("base", baseProfile);
		const spanishDelta: Partial<UserMacroProfile> = {
			locale: "es-ES",
			values: {
				numeric: {
					decimalSeparator: ",",
				},
			},
			unitAliases: { "mass::milligram": ["miligramos"] },
			rangeDelimiters: ["hasta"],
		};
		await driver.saveProfile("spanish", {
			...spanishDelta,
			extends: "base",
		} as any);

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
		const mockSql = await SqlBackend.connect("sqlite", ":memory:");
		const executor = new SqlExecutor(mockSql);
		const driver = new CoreSqlSettingsStorageDriver(executor);

		await driver.saveSettings({
			activeProfile: "cardio",
			density: "comfortable",
		});
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
		expect((loadedCardio as any).unitAliases?.["frequency::bpm"]).toContain(
			"bpm",
		);
	});

	test("ProfileResolver resolves deep inheritance and unions additive aliases", async () => {
		const kv = new MemoryKvBackend();
		const driver = new CoreKvSettingsStorageDriver(kv);

		await driver.saveProfile("base", baseProfile);
		await driver.saveProfile("spanish", {
			id: "spanish",
			extends: "base",
			locale: "es-ES",
			values: {
				numeric: {
					decimalSeparator: ",",
				},
			},
			unitAliases: {
				"mass::milligram": ["miligramos"],
				"packaging::box": ["caja"],
			},
			rangeDelimiters: ["hasta", "a"],
		} as any);

		const resolved = await resolveProfile("spanish", driver);

		// Scalar properties are overridden
		expect(resolved.locale).toBe("es-ES");
		expect(resolved.values?.numeric?.decimalSeparator).toBe(",");

		// Syntax is inherited from base
		expect(resolved.syntax?.macroStartToken).toBe("@");
		expect(resolved.syntax?.conceptToken).toBe("#");

		// Additive maps (unitAliases) are unioned
		expect(resolved.unitAliases?.["mass::milligram"]).toEqual([
			"mg",
			"miligramos",
		]);
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

		expect(resolveProfile("prof_a", driver)).rejects.toThrow(
			"Circular profile inheritance detected",
		);
	});

	test("computeSparseDelta strips unmodified base properties", () => {
		const derived: UserMacroProfile = {
			id: "spanish",
			locale: "es-ES",
			values: {
				numeric: {
					decimalSeparator: ",",
				},
			},
			syntax: {
				macroStartToken: "@",
				conceptToken: "#",
				argumentDelimiter: "=",
			},
			unitAliases: {
				"mass::milligram": ["miligramos"],
			},
		};

		const delta = computeSparseDelta(derived, baseProfile);
		expect(delta.locale).toBe("es-ES");
		expect(delta.values?.numeric?.decimalSeparator).toBe(",");
		expect(delta.unitAliases).toBeDefined();

		// Syntax was identical to base, so it was pruned from delta
		expect(delta.syntax).toBeUndefined();
	});

	test("SettingsBundle export and import round-trip", async () => {
		const sourceKv = new MemoryKvBackend();
		const sourceDriver = new CoreKvSettingsStorageDriver(sourceKv);

		await sourceDriver.saveSettings({
			activeProfile: "spanish",
			theme: "dark-modern",
		});
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

	test("JSONL settings bundle replaces resources atomically and rejects stale revisions", async () => {
		const kv = new MemoryKvBackend();
		const driver = new CoreKvSettingsStorageDriver(kv);
		const storage = new CoreKvSettingsBundleStorage(driver, kv);
		await driver.saveSettings({ activeProfile: "base", theme: "light" });
		await driver.saveProfile("old", { id: "old", locale: "en-US" });
		await driver.saveExtensionConfig("old.extension", { enabled: true });

		const current = await storage.load();
		const nextProfile = { ...baseProfile, id: "base" };
		const nextRevision = await storage.save(
			{
				settings: { activeProfile: "base", theme: "dark" },
				profiles: { base: nextProfile },
				extensions: { "new.extension": { enabled: false } },
			},
			current.revision,
		);
		expect(nextRevision).not.toBe(current.revision);
		expect(await driver.loadProfile("old")).toBeNull();
		expect(await driver.loadExtensionConfig("old.extension")).toBeNull();
		expect(await driver.loadExtensionConfig("new.extension")).toEqual({
			enabled: false,
		});
		await expect(
			storage.save(
				{
					settings: {},
					profiles: {},
					extensions: {},
				},
				current.revision,
			),
		).rejects.toMatchObject({ code: "SETTINGS_REVISION_STALE" });
	});

	test("SQLite settings bundle commits resources and revision in one transaction", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const executor = new SqlExecutor(backend);
		const driver = new CoreSqlSettingsStorageDriver(executor);
		const storage = new CoreSqlSettingsBundleStorage(driver, executor);
		await driver.saveProfile("old", { id: "old", locale: "en-US" });
		const current = await storage.load();
		await storage.save(
			{
				settings: { activeProfile: "base" },
				profiles: { base: { ...baseProfile, id: "base" } },
				extensions: { clinical: { enabled: true } },
			},
			current.revision,
		);
		expect(await driver.loadProfile("old")).toBeNull();
		expect(await driver.loadProfile("base")).not.toBeNull();
		expect(await driver.loadExtensionConfig("clinical")).toEqual({
			enabled: true,
		});
		const reloaded = await storage.load();
		expect(reloaded.revision).not.toBe(current.revision);
	});
});
