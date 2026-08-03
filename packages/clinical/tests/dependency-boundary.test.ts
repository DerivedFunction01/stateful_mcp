import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const _ROOT = resolve(fileURLToPath(import.meta.url), "../../src");

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
	walk(_ROOT);
	return out;
}

function stripComments(content: string): string {
	// Remove block comments and line comments (preserves import specifiers).
	return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function contentMatches(marker: string, content: string): boolean {
	const code = stripComments(content);
	return (
		code.includes(`"${marker}`) ||
		code.includes(`'${marker}`) ||
		code.includes(`\`${marker}`)
	);
}

// Forbidden legacy-module import fragments. A  source file that references any
// of these in an import specifier violates the  boundary.
const FORBIDDEN_MARKERS: Array<{ marker: string; reason: string }> = [
	{
		marker: "parser/cdsl-parser",
		reason: "CDSL parser is retired and must not be a  dependency",
	},
	{
		marker: "parser/schema-parsers",
		reason: "ParsedItem/schema-parsers is retired for ",
	},
	{
		marker: "store/parser/profiles",
		reason: "legacy parser profiles are not  dependencies",
	},
	{
		marker: "store/parser/composer",
		reason: "legacy parser graph construction is not a  dependency",
	},
	{
		marker: "store/parser/tags",
		reason: "tags are retired and have no  core equivalent",
	},
	{
		marker: "store/reference/stop-words",
		reason: "stop-word gating is not a  dependency",
	},
	{
		marker: "store/learning/parsed_cell",
		reason: "parsed-cell learning is not a  dependency",
	},
	{
		marker: "store/learning/ordered_learning",
		reason: "ordered learning is not a  dependency",
	},
	{
		marker: "store/reference/prose-parser-templates",
		reason: "parser-input prose templates are not  dependencies",
	},
];

describe("Engine  dependency boundary", () => {
	it("finds  source files", () => {
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
			expect(
				offenders,
				`${marker} appears in: ${offenders.join(", ")}`,
			).toEqual([]);
		});
	}
});
