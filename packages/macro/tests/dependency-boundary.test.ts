import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const sourceRoot = join(import.meta.dir, "../src");

async function sourceFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
		else if (entry.name.endsWith(".ts")) files.push(path);
	}
	return files;
}

describe("macro package dependency boundary", () => {
	test("does not import clinical or current CLI code", async () => {
		const forbidden = [
			"@stateful-mcp/clinical",
			"@stateful-mcp/cli",
			"packages/clinical/src",
			"packages/cli/src",
		];
		for (const file of await sourceFiles(sourceRoot)) {
			const text = await Bun.file(file).text();
			for (const marker of forbidden) expect(text).not.toContain(marker);
		}
	});
});
