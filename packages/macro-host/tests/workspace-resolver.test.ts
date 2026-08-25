import { describe, expect, test } from "bun:test";
import {
	type MacroWorkspaceManifest,
	resolveWorkspaceExtensions,
	validateWorkspaceManifest,
} from "../src";

function manifest(
	overrides: Partial<MacroWorkspaceManifest> = {},
): MacroWorkspaceManifest {
	return { extensions: [], ...overrides };
}

function group(id: string, extensionIds: readonly string[]) {
	return { id, displayName: id, extensionIds, source: "project" as const };
}

describe("resolveWorkspaceExtensions dependency closure", () => {
	test("selects every declared extension when no group is active", () => {
		const result = resolveWorkspaceExtensions(
			manifest({
				extensions: [
					{ id: "a", source: "a.ts", version: "1.0.0" },
					{ id: "b", source: "b.ts", version: "1.0.0" },
				],
			}),
		);
		expect(result.activeExtensionGroupId).toBeUndefined();
		expect(result.extensions.map((item) => item.id)).toEqual(["a", "b"]);
		expect(result.resolution.resolvedExtensionIds).toEqual(["a", "b"]);
	});

	test("pulls the full transitive closure for a selected leaf group", () => {
		const result = resolveWorkspaceExtensions(
			manifest({
				extensions: [
					{ id: "root", source: "root.ts", version: "1.0.0" },
					{ id: "mid", source: "mid.ts", version: "1.0.0", requires: ["root"] },
					{
						id: "leaf",
						source: "leaf.ts",
						version: "1.0.0",
						requires: ["mid"],
					},
				],
				extensionGroups: { leaf: group("leaf", ["leaf"]) },
				activeExtensionGroupId: "leaf",
			}),
		);
		expect(result.activeExtensionGroupId).toBe("leaf");
		expect(new Set(result.resolution.resolvedExtensionIds)).toEqual(
			new Set(["root", "mid", "leaf"]),
		);
		expect(result.resolution.directExtensionIds).toEqual(["leaf"]);
		expect(result.resolution.automaticallyIncludedExtensionIds).toEqual([
			"root",
			"mid",
		]);
	});

	test("closure is complete for diamond dependencies", () => {
		const result = resolveWorkspaceExtensions(
			manifest({
				extensions: [
					{ id: "root", source: "root.ts", version: "1.0.0" },
					{
						id: "left",
						source: "left.ts",
						version: "1.0.0",
						requires: ["root"],
					},
					{
						id: "right",
						source: "right.ts",
						version: "1.0.0",
						requires: ["root"],
					},
					{
						id: "top",
						source: "top.ts",
						version: "1.0.0",
						requires: ["left", "right"],
					},
				],
				extensionGroups: { top: group("top", ["top"]) },
			}),
		);
		expect(result.resolution.resolvedExtensionIds).toEqual([
			"root",
			"left",
			"right",
			"top",
		]);
	});

	test("excludes extensions not reachable from the selected group", () => {
		const result = resolveWorkspaceExtensions(
			manifest({
				extensions: [
					{ id: "a", source: "a.ts", version: "1.0.0" },
					{ id: "b", source: "b.ts", version: "1.0.0" },
					{ id: "c", source: "c.ts", version: "1.0.0" },
				],
				extensionGroups: { "only-a": group("only-a", ["a"]) },
				activeExtensionGroupId: "only-a",
			}),
		);
		expect(result.resolution.resolvedExtensionIds).toEqual(["a"]);
		expect(result.resolution.excludedExtensionIds).toEqual(["b", "c"]);
	});

	test("explicit group id overrides the manifest active group and never mutates it", () => {
		const input = manifest({
			extensions: [
				{ id: "a", source: "a.ts", version: "1.0.0" },
				{ id: "b", source: "b.ts", version: "1.0.0" },
			],
			extensionGroups: { a: group("a", ["a"]), b: group("b", ["b"]) },
			activeExtensionGroupId: "a",
		});
		const result = resolveWorkspaceExtensions(input, "b");
		expect(result.activeExtensionGroupId).toBe("b");
		expect(result.resolution.resolvedExtensionIds).toEqual(["b"]);
		expect(input.activeExtensionGroupId).toBe("a");
	});
});

describe("resolveWorkspaceExtensions ordering contract", () => {
	test("returns a dependency-first activation order and manifest-declaration order", () => {
		const result = resolveWorkspaceExtensions(
			manifest({
				extensions: [
					{
						id: "leaf",
						source: "leaf.ts",
						version: "1.0.0",
						requires: ["mid"],
					},
					{ id: "mid", source: "mid.ts", version: "1.0.0", requires: ["root"] },
					{ id: "root", source: "root.ts", version: "1.0.0" },
				],
				extensionGroups: { leaf: group("leaf", ["leaf"]) },
				activeExtensionGroupId: "leaf",
			}),
		);
		expect(result.resolution.activationOrder).toEqual(["root", "mid", "leaf"]);
		// The resolved extension list preserves manifest declaration order.
		expect(result.extensions.map((item) => item.id)).toEqual([
			"leaf",
			"mid",
			"root",
		]);
	});
});

