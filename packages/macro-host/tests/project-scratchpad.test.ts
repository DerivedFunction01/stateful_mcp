import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroProject, openMacroProject } from "../src";

describe("Macro project scratchpad persistence", () => {
	test("creates, updates, persists, and reopens scratchpad resources (JSONL)", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-project-scratchpad-"),
		);
		const project = await createMacroProject({ rootPath: root });

		const created = await project.createScratchpad(
			"scratchpad-daily-triage",
			"Daily Triage",
			"^vitals 120 80\n^triage normal",
			{ author: "doctor" },
		);
		expect(created.scratchpadId).toBe("scratchpad-daily-triage");
		expect(created.title).toBe("Daily Triage");
		expect(project.manifest.scratchpadResources).toBeDefined();
		expect(
			project.manifest.scratchpadResources?.some(
				(r) => r.resourceId === "scratchpad-daily-triage",
			),
		).toBeTrue();

		// Update scratchpad execution state
		created.executedLineIndices = [0, 1];
		created.pinnedMacroIds = ["vitals"];
		created.textRevision = 3;
		await project.saveScratchpad(created);

		await project.close();

		// Re-open project from disk
		const reopened = await openMacroProject({ rootPath: root });
		const loaded = await reopened.openScratchpad("scratchpad-daily-triage");
		expect(loaded).not.toBeNull();
		expect(loaded?.title).toBe("Daily Triage");
		expect(loaded?.executedLineIndices).toEqual([0, 1]);
		expect(loaded?.pinnedMacroIds).toEqual(["vitals"]);
		expect(loaded?.textRevision).toBe(3);

		const list = await reopened.listScratchpads();
		expect(list).toHaveLength(1);
		expect(list[0]?.scratchpadId).toBe("scratchpad-daily-triage");

		// Delete scratchpad
		await reopened.deleteScratchpad("scratchpad-daily-triage");
		expect(await reopened.openScratchpad("scratchpad-daily-triage")).toBeNull();
		expect(await reopened.listScratchpads()).toHaveLength(0);

		await reopened.close();
	});

	test("persists scratchpad resources with project-local SQLite backend", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-project-scratchpad-sql-"),
		);
		const project = await createMacroProject({
			rootPath: root,
			backend: "sqlite",
		});

		await project.createScratchpad(
			"scratchpad-sql-1",
			"Cardiology Consult",
			"^ekg sinus",
		);

		const reopened = await openMacroProject({ rootPath: root });
		const loaded = await reopened.openScratchpad("scratchpad-sql-1");
		expect(loaded?.title).toBe("Cardiology Consult");
		expect(loaded?.rawText).toBe("^ekg sinus");

		await reopened.close();
	});
});
