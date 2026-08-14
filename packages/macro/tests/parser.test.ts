import { describe, expect, test } from "bun:test";
import type { MacroSpec } from "../src/contracts/macro";
import { parseMacroLine } from "../src/parser/macro-parser";
import { createExpressionBackendFixture } from "./support/expression-backend-fixture";

const books = createExpressionBackendFixture([
	{ id: "hp", term: "hp", canonicalValue: "series", priority: 1 },
	{
		id: "hp-series",
		term: "harry potter",
		canonicalValue: "series",
		priority: 1,
	},
	{
		id: "hp-book",
		term: "harry potter and the deathly hallows",
		canonicalValue: "deathly-hallows",
		priority: 10,
	},
	{
		id: "deathly",
		term: "deathly hallows",
		canonicalValue: "deathly-hallows",
		priority: 2,
	},
	{
		id: "inactive",
		term: "disabled",
		canonicalValue: "disabled",
		active: false,
	},
]);

const spec: MacroSpec = {
	id: "note",
	name: "note",
	syntax: {
		macroStartToken: "^",
		quoteCharacters: ['"', "'"],
		groupOpen: "[",
		groupClose: "]",
	},
	arguments: [
		{
			argumentId: "title",
			name: "title",
			aliases: ["t"],
			path: "foo.path.args.title",
			matcher: { kind: "expression", backendId: "books" },
		},
		{
			argumentId: "year",
			name: "year",
			path: "foo.path.args.year",
			matcher: { kind: "pattern", pattern: "(?<value>20\\d{2})" },
			scalarType: "integer",
		},
	],
	matching: { mode: "unordered", positionalFallback: true },
};

describe("neutral macro parser", () => {
	test("recognizes the envelope and preserves named assignment spans", () => {
		const result = parseMacroLine(
			'  ^note title="harry potter" year=2004',
			spec,
			{ backends: { books } },
		);
		expect(result?.macroName).toBe("note");
		expect(result?.arguments.map((argument) => argument.name)).toEqual([
			"title",
			"year",
		]);
		expect(result?.arguments[0]?.rawValue).toBe("harry potter");
		expect(result?.arguments[1]?.rawValue).toBe("2004");
		expect(result?.matches).toHaveLength(2);
	});

	test("matches unordered expression and numeric arguments", () => {
		const result = parseMacroLine("^note 2004 hp", spec, {
			backends: { books },
		});
		expect(result?.matches.map((match) => match.argumentId)).toEqual([
			"year",
			"title",
		]);
		expect(
			result?.matches.find((match) => match.argumentId === "title")
				?.canonicalValue,
		).toBe("series");
	});

	test("keeps a longer expression as the precedence winner", () => {
		const result = parseMacroLine(
			"^note harry potter and the deathly hallows",
			spec,
			{ backends: { books } },
		);
		expect(
			result?.matches.filter((match) => match.argumentId === "title"),
		).toHaveLength(1);
		expect(result?.matches[0]?.canonicalValue).toBe("deathly-hallows");
	});

	test("reports a prefix expression for live pending state", () => {
		const result = parseMacroLine("^note harry pot", spec, {
			backends: { books },
		});
		expect(result?.matches[0]?.matchKind).toBe("prefix");
	});

	test("reports unknown named arguments and ignores inactive expressions", () => {
		const result = parseMacroLine("^note disabled bogus=value", spec, {
			backends: { books },
		});
		expect(
			result?.diagnostics.some(
				(diagnostic) => diagnostic.code === "UNKNOWN_ARGUMENT",
			),
		).toBe(true);
		expect(result?.matches.some((match) => match.rawValue === "disabled")).toBe(
			false,
		);
	});

	test("returns null for non-macro input", () => {
		expect(parseMacroLine("note title=hp", spec)).toBeNull();
	});

	test("does not infer a macro token when syntax is absent", () => {
		const withoutSyntax = { ...spec, syntax: undefined };
		expect(
			parseMacroLine("^note title=hp", withoutSyntax, { backends: { books } }),
		).toBeNull();
	});

	test("uses caller-provided syntax tokens", () => {
		const custom = {
			...spec,
			syntax: {
				macroStartToken: "@",
				quoteCharacters: ["`"],
				groupOpen: "{",
				groupClose: "}",
			},
		};
		expect(
			parseMacroLine("^note title=hp", custom, { backends: { books } }),
		).toBeNull();
		expect(
			parseMacroLine("@note title=hp", custom, { backends: { books } })
				?.macroName,
		).toBe("note");
	});
});
