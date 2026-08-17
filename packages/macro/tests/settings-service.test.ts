import { describe, expect, test } from "bun:test";
import {
	SettingsContributionRegistry,
	SettingsNavigationState,
	validateSurfaceKeybindings,
	WorkspaceSettingsService,
} from "../src";

describe("WorkspaceSettingsService", () => {
	test("keeps form paths and raw JSON in one draft", () => {
		let saved = "";
		const service = new WorkspaceSettingsService({
			defaults: { appearance: { theme: "dark" } },
			schema: [
				{
					path: ["appearance", "theme"],
					type: "enum",
					title: "Theme",
					enumValues: ["dark", "light"],
				},
			],
			storage: {
				read: () => saved || null,
				write: (content) => {
					saved = content;
				},
				reset: () => {
					saved = "";
				},
			},
		});
		service.setPath(["appearance", "theme"], "light");
		expect(JSON.parse(service.getRawText()).appearance.theme).toBe("light");
		expect(service.getDiagnostics()).toHaveLength(0);
	});

	test("blocks invalid raw JSON and never writes it", async () => {
		let writes = 0;
		const service = new WorkspaceSettingsService({
			defaults: { locale: "en" },
			storage: {
				read: () => null,
				write: () => {
					writes++;
				},
				reset: () => undefined,
			},
		});
		service.replaceRawText("{invalid");
		expect((await service.save()).status).toBe("blocked");
		expect(writes).toBe(0);
	});
});

test("extension settings are namespaced and navigation is shared", () => {
	const registry = new SettingsContributionRegistry();
	registry.register("sample.runtime", {
		namespace: "sample.runtime",
		title: "Sample Runtime",
		schema: [],
	});
	expect(registry.list()[0]?.extensionId).toBe("sample.runtime");
	expect(() =>
		registry.register("other", {
			namespace: "sample.runtime",
			title: "Invalid",
			schema: [],
		}),
	).toThrow();
	const navigation = new SettingsNavigationState();
	navigation.open({ section: "sample.runtime", focusPath: ["enabled"] });
	expect(navigation.getSnapshot()).toEqual({
		section: "sample.runtime",
		focusPath: ["enabled"],
	});
});

test("normalizes extension settings into the unified document", () => {
	const registry = new SettingsContributionRegistry();
	registry.register("sample.runtime", {
		namespace: "sample.runtime",
		title: "Sample Runtime",
		schema: [{ path: ["enabled"], type: "boolean", title: "Enabled" }],
		defaults: { enabled: true },
	});
	expect(registry.getSchema()[0]?.path).toEqual([
		"extensions",
		"sample.runtime",
		"enabled",
	]);
	expect(registry.getDefaults()).toEqual({
		extensions: { "sample.runtime": { enabled: true } },
	});
});

test("reconfigures settings without discarding core defaults", () => {
	const service = new WorkspaceSettingsService({
		defaults: { locale: "en" },
		storage: {
			read: () => null,
			write: () => undefined,
			reset: () => undefined,
		},
	});
	service.reconfigure({
		defaults: { extensions: { "sample.runtime": { enabled: true } } },
		schema: [],
	});
	expect(service.getEffective()).toEqual({
		locale: "en",
		extensions: { "sample.runtime": { enabled: true } },
	});
});

test("validates mode-aware surface keybindings", () => {
	expect(
		validateSurfaceKeybindings([
			{ key: "j", mode: "NORMAL", action: "navigate.down", label: "Down" },
			{ key: "j", mode: "NORMAL", action: "other", label: "Other" },
		]),
	).toHaveLength(1);
	expect(
		validateSurfaceKeybindings([
			{ key: "", mode: "INSERT", action: "edit", label: "Edit" },
		]),
	).toHaveLength(1);
});