describe("resolveWorkspaceExtensions diagnostics", () => {
	test("throws on a cyclic extension dependency", () => {
		expect(() =>
			resolveWorkspaceExtensions(
				manifest({
					extensions: [
						{ id: "a", source: "a.ts", version: "1.0.0", requires: ["b"] },
						{ id: "b", source: "b.ts", version: "1.0.0", requires: ["a"] },
					],
					extensionGroups: { both: group("both", ["a"]) },
				}),
				"both",
			),
		).toThrow(/project\.extensionGroup\.dependencyCycle/u);
	});

	test("throws when a selected extension requires an undeclared extension", () => {
		expect(() =>
			resolveWorkspaceExtensions(
				manifest({
					extensions: [
						{
							id: "a",
							source: "a.ts",
							version: "1.0.0",
							requires: ["missing"],
						},
					],
					extensionGroups: { a: group("a", ["a"]) },
				}),
				"a",
			),
		).toThrow("project.extensionGroup.missingDependency");
	});

	test("throws when an explicitly selected group is unknown", () => {
		expect(() =>
			resolveWorkspaceExtensions(
				manifest({
					extensions: [{ id: "a", source: "a.ts", version: "1.0.0" }],
					extensionGroups: { real: group("real", ["a"]) },
				}),
				"ghost",
			),
		).toThrow("project.extensionGroup.unknownGroup");
	});

	test("validateWorkspaceManifest throws when a group references an undeclared extension", () => {
		expect(() =>
			validateWorkspaceManifest(
				manifest({
					extensions: [{ id: "a", source: "a.ts", version: "1.0.0" }],
					extensionGroups: { bad: group("bad", ["a", "ghost"]) },
				}),
			),
		).toThrow("project.extensionGroup.unknownExtension");
	});

	test("validateWorkspaceManifest throws on a duplicate group id", () => {
		expect(() =>
			validateWorkspaceManifest(
				manifest({
					extensions: [{ id: "a", source: "a.ts", version: "1.0.0" }],
					extensionGroups: {
						dup: group("dup", ["a"]),
						dupAgain: group("dup", ["a"]),
					},
				}),
			),
		).toThrow("project.extensionGroup.duplicateGroupId");
	});

	test("validateWorkspaceManifest throws on a group key/id mismatch", () => {
		expect(() =>
			validateWorkspaceManifest(
				manifest({
					extensions: [{ id: "a", source: "a.ts", version: "1.0.0" }],
					extensionGroups: {
						keyOnly: {
							id: "different",
							displayName: "different",
							extensionIds: ["a"],
							source: "project",
						},
					},
				}),
			),
		).toThrow("project.extensionGroup.groupIdMismatch");
	});

	test("validateWorkspaceManifest throws on an invalid group id", () => {
		expect(() =>
			validateWorkspaceManifest(
				manifest({
					extensions: [{ id: "a", source: "a.ts", version: "1.0.0" }],
					extensionGroups: { "Bad Id": group("Bad Id", ["a"]) },
				}),
			),
		).toThrow("project.extensionGroup.invalidGroupId");
	});

	test("validateWorkspaceManifest throws when the active group is unknown", () => {
		expect(() =>
			validateWorkspaceManifest(
				manifest({
					extensions: [{ id: "a", source: "a.ts", version: "1.0.0" }],
					extensionGroups: { real: group("real", ["a"]) },
					activeExtensionGroupId: "ghost",
				}),
			),
		).toThrow("project.extensionGroup.unknownActiveGroup");
	});

	test("validateWorkspaceManifest throws on a duplicate extension id in the manifest", () => {
		expect(() =>
			validateWorkspaceManifest(
				manifest({
					extensions: [
						{ id: "a", source: "a.ts", version: "1.0.0" },
						{ id: "a", source: "a2.ts", version: "2.0.0" },
					],
				}),
			),
		).toThrow("Duplicate workspace extension 'a'");
	});

	test("validateWorkspaceManifest throws when an extension entry is missing id, source, or version", () => {
		expect(() =>
			validateWorkspaceManifest(
				manifest({
					extensions: [{ id: "a", source: "a.ts" }] as never,
				}),
			),
		).toThrow("Each workspace extension requires id, source, and version");
	});

	test("validateWorkspaceManifest throws when the manifest has no extensions array", () => {
		expect(() => validateWorkspaceManifest({} as never)).toThrow(
			"Workspace manifest requires an extensions array",
		);
	});
});
