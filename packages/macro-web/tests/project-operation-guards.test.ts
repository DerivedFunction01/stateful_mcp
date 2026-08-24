import { describe, expect, test } from "bun:test";
import type { ProjectConfigurationDto } from "@stateful-mcp/macro-protocol";
import {
	isProjectConfigurationDto,
	parseApplyBackendMigration,
	parsePreviewBackendMigration,
	parseProjectAction,
	parseProjectDeletePayload,
	parseProjectPathPayload,
	parseProjectRenamePayload,
	parseProjectUpdateConfiguration,
} from "../src/server/project-operation-guards";

const validConfig: ProjectConfigurationDto = {
	formatVersion: 1,
	projectId: "p1",
	displayName: "Project",
	backend: { kind: "jsonl", path: ".macro/state.jsonl" },
	extensions: [],
	resources: [],
	historyResources: [],
	scratchpadResources: [],
	projectSettingsContributions: [],
	availableLocales: [],
	revision: "1",
};

describe("project operation guards", () => {
	test("isProjectConfigurationDto accepts a well-formed dto", () => {
		expect(isProjectConfigurationDto(validConfig)).toBe(true);
	});

	test("isProjectConfigurationDto rejects malformed values", () => {
		expect(isProjectConfigurationDto(null)).toBe(false);
		expect(
			isProjectConfigurationDto({ ...validConfig, backend: { kind: "xml" } }),
		).toBe(false);
		expect(isProjectConfigurationDto({ ...validConfig, revision: 1 })).toBe(
			false,
		);
	});

	test("parseProjectUpdateConfiguration validates the operation shape", () => {
		expect(
			parseProjectUpdateConfiguration({
				operation: "project.updateConfiguration",
				configuration: validConfig,
				expectedRevision: "1",
			}),
		).toEqual({ configuration: validConfig, expectedRevision: "1" });

		expect(
			parseProjectUpdateConfiguration({
				operation: "project.updateConfiguration",
				configuration: { ...validConfig, revision: 2 },
				expectedRevision: "1",
			}),
		).toBeUndefined();

		expect(
			parseProjectUpdateConfiguration({ operation: "other" }),
		).toBeUndefined();
	});

	test("parsePreviewBackendMigration validates the target backend", () => {
		expect(
			parsePreviewBackendMigration({
				operation: "project.previewBackendMigration",
				target: { kind: "sqlite", path: ".macro/s.db" },
			}),
		).toEqual({ target: { kind: "sqlite", path: ".macro/s.db" } });
		expect(
			parsePreviewBackendMigration({
				operation: "project.previewBackendMigration",
			}),
		).toBeUndefined();
	});

	test("parseApplyBackendMigration validates target and revision", () => {
		expect(
			parseApplyBackendMigration({
				operation: "project.applyBackendMigration",
				target: { kind: "sqlite", path: ".macro/s.db" },
				expectedRevision: "1",
			}),
		).toEqual({
			target: { kind: "sqlite", path: ".macro/s.db" },
			expectedRevision: "1",
		});
		expect(
			parseApplyBackendMigration({
				operation: "project.applyBackendMigration",
				target: { kind: "sqlite", path: ".macro/s.db" },
			}),
		).toBeUndefined();
	});

	test("parseProjectPathPayload validates parent and name", () => {
		expect(parseProjectPathPayload({ parentPath: "/a", name: "b" })).toEqual({
			parentPath: "/a",
			name: "b",
		});
		expect(
			parseProjectPathPayload({ parentPath: "", name: "b" }),
		).toBeUndefined();
		expect(parseProjectPathPayload({ parentPath: "/a" })).toBeUndefined();
		expect(parseProjectPathPayload(null)).toBeUndefined();
	});

	test("parseProjectRenamePayload validates source and destination", () => {
		expect(
			parseProjectRenamePayload({ source: "/a", destination: "/b" }),
		).toEqual({ source: "/a", destination: "/b" });
		expect(
			parseProjectRenamePayload({ source: "", destination: "/b" }),
		).toBeUndefined();
		expect(parseProjectRenamePayload({ source: "/a" })).toBeUndefined();
		expect(parseProjectRenamePayload(42)).toBeUndefined();
	});

	test("parseProjectDeletePayload validates the path", () => {
		expect(parseProjectDeletePayload({ path: "/a" })).toEqual({ path: "/a" });
		expect(parseProjectDeletePayload({ path: "" })).toBeUndefined();
		expect(parseProjectDeletePayload({ path: 1 })).toBeUndefined();
		expect(parseProjectDeletePayload(undefined)).toBeUndefined();
	});

	test("parseProjectAction validates the discriminator fields", () => {
		expect(
			parseProjectAction({ operation: "project.getConfiguration" }),
		).toEqual({ operation: "project.getConfiguration" });
		expect(
			parseProjectAction({ action: "open", path: "/p", displayName: "D" }),
		).toEqual({ action: "open", path: "/p", displayName: "D" });
		expect(
			parseProjectAction({
				operation: "project.previewBackendMigration",
				target: { kind: "sqlite", path: ".macro/s.db" },
			}),
		).toEqual({ operation: "project.previewBackendMigration" });
		expect(
			parseProjectAction({
				operation: "project.resumeBackendMigration",
			}),
		).toEqual({ operation: "project.resumeBackendMigration" });
		expect(parseProjectAction({ operation: 5 })).toBeUndefined();
		expect(parseProjectAction({ action: "teleport" })).toBeUndefined();
		expect(parseProjectAction({ path: 9 })).toBeUndefined();
		expect(parseProjectAction(null)).toBeUndefined();
	});
});
