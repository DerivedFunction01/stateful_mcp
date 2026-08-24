import { describe, expect, test } from "bun:test";
import {
	computeProjectExtensionGroupImpact,
	type ProjectExtensionActivationGroup,
	type ProjectExtensionActivationGroupMap,
	type ProjectExtensionCatalogEntry,
	type ProjectExtensionGroupDiagnosticCode,
	resolveProjectExtensionGroup,
	validateProjectExtensionGroups,
} from "../src";

const EXT = (
	id: string,
	requires: string[] = [],
): ProjectExtensionCatalogEntry => ({
	id,
	requires,
});

function codes(
	diagnostics: readonly { readonly code: string }[],
): ProjectExtensionGroupDiagnosticCode[] {
	return diagnostics.map((d) => d.code as ProjectExtensionGroupDiagnosticCode);
}

function group(
	id: string,
	extensionIds: string[],
): ProjectExtensionActivationGroup {
	return { id, displayName: id, extensionIds, source: "project" as const };
}

function map(
	entries: [string, string[]][],
): ProjectExtensionActivationGroupMap {
	return Object.fromEntries(entries.map(([id, ext]) => [id, group(id, ext)]));
}

describe("resolveProjectExtensionGroup dependency closure", () => {
	test("selects every declared extension when no group is given", () => {
		const resolution = resolveProjectExtensionGroup({
			extensions: [EXT("a"), EXT("b"), EXT("c")],
		});
		expect(resolution.resolvedExtensionIds).toEqual(["a", "b", "c"]);
		expect(resolution.directExtensionIds).toEqual(["a", "b", "c"]);
		expect(resolution.automaticallyIncludedExtensionIds).toEqual([]);
		expect(resolution.valid).toBe(true);
	});

	test("pulls the full transitive closure for a selected leaf", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "leaf",
			groups: { leaf: group("leaf", ["leaf"]) },
			extensions: [EXT("root"), EXT("mid", ["root"]), EXT("leaf", ["mid"])],
		});
		expect(new Set(resolution.resolvedExtensionIds)).toEqual(
			new Set(["root", "mid", "leaf"]),
		);
		expect(resolution.directExtensionIds).toEqual(["leaf"]);
		expect(resolution.automaticallyIncludedExtensionIds).toEqual([
			"root",
			"mid",
		]);
	});

	test("closure is complete for diamond dependencies without duplicates", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "top",
			groups: { top: group("top", ["top"]) },
			extensions: [
				EXT("root"),
				EXT("left", ["root"]),
				EXT("right", ["root"]),
				EXT("top", ["left", "right"]),
			],
		});
		expect(resolution.resolvedExtensionIds).toEqual([
			"root",
			"left",
			"right",
			"top",
		]);
	});

	test("excludes extensions not reachable from the selected group", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "onlyA",
			groups: { onlyA: group("onlyA", ["a"]) },
			extensions: [EXT("a"), EXT("b"), EXT("c")],
		});
		expect(resolution.resolvedExtensionIds).toEqual(["a"]);
		expect(resolution.excludedExtensionIds).toEqual(["b", "c"]);
	});

	test("marks automatically included members as automatic in memberships", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "leaf",
			groups: { leaf: group("leaf", ["leaf"]) },
			extensions: [EXT("root"), EXT("mid", ["root"]), EXT("leaf", ["mid"])],
		});
		const byId = new Map(resolution.memberships.map((m) => [m.extensionId, m]));
		expect(byId.get("leaf")?.kind).toBe("direct");
		expect(byId.get("mid")?.kind).toBe("automatic");
		expect(byId.get("root")?.kind).toBe("automatic");
		expect(byId.get("leaf")?.requiredBy).toEqual([]);
		expect(byId.get("mid")?.requiredBy).toEqual(["leaf"]);
		expect(byId.get("root")?.requiredBy).toEqual(["mid"]);
	});
});

