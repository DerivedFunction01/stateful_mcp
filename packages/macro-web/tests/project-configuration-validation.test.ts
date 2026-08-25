import { describe, expect, test } from "bun:test";
import type {
	ProjectConfigurationDto,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import {
	validateProjectConfiguration,
	validateProjectConfigurationDetailed,
} from "../src/server/project-configuration-validation";

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

function errorCodes(result: {
	readonly groupDiagnostics: readonly { readonly code: string }[];
	readonly diagnostics: readonly { readonly code: string }[];
}): string[] {
	return [
		...result.groupDiagnostics.map((d) => d.code),
		...result.diagnostics.map((d) => d.code),
	];
}

describe("validateProjectConfiguration", () => {
	test("accepts a well-formed configuration", () => {
		const result = validateProjectConfiguration(
			baseConfig,
			availableLocales,
			[],
		);
		expect(result.groupDiagnostics).toEqual([]);
		expect(result.diagnostics).toEqual([]);
		expect(errorCodes(result)).toEqual([]);
	});

	test("rejects an unknown active extension group", () => {
		const result = validateProjectConfigurationDetailed(
			{ ...baseConfig, activeExtensionGroupId: "ghost" },
			availableLocales,
			[],
		);
		expect(errorCodes(result)).toContain(
			"project.extensionGroup.unknownActiveGroup",
		);
	});

	test("rejects a group with an empty display name", () => {
		const result = validateProjectConfigurationDetailed(
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
		expect(errorCodes(result)).toContain(
			"project.extensionGroup.emptyDisplayName",
		);
	});

	test("rejects a locale that is not available", () => {
		const result = validateProjectConfigurationDetailed(
			{ ...baseConfig, uiLocale: "fr" },
			availableLocales,
			[],
		);
		const localeDiagnostic = result.diagnostics.find(
			(d) => d.code === "project.configuration.localeUnavailable",
		);
		expect(localeDiagnostic).toBeDefined();
		expect(localeDiagnostic?.messageKey).toBe(
			"project.configuration.localeUnavailable",
		);
		expect(localeDiagnostic?.messageParams).toEqual({ locale: "fr" });
	});

	test("validates project settings against the contribution schema", () => {
		const result = validateProjectConfigurationDetailed(
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
		const keys = result.diagnostics.map((d) => d.messageKey).sort();
		expect(keys).toEqual([
			"project.configuration.settingType.boolean",
			"project.configuration.settingType.enum",
			"project.configuration.settingType.number",
			"project.configuration.settingType.string",
		]);
		const enumDiagnostic = result.diagnostics.find(
			(d) => d.messageKey === "project.configuration.settingType.enum",
		);
		expect(enumDiagnostic?.messageParams).toEqual({
			namespace: "ext.a",
			path: "mode",
			options: "light, dark",
		});
	});

	test("accepts project settings that satisfy the schema", () => {
		const result = validateProjectConfigurationDetailed(
			{
				...baseConfig,
				projectSettings: {
					"ext.a": { theme: "solar", mode: "dark", count: 3, enabled: true },
				},
			},
			availableLocales,
			contributions,
		);
		expect(result.diagnostics).toEqual([]);
	});
});
