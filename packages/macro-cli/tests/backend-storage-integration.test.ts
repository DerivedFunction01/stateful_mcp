import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import {
	CoreKvSettingsStorageDriver,
	type UserMacroProfile,
	WorkspaceSettingsService,
} from "@stateful-mcp/macro";
import {
	DEFAULT_WORKSPACE_SETTINGS_VALUES,
	getDefaultSettingsSchema,
} from "../src/config";

describe("Backend Storage Driver (KV/SQL) & Profile Integration", () => {
	const baseProfile: UserMacroProfile = {
		id: "base",
		locale: "en-US",
		values: {
			numeric: {
				decimalSeparator: ".",
			},
			currency: {
				defaultCurrency: "USD",
			},
		},
		syntax: {
			macroStartToken: "@",
			conceptToken: "#",
			argumentDelimiter: "=",
		},
		unitAliases: {
			"mass::milligram": ["mg"],
		},
	};

	it("initializes storage driver and persists profile changes on save", async () => {
		const kv = new MemoryKvBackend();
		const driver = new CoreKvSettingsStorageDriver(kv);

		// Seed base profile
		await driver.saveProfile("base", baseProfile);

		const service = new WorkspaceSettingsService({
			defaults: DEFAULT_WORKSPACE_SETTINGS_VALUES,
			schema: getDefaultSettingsSchema(),
			driver,
			activeProfileId: "base",
			baseProfile,
			initial: {
				...DEFAULT_WORKSPACE_SETTINGS_VALUES,
				...(baseProfile as Record<string, unknown>),
			},
		});

		// Modify a value in draft
		service.setPath(["values", "numeric", "decimalSeparator"], ",");
		service.setPath(["appearance", "theme"], "nord");

		expect(service.isDirty()).toBe(true);

		const saveResult = await service.save();
		expect(saveResult.status).toBe("saved");
		expect(service.isDirty()).toBe(false);

		// Verify profile was saved to KV storage driver
		const loadedProfile = await driver.loadProfile("base");
		expect(loadedProfile).toBeDefined();
		expect(loadedProfile?.values?.numeric?.decimalSeparator).toBe(",");

		// Verify workspace settings were saved to KV storage driver
		const loadedSettings = await driver.loadSettings();
		expect(loadedSettings.activeProfile).toBe("base");
		expect(loadedSettings.theme).toBe("nord");
	});

	it("supports creating, listing, and switching between profiles", async () => {
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
				currency: {
					defaultCurrency: "EUR",
				},
			},
		} as any);

		const service = new WorkspaceSettingsService({
			defaults: DEFAULT_WORKSPACE_SETTINGS_VALUES,
			schema: getDefaultSettingsSchema(),
			driver,
			activeProfileId: "base",
			baseProfile,
			initial: {
				...DEFAULT_WORKSPACE_SETTINGS_VALUES,
				...(baseProfile as Record<string, unknown>),
			},
		});

		// Check profile listing
		const profiles = await service.listProfiles();
		expect(profiles).toContain("base");
		expect(profiles).toContain("spanish");

		// Switch to spanish profile
		await service.switchProfile("spanish");
		expect(service.getActiveProfileId()).toBe("spanish");

		const effective = service.getEffective();
		expect(effective.locale).toBe("es-ES");
		expect((effective.values as any).numeric.decimalSeparator).toBe(",");
		expect((effective.values as any).currency.defaultCurrency).toBe("EUR");

		// Inherited syntax from base
		expect((effective.syntax as any).macroStartToken).toBe("@");
	});

	it("persists extension-scoped configs into storage driver", async () => {
		const kv = new MemoryKvBackend();
		const driver = new CoreKvSettingsStorageDriver(kv);

		const service = new WorkspaceSettingsService({
			defaults: DEFAULT_WORKSPACE_SETTINGS_VALUES,
			schema: getDefaultSettingsSchema(),
			driver,
			activeProfileId: "base",
			baseProfile,
			initial: {
				...DEFAULT_WORKSPACE_SETTINGS_VALUES,
				extensions: {
					"medical::rx": {
						defaultDoseUnit: "mg",
					},
				},
			},
		});

		const saveResult = await service.save();
		expect(saveResult.status).toBe("saved");

		const extConfig = await driver.loadExtensionConfig("medical::rx");
		expect(extConfig).toBeDefined();
		expect(extConfig?.defaultDoseUnit).toBe("mg");
	});
});
