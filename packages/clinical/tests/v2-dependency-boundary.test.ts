import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const V2_ROOT = resolve(fileURLToPath(import.meta.url), "../../src/v2");

function v2Files(): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".ts")) {
				out.push(full);
			}
		}
	};
	walk(V2_ROOT);
	return out;
}

function stripComments(content: string): string {
	// Remove block comments and line comments (preserves import specifiers).
	return content
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/[^\n]*/g, "");
}

function contentMatches(marker: string, content: string): boolean {
	const code = stripComments(content);
	return (
		code.includes(`"${marker}`) ||
		code.includes(`'${marker}`) ||
		code.includes(`\`${marker}`)
	);
}

// Forbidden legacy-module import fragments. A V2 source file that references any
// of these in an import specifier violates the V2 boundary.
const FORBIDDEN_MARKERS: Array<{ marker: string; reason: string }> = [
	{
		marker: "parser/cdsl-parser",
		reason: "CDSL parser is retired and must not be a V2 dependency",
	},
	{
		marker: "parser/schema-parsers",
		reason: "ParsedItem/schema-parsers is retired for V2",
	},
	{
		marker: "store/parser/profiles",
		reason: "legacy parser profiles are not V2 dependencies",
	},
	{
		marker: "store/parser/composer",
		reason: "legacy parser graph construction is not a V2 dependency",
	},
	{
		marker: "store/parser/tags",
		reason: "tags are retired and have no V2 core equivalent",
	},
	{
		marker: "store/reference/stop-words",
		reason: "stop-word gating is not a V2 dependency",
	},
	{
		marker: "store/learning/parsed_cell",
		reason: "parsed-cell learning is not a V2 dependency",
	},
	{
		marker: "store/learning/ordered_learning",
		reason: "ordered learning is not a V2 dependency",
	},
	{
		marker: "store/reference/prose-parser-templates",
		reason: "parser-input prose templates are not V2 dependencies",
	},
];

describe("Engine V2 dependency boundary", () => {
	it("finds V2 source files", () => {
		const files = v2Files();
		expect(files.length).toBeGreaterThan(0);
	});

	for (const { marker, reason } of FORBIDDEN_MARKERS) {
		it(`does not import '${marker}' (${reason})`, async () => {
			const offenders: string[] = [];
			for (const file of v2Files()) {
				const content = await Bun.file(file).text();
				if (contentMatches(marker, content)) {
					offenders.push(file);
				}
			}
			expect(offenders, `${marker} appears in: ${offenders.join(", ")}`).toEqual(
				[],
			);
		});
	}
});
