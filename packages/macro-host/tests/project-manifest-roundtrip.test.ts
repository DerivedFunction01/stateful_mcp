import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createMacroProject,
	loadMacroWorkspace,
	MacroProjectConflictError,
	MacroProjectFormatError,
	type MacroProjectManifest,
	openMacroProject,
	validateMacroProjectManifest,
} from "../src";

async function tmpRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), "macro-project-"));
}

const MODULE = (id: string, requires: string[] = []): string =>
	`export default {\n` +
	`  manifest: { id: '${id}', version: '1.0.0'${
		requires.length
			? `, requires: [${requires.map((r) => `'${r}'`).join(", ")}]`
			: ""
	} },\n` +
	`  activate() { return {}; },\n` +
	`};\n`;

const GROUP = (id: string, extensionIds: readonly string[]) => ({
	id,
	displayName: id,
	extensionIds,
	source: "project" as const,
});

describe("Macro project manifest roundtrip", () => {
	test("persists identity and extensions across create/open", async () => {
		const root = await tmpRoot();
		const created = await createMacroProject({
			rootPath: root,
			displayName: "Roundtrip",
			extensions: [
				{ id: "a", source: "./extensions/a.ts", version: "1.0.0" },
				{
					id: "b",
					source: "./extensions/b.ts",
					version: "1.0.0",
					requires: ["a"],
				},
			],
		});
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.manifest.projectId).toBe(created.manifest.projectId);
		expect(reopened.manifest.displayName).toBe("Roundtrip");
		expect(reopened.manifest.formatVersion).toBe(2);
		expect(reopened.manifest.extensions).toEqual(created.manifest.extensions);
		expect(reopened.descriptor.revision).toBe(created.descriptor.revision);
		await reopened.close();
	});

	test("rejects creating a project over an existing one", async () => {
		const root = await tmpRoot();
		await createMacroProject({ rootPath: root });
		await expect(createMacroProject({ rootPath: root })).rejects.toThrow(
			MacroProjectConflictError,
		);
	});

	test("roundtrips extension groups and the active group through saveManifest", async () => {
		const root = await tmpRoot();
		const project = await createMacroProject({
			rootPath: root,
			extensions: [
				{ id: "a", source: "./extensions/a.ts", version: "1.0.0" },
				{ id: "b", source: "./extensions/b.ts", version: "1.0.0" },
				{ id: "c", source: "./extensions/c.ts", version: "1.0.0" },
			],
		});
		const updated: MacroProjectManifest = {
			...project.manifest,
			extensionGroups: {
				leaf: GROUP("leaf", ["c"]),
				all: GROUP("all", ["a", "b", "c"]),
			},
			activeExtensionGroupId: "leaf",
		};
		const before = project.descriptor.revision;
		const saved = await project.saveManifest(updated, before);
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.manifest.extensionGroups).toEqual({
			leaf: GROUP("leaf", ["c"]),
			all: GROUP("all", ["a", "b", "c"]),
		});
		expect(reopened.manifest.activeExtensionGroupId).toBe("leaf");
		expect(saved.descriptor.revision).not.toBe(before);
		await reopened.close();
	});

	test("rejects a stale manifest save", async () => {
		const root = await tmpRoot();
		const project = await createMacroProject({ rootPath: root });
		const stale = project.descriptor.revision;
		await writeFile(
			join(root, ".macro", "project.json"),
			JSON.stringify({ ...project.manifest, displayName: "Other" }, null, 2),
		);
		await expect(
			project.saveManifest({ ...project.manifest, displayName: "Next" }, stale),
		).rejects.toThrow(MacroProjectConflictError);
	});

	test("rejects an invalid manifest on open", async () => {
		const root = await tmpRoot();
		await mkdir(join(root, ".macro"), { recursive: true });
		await writeFile(
			join(root, ".macro", "project.json"),
			JSON.stringify({ formatVersion: 999, projectId: "x", displayName: "y" }),
		);
		await expect(openMacroProject({ rootPath: root })).rejects.toThrow(
			MacroProjectFormatError,
		);
	});
});

