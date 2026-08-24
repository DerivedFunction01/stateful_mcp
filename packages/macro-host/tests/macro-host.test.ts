import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	createMacroHost,
	type MacroWorkspaceManifest,
	resolveWorkspaceExtensions,
} from "../src";

describe("MacroHost", () => {
	test("creates isolated workspaces with different enabled domain extensions", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-host-"),
		);
		const extensions = join(root, "extensions");
		await mkdir(extensions);
		await writeFile(
			join(extensions, "alpha.ts"),
			"export default { manifest: { id: 'alpha', version: '1.0.0' }, activate() { return {}; } };\n",
		);
		await writeFile(
			join(extensions, "beta.ts"),
			"export default { manifest: { id: 'beta', version: '1.0.0' }, activate() { return {}; } };\n",
		);
		const manifestPath = join(root, "workspace.json");
		await writeFile(
			manifestPath,
			JSON.stringify({
				extensions: [
					{ id: "alpha", source: "./extensions/alpha.ts", version: "1.0.0" },
					{ id: "beta", source: "./extensions/beta.ts", version: "1.0.0" },
				],
				extensionGroups: {
					alpha: {
						id: "alpha",
						displayName: "alpha",
						extensionIds: ["alpha"],
						source: "project",
					},
					beta: {
						id: "beta",
						displayName: "beta",
						extensionIds: ["beta"],
						source: "project",
					},
				},
			}),
		);

		const host = await createMacroHost({
			workspacePath: manifestPath,
			defaults: {},
		});
		const alpha = await host.createWorkspace({ extensionGroupId: "alpha" });
		const beta = await host.createWorkspace({ extensionGroupId: "beta" });

		expect(alpha.workspace).not.toBe(beta.workspace);
		expect(
			alpha.workspace.runtime.extensions.list().map((item) => item.manifest.id),
		).toEqual(["alpha"]);
		expect(
			beta.workspace.runtime.extensions.list().map((item) => item.manifest.id),
		).toEqual(["beta"]);

		await alpha.workspace.dispose();
		expect(beta.workspace.runtime.extensions.list()).toHaveLength(1);
		await host.dispose();
	});

	test("resolves an explicitly selected group without mutating the manifest", () => {
		const manifest: MacroWorkspaceManifest = {
			extensions: [
				{ id: "alpha", source: "alpha.ts", version: "1.0.0" },
				{ id: "beta", source: "beta.ts", version: "1.0.0" },
			],
			extensionGroups: {
				alpha: {
					id: "alpha",
					displayName: "alpha",
					extensionIds: ["alpha"],
					source: "project",
				},
				beta: {
					id: "beta",
					displayName: "beta",
					extensionIds: ["beta"],
					source: "project",
				},
			},
			activeExtensionGroupId: "alpha",
		};

		const resolved = resolveWorkspaceExtensions(manifest, "beta");
		expect(resolved.activeExtensionGroupId).toBe("beta");
		expect(resolved.extensions.map((item) => item.id)).toEqual(["beta"]);
		expect(manifest.activeExtensionGroupId).toBe("alpha");
	});
});
