import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	createMacroHost,
	createMacroProject,
	MACRO_DEFAULT_HISTORY_ID,
	MacroProjectConflictError,
	openMacroProject,
} from "../src";

describe("Macro project resource", () => {
	test("creates, reopens, and associates the default history resource", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-project-"),
		);
		const created = await createMacroProject({ rootPath: root });
		expect(created.manifest.projectId).toBeString();
		expect(created.manifest.backend.path).toBe(".macro/state.jsonl");
		expect(created.manifest.historyResources[0]?.resourceId).toBe(
			MACRO_DEFAULT_HISTORY_ID,
		);
		expect((await created.listHistory()).map((item) => item.historyId)).toEqual(
			[MACRO_DEFAULT_HISTORY_ID],
		);
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.manifest.projectId).toBe(created.manifest.projectId);
		expect(await reopened.openHistory(MACRO_DEFAULT_HISTORY_ID)).not.toBeNull();
		await reopened.close();
	});

	test("rejects stale manifest saves", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-project-"),
		);
		const first = await createMacroProject({ rootPath: root });
		const second = await openMacroProject({ rootPath: root });
		const firstRevision = first.descriptor.revision;
		await first.saveManifest(
			{ ...first.manifest, displayName: "first" },
			firstRevision,
		);
		await expect(
			second.saveManifest(
				{ ...second.manifest, displayName: "second" },
				firstRevision,
			),
		).rejects.toBeInstanceOf(MacroProjectConflictError);
		const raw = await readFile(join(root, ".macro", "project.json"), "utf8");
		expect(JSON.parse(raw).displayName).toBe("first");
	});

	test("supports an explicitly selected project-local SQLite backend", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-project-"),
		);
		const project = await createMacroProject({
			rootPath: root,
			backend: "sqlite",
		});
		expect(project.manifest.backend).toEqual({
			kind: "sqlite",
			path: ".macro/state.sqlite",
		});
		expect(await project.openHistory(MACRO_DEFAULT_HISTORY_ID)).not.toBeNull();
		await project.close();
	});

	test("creates an isolated workspace projection from an opened project", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-project-"),
		);
		const project = await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {} });
		const loaded = await host.createWorkspace({ projectRoot: root });
		expect(loaded.project?.manifest.projectId).toBe(project.manifest.projectId);
		expect(loaded.workspace).not.toBeUndefined();
		await host.dispose();
	});
});