describe("project manifest through the workspace resolver", () => {
	test("resolves project extension closure through loadMacroWorkspace", async () => {
		const root = await tmpRoot();
		const project = await createMacroProject({
			rootPath: root,
			extensions: [
				{ id: "a", source: "./extensions/a.ts", version: "1.0.0" },
				{
					id: "b",
					source: "./extensions/b.ts",
					version: "1.0.0",
					requires: ["a"],
				},
				{
					id: "c",
					source: "./extensions/c.ts",
					version: "1.0.0",
					requires: ["b"],
				},
			],
		});
		const extDir = join(root, ".macro", "extensions");
		await mkdir(extDir, { recursive: true });
		for (const entry of [
			["a", []],
			["b", ["a"]],
			["c", ["b"]],
		] satisfies [string, string[]][]) {
			await writeFile(
				join(extDir, `${entry[0]}.ts`),
				MODULE(entry[0], entry[1]),
			);
		}
		const updated: MacroProjectManifest = {
			...project.manifest,
			extensionGroups: {
				leaf: GROUP("leaf", ["c"]),
				all: GROUP("all", ["a", "b", "c"]),
			},
			activeExtensionGroupId: "leaf",
		};
		await project.saveManifest(updated, project.descriptor.revision);
		const loaded = await loadMacroWorkspace({ projectRoot: root });
		expect(new Set(loaded.resolvedExtensionIds)).toEqual(
			new Set(["a", "b", "c"]),
		);
		expect(loaded.loadedExtensions).toHaveLength(3);
		expect(loaded.extensionGroupResolution.resolvedExtensionIds).toEqual([
			"a",
			"b",
			"c",
		]);
		await loaded.workspace.dispose();
		await project.close();
	});

	test("rejects a project whose active group selects an undeclared extension", async () => {
		const root = await tmpRoot();
		const project = await createMacroProject({
			rootPath: root,
			extensions: [{ id: "a", source: "./extensions/a.ts", version: "1.0.0" }],
		});
		const extDir = join(root, ".macro", "extensions");
		await mkdir(extDir, { recursive: true });
		await writeFile(join(extDir, "a.ts"), MODULE("a"));
		const updated: MacroProjectManifest = {
			...project.manifest,
			extensionGroups: { broken: GROUP("broken", ["a", "ghost"]) },
			activeExtensionGroupId: "broken",
		};
		// Group validation runs when the manifest is persisted, so the bad
		// membership is rejected at save time rather than at load time.
		await expect(
			project.saveManifest(updated, project.descriptor.revision),
		).rejects.toThrow(/project\.extensionGroup\.unknownExtension/u);
		await project.close();
	});
});

describe("validateMacroProjectManifest diagnostics", () => {
	const base: MacroProjectManifest = {
		formatVersion: 2,
		projectId: "p",
		displayName: "p",
		backend: { kind: "jsonl", path: ".macro/state.jsonl" },
		extensions: [],
		resources: [],
		historyResources: [],
	};

	test("accepts a well-formed manifest", () => {
		expect(() => validateMacroProjectManifest(base)).not.toThrow();
	});

	test("rejects an unsupported format version", () => {
		expect(() =>
			validateMacroProjectManifest({ ...base, formatVersion: 3 }),
		).toThrow(/Unsupported Macro project format version/u);
	});

	test("rejects a missing identity", () => {
		expect(() =>
			validateMacroProjectManifest({
				...base,
				projectId: "",
				displayName: "",
			}),
		).toThrow("Project manifest requires identity metadata");
	});

	test("rejects an invalid backend", () => {
		expect(() =>
			validateMacroProjectManifest({
				...base,
				backend: { kind: "tape" as never, path: "" },
			}),
		).toThrow("Project manifest has an invalid backend");
	});

	test("rejects missing resource arrays", () => {
		expect(() =>
			validateMacroProjectManifest({
				...base,
				extensions: undefined as never,
			}),
		).toThrow("Project manifest has invalid resource data");
		expect(() =>
			validateMacroProjectManifest({
				...base,
				historyResources: undefined as never,
			}),
		).toThrow("Project manifest requires history resources");
	});
});