describe("resolveProjectExtensionGroup activation ordering", () => {
	test("returns a dependency-first activation order", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "leaf",
			groups: { leaf: group("leaf", ["leaf"]) },
			extensions: [EXT("root"), EXT("mid", ["root"]), EXT("leaf", ["mid"])],
		});
		expect(resolution.activationOrder).toEqual(["root", "mid", "leaf"]);
		expect(resolution.activationOrder).toEqual(resolution.resolvedExtensionIds);
	});

	test("ordering is independent of declaration order", () => {
		const declared = [EXT("leaf", ["mid"]), EXT("mid", ["root"]), EXT("root")];
		const shuffled = [EXT("mid", ["root"]), EXT("root"), EXT("leaf", ["mid"])];
		const a = resolveProjectExtensionGroup({
			groupId: "leaf",
			groups: { leaf: group("leaf", ["leaf"]) },
			extensions: declared,
		});
		const b = resolveProjectExtensionGroup({
			groupId: "leaf",
			groups: { leaf: group("leaf", ["leaf"]) },
			extensions: shuffled,
		});
		expect(a.activationOrder).toEqual(b.activationOrder);
		expect(a.resolvedExtensionIds).toEqual(b.resolvedExtensionIds);
	});

	test("direct members are visited in a deterministic sort", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["c", "a", "b"]) },
			extensions: [EXT("a"), EXT("b"), EXT("c")],
		});
		expect(resolution.directExtensionIds).toEqual(["a", "b", "c"]);
		expect(resolution.activationOrder).toEqual(["a", "b", "c"]);
	});

	test("staged direct membership overrides the persisted group", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["a"]) },
			extensions: [EXT("a"), EXT("b")],
			directExtensionIds: ["b"],
		});
		expect(resolution.directExtensionIds).toEqual(["b"]);
		expect(resolution.resolvedExtensionIds).toEqual(["b"]);
	});
});

describe("resolveProjectExtensionGroup diagnostics", () => {
	test("reports an unknown group id as an error", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "ghost",
			groups: { real: group("real", ["a"]) },
			extensions: [EXT("a")],
		});
		expect(codes(resolution.diagnostics)).toContain(
			"project.extensionGroup.unknownGroup",
		);
		expect(resolution.valid).toBe(false);
		expect(resolution.resolvedExtensionIds).toEqual([]);
	});

	test("reports an undeclared direct member as an error", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["missing"]) },
			extensions: [EXT("a")],
		});
		expect(codes(resolution.diagnostics)).toContain(
			"project.extensionGroup.unknownExtension",
		);
		expect(resolution.unknownExtensionIds).toEqual(["missing"]);
		expect(resolution.valid).toBe(false);
	});

	test("reports a missing required dependency as an error", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["a"]) },
			extensions: [EXT("a", ["absent"])],
		});
		expect(codes(resolution.diagnostics)).toContain(
			"project.extensionGroup.missingDependency",
		);
		expect(resolution.valid).toBe(false);
	});

	test("reports a dependency cycle as an error and stays invalid", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["a"]) },
			extensions: [EXT("a", ["b"]), EXT("b", ["a"])],
		});
		expect(codes(resolution.diagnostics)).toContain(
			"project.extensionGroup.dependencyCycle",
		);
		expect(resolution.valid).toBe(false);
	});

	test("flags unavailable and incompatible extensions as errors", () => {
		const missingExt: ProjectExtensionCatalogEntry = {
			...EXT("m"),
			availability: "missing",
		};
		const missing = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["m"]) },
			extensions: [missingExt],
		});
		expect(codes(missing.diagnostics)).toContain(
			"project.extensionGroup.unavailableExtension",
		);
		const incompatibleExt: ProjectExtensionCatalogEntry = {
			...EXT("i"),
			availability: "incompatible",
		};
		const incompatible = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["i"]) },
			extensions: [incompatibleExt],
		});
		expect(codes(incompatible.diagnostics)).toContain(
			"project.extensionGroup.incompatibleExtension",
		);
	});

	test("treats a duplicate direct member as a warning, not a failure", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "g",
			groups: { g: group("g", ["a", "a"]) },
			extensions: [EXT("a")],
		});
		expect(codes(resolution.diagnostics)).toContain(
			"project.extensionGroup.duplicateMember",
		);
		expect(resolution.diagnostics.some((d) => d.severity === "error")).toBe(
			false,
		);
		expect(resolution.valid).toBe(true);
		expect(resolution.directExtensionIds).toEqual(["a"]);
	});

	test("reports an empty group as info only", () => {
		const resolution = resolveProjectExtensionGroup({
			groupId: "empty",
			groups: { empty: group("empty", []) },
			extensions: [EXT("a")],
		});
		expect(codes(resolution.diagnostics)).toContain(
			"project.extensionGroup.emptyGroup",
		);
		expect(resolution.valid).toBe(true);
	});
});

