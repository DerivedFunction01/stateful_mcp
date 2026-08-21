import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroProject } from "@stateful-mcp/macro-host";

describe("filesystem browsing and project detection", () => {
	test("detects macro projects within directories", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-browse-"),
		);
		const sub1 = join(root, "plain-folder");
		const sub2 = join(root, "macro-project-folder");
		await mkdir(sub1);
		await mkdir(sub2);
		await createMacroProject({ rootPath: sub2, displayName: "Sub Project" });

		// Check existence of project.json in sub2
		const sub1Project = await Bun.file(
			join(sub1, ".macro", "project.json"),
		).exists();
		const sub2Project = await Bun.file(
			join(sub2, ".macro", "project.json"),
		).exists();

		expect(sub1Project).toBe(false);
		expect(sub2Project).toBe(true);
	});
});
