import { describe, expect, test } from "bun:test";
import type {
	ProjectConfigurationDto,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import { validateProjectConfiguration } from "../src/server/project-configuration-validation";

const baseConfig: ProjectConfigurationDto = {
	formatVersion: 2,
	projectId: "project-1",
	displayName: "Project",
	backend: { kind: "jsonl", path: ".macro/state.jsonl" },
	activeExtensionGroupId: "default",
	uiLocale: "en",
	extensions: [{ id: "ext.a", source: "builtin", version: "1.0.0" }],
	extensionGroups: {
		default: {
			id: "default",
			displayName: "Default",
			source: "project",
			extensionIds: ["ext.a"],
		},
	},
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

	test("rejects an unknown active extension group", () => {
		const errors = validateProjectConfiguration(
			{ ...baseConfig, activeExtensionGroupId: "ghost" },
			availableLocales,
			[],
		);
		expect(errors).toEqual([
			"Active extension activation group 'ghost' does not exist",
		]);
	});

	test("rejects a group with an empty display name", () => {
		const errors = validateProjectConfiguration(
			{
				...baseConfig,
				extensionGroups: {
					default: {
						id: "default",
						displayName: "",
						source: "project",
						extensionIds: ["ext.a"],
					},
				},
			},
			availableLocales,
			[],
		);
		expect(errors).toEqual([
			"Extension activation group 'default' requires a display name",
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