describe("validateProjectExtensionGroups", () => {
	test("accepts a well-formed group map", () => {
		const diagnostics = validateProjectExtensionGroups({
			groups: map([["core", ["a", "b"]]]),
			extensions: [EXT("a"), EXT("b")],
		});
		expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});

	test("reports an invalid group id", () => {
		const diagnostics = validateProjectExtensionGroups({
			groups: map([["Bad Id", ["a"]]]),
			extensions: [EXT("a")],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.invalidGroupId",
		);
	});

	test("reports a group key/id mismatch", () => {
		const groups = {
			keyOnly: group("different", ["a"]),
		} as ProjectExtensionActivationGroupMap;
		const diagnostics = validateProjectExtensionGroups({
			groups,
			extensions: [EXT("a")],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.groupIdMismatch",
		);
	});

	test("reports a duplicate group id", () => {
		const diagnostics = validateProjectExtensionGroups({
			groups: {
				...map([["a", ["x"]]]),
				dup: group("a", ["x"]),
			},
			extensions: [EXT("x")],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.duplicateGroupId",
		);
	});

	test("reports a missing display name", () => {
		const groups = {
			g: { ...group("g", ["a"]), displayName: "" },
		} as ProjectExtensionActivationGroupMap;
		const diagnostics = validateProjectExtensionGroups({
			groups,
			extensions: [EXT("a")],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.emptyDisplayName",
		);
	});

	test("reports an unknown group source", () => {
		const groups = {
			g: { ...group("g", ["a"]), source: "bogus" },
		} as unknown as ProjectExtensionActivationGroupMap;
		const diagnostics = validateProjectExtensionGroups({
			groups,
			extensions: [EXT("a")],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.invalidSource",
		);
	});

	test("reports a reserved group id shadowed by a project group", () => {
		const diagnostics = validateProjectExtensionGroups({
			groups: map([["builtin", ["a"]]]),
			extensions: [EXT("a")],
			reservedGroupIds: ["builtin"],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.reservedGroupId",
		);
	});

	test("reports an unknown active group id", () => {
		const diagnostics = validateProjectExtensionGroups({
			groups: map([["core", ["a"]]]),
			activeGroupId: "ghost",
			extensions: [EXT("a")],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.unknownActiveGroup",
		);
	});

	test("propagates per-group resolution errors (missing dependency)", () => {
		const diagnostics = validateProjectExtensionGroups({
			groups: map([["g", ["a"]]]),
			extensions: [EXT("a", ["absent"])],
		});
		expect(codes(diagnostics)).toContain(
			"project.extensionGroup.missingDependency",
		);
	});
});

describe("computeProjectExtensionGroupImpact", () => {
	test("reports no reload when the activation order is unchanged", () => {
		const impact = computeProjectExtensionGroupImpact(
			["root", "mid", "leaf"],
			["root", "mid", "leaf"],
		);
		expect(impact.requiresReload).toBe(false);
		expect(impact.activatedExtensionIds).toEqual([]);
		expect(impact.deactivatedExtensionIds).toEqual([]);
		expect(impact.unchangedExtensionIds).toEqual(["root", "mid", "leaf"]);
	});

	test("reports a reload when new extensions are activated", () => {
		const impact = computeProjectExtensionGroupImpact(["a"], ["a", "b"]);
		expect(impact.requiresReload).toBe(true);
		expect(impact.activatedExtensionIds).toEqual(["b"]);
		expect(impact.deactivatedExtensionIds).toEqual([]);
	});

	test("reports a reload when extensions are deactivated", () => {
		const impact = computeProjectExtensionGroupImpact(["a", "b"], ["a"]);
		expect(impact.requiresReload).toBe(true);
		expect(impact.deactivatedExtensionIds).toEqual(["b"]);
		expect(impact.activatedExtensionIds).toEqual([]);
	});

	test("reports a reload when only the order changes", () => {
		const impact = computeProjectExtensionGroupImpact(["a", "b"], ["b", "a"]);
		expect(impact.requiresReload).toBe(true);
		expect(impact.activatedExtensionIds).toEqual([]);
		expect(impact.deactivatedExtensionIds).toEqual([]);
	});
});
