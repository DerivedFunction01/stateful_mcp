import { describe, expect, test } from "bun:test";
import type {
	ProjectConfigurationDto,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import { validateProjectConfiguration } from "../src/server/project-configuration-validation";

const baseConfig: ProjectConfigurationDto = {
	formatVersion: 1,
	projectId: "project-1",
	displayName: "Project",
	backend: { kind: "jsonl", path: ".macro/state.jsonl" },
	activeExtensionProfileId: "default",
	uiLocale: "en",
	extensions: [{ id: "ext.a", source: "builtin", version: "1.0.0" }],
	extensionProfiles: { default: ["ext.a"] },
	resources: [],
	historyResources: [],
	scratchpadResources: [],
	revision: "1",
	availableLocales: [],
	projectSettingsContributions: [],
};

const contributions: ProjectSettingsContributionDto[] = [
	{
		extensionId: "ext.a",
		namespace: "ext.a",
		title: "Extension A Settings",
		schema: [
			{ path: ["theme"], type: "string", title: "Theme" },
			{
				path: ["mode"],
				type: "enum",
				title: "Mode",
				enumOptions: [
					{ id: "light", label: "light" },
					{ id: "dark", label: "dark" },
				],
			},
			{ path: ["count"], type: "number", title: "Count" },
			{ path: ["enabled"], type: "boolean", title: "Enabled" },
		],
	},
];

const availableLocales = [{ id: "en" }, { id: "es" }];

describe("validateProjectConfiguration", () => {
	test("accepts a well-formed configuration", () => {
		const errors = validateProjectConfiguration(
			baseConfig,
			availableLocales,
			[],
		);
		expect(errors).toEqual([]);
	});

	test("rejects an unknown active extension profile", () => {
		const errors = validateProjectConfiguration(
			{ ...baseConfig, activeExtensionProfileId: "ghost" },
			availableLocales,
			[],
		);
		expect(errors).toEqual([
			"Active extension profile 'ghost' is not defined in extensionProfiles",
		]);
	});

	test("rejects profile memberships that reference unknown extensions", () => {
		const errors = validateProjectConfiguration(
			{
				...baseConfig,
				extensionProfiles: { default: ["ext.a", "ext.missing"] },
			},
			availableLocales,
			[],
		);
		expect(errors).toEqual([
			"Extension profile 'default' references unknown extension 'ext.missing'",
		]);
	});

	test("rejects a locale that is not available", () => {
		const errors = validateProjectConfiguration(
			{ ...baseConfig, uiLocale: "fr" },
			availableLocales,
			[],
		);
		expect(errors).toEqual(["Locale 'fr' is not an available locale"]);
	});

	test("validates project settings against the contribution schema", () => {
		const errors = validateProjectConfiguration(
			{
				...baseConfig,
				projectSettings: {
					"ext.a": {
						theme: 5,
						mode: "blue",
						count: "many",
						enabled: "yes",
					},
				},
			},
			availableLocales,
			contributions,
		);
		expect(errors).toEqual([
			"Project setting 'ext.a.theme' must be a string",
			"Project setting 'ext.a.mode' must be one of: light, dark",
			"Project setting 'ext.a.count' must be a finite number",
			"Project setting 'ext.a.enabled' must be a boolean",
		]);
	});

	test("accepts project settings that satisfy the schema", () => {
		const errors = validateProjectConfiguration(
			{
				...baseConfig,
				projectSettings: {
					"ext.a": { theme: "solar", mode: "dark", count: 3, enabled: true },
				},
			},
			availableLocales,
			contributions,
		);
		expect(errors).toEqual([]);
	});
});
