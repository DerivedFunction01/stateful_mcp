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

	test("filters out internal infrastructure directories (.macro, .macro-user, .git)", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-filter-"),
		);
		await mkdir(join(root, "src"));
		await mkdir(join(root, ".macro"));
		await mkdir(join(root, ".macro-user"));
		await mkdir(join(root, ".git"));

		const { readdir } = await import("node:fs/promises");
		const dirEntries = await readdir(root, { withFileTypes: true });
		const IGNORED_BROWSE_DIRS = new Set([".macro", ".macro-user", ".git"]);
		const visible = dirEntries
			.filter((e) => e.isDirectory() && !IGNORED_BROWSE_DIRS.has(e.name))
			.map((e) => e.name);

		expect(visible).toEqual(["src"]);
		expect(visible.includes(".macro")).toBe(false);
		expect(visible.includes(".macro-user")).toBe(false);
		expect(visible.includes(".git")).toBe(false);
	});
});
