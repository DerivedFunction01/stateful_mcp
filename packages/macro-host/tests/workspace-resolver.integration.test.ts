import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMacroWorkspace } from "../src";

const EXTENSION = (id: string, requires: string[] = []): string =>
	`export default {\n` +
	`  manifest: { id: '${id}', version: '1.0.0'${
		requires.length
			? `, requires: [${requires.map((r) => `'${r}'`).join(", ")}]`
			: ""
	} },\n` +
	`  activate() { return {}; },\n` +
	`};\n`;

const GROUP = (id: string, extensionIds: string[]) => ({
	id,
	displayName: id,
	extensionIds,
	source: "project" as const,
});

async function scaffoldWorkspace(spec: {
	extensions: { id: string; requires?: string[] }[];
	groups?: Record<string, string[]>;
	activeExtensionGroupId?: string;
}): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "macro-resolver-"));
	const extensionsDir = join(root, "extensions");
	await mkdir(extensionsDir);
	for (const entry of spec.extensions) {
		await writeFile(
			join(extensionsDir, `${entry.id}.ts`),
			EXTENSION(entry.id, entry.requires ?? []),
		);
	}
	const manifest = {
		extensions: spec.extensions.map((entry) => ({
			id: entry.id,
			source: `./extensions/${entry.id}.ts`,
			version: "1.0.0",
			...(entry.requires ? { requires: entry.requires } : {}),
		})),
		...(spec.groups
			? {
					extensionGroups: Object.fromEntries(
						Object.entries(spec.groups).map(([id, ext]) => [
							id,
							GROUP(id, ext),
						]),
					),
				}
			: {}),
		...(spec.activeExtensionGroupId
			? { activeExtensionGroupId: spec.activeExtensionGroupId }
			: {}),
	};
	await writeFile(
		join(root, "workspace.json"),
		JSON.stringify(manifest, null, 2),
	);
	return root;
}

describe("loadMacroWorkspace resolver integration", () => {
	test("loads the full dependency closure selected by an active group", async () => {
		const root = await scaffoldWorkspace({
			extensions: [
				{ id: "root" },
				{ id: "mid", requires: ["root"] },
				{ id: "leaf", requires: ["mid"] },
			],
			groups: { leaf: ["leaf"] },
			activeExtensionGroupId: "leaf",
		});
		const loaded = await loadMacroWorkspace({
			workspacePath: join(root, "workspace.json"),
		});
		expect(new Set(loaded.resolvedExtensionIds)).toEqual(
			new Set(["root", "mid", "leaf"]),
		);
		expect(loaded.loadedExtensions).toHaveLength(3);
		expect(loaded.extensionGroupResolution.resolvedExtensionIds).toEqual([
			"root",
			"mid",
			"leaf",
		]);
		await loaded.workspace.dispose();
	});

	test("honors an explicit group id over the manifest active group", async () => {
		const root = await scaffoldWorkspace({
			extensions: [{ id: "a" }, { id: "b" }, { id: "c", requires: ["b"] }],
			groups: { a: ["a"], c: ["c"] },
			activeExtensionGroupId: "a",
		});
		const loaded = await loadMacroWorkspace({
			workspacePath: join(root, "workspace.json"),
			extensionGroupId: "c",
		});
		expect(loaded.activeExtensionGroupId).toBe("c");
		expect(new Set(loaded.resolvedExtensionIds)).toEqual(new Set(["b", "c"]));
		await loaded.workspace.dispose();
	});

	test("excludes extensions not reachable from the selected group", async () => {
		const root = await scaffoldWorkspace({
			extensions: [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }],
			groups: { "alpha-only": ["alpha"] },
			activeExtensionGroupId: "alpha-only",
		});
		const loaded = await loadMacroWorkspace({
			workspacePath: join(root, "workspace.json"),
		});
		expect(loaded.resolvedExtensionIds).toEqual(["alpha"]);
		await loaded.workspace.dispose();
	});

	test("rejects a manifest whose selected extension requires an undeclared extension", async () => {
		const root = await scaffoldWorkspace({
			extensions: [{ id: "a", requires: ["ghost"] }],
			groups: { a: ["a"] },
		});
		await expect(
			loadMacroWorkspace({ workspacePath: join(root, "workspace.json") }),
		).rejects.toThrow("does not declare");
	});

	test("rejects a cyclic extension dependency before loading", async () => {
		const root = await scaffoldWorkspace({
			extensions: [
				{ id: "a", requires: ["b"] },
				{ id: "b", requires: ["a"] },
			],
			groups: { both: ["a"] },
		});
		await expect(
			loadMacroWorkspace({ workspacePath: join(root, "workspace.json") }),
		).rejects.toThrow(/dependency cycle/u);
	});
});
