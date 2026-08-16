import { describe, expect, test } from "bun:test";
import { createMacroRuntimeContext } from "../src/contracts/context";
import { parseMacroLine } from "../src/parser/macro-parser";
import {
	executeMacroWithAdapter,
	parseMacroWithAdapter,
} from "../src/runtime/macro-runtime";
import {
	noteAdapter,
	observationAdapter,
	testMacroContext,
} from "./support/composed-macro-fixtures";

describe("composed macro runtime", () => {
	test("parses expression candidates from an extension snapshot without a backend", () => {
		const result = parseMacroLine(
			"^lookup hp",
			{
				id: "fixture.lookup",
				name: "lookup",
				version: 1,
				arguments: [
					{
						argumentId: "concept",
						name: "concept",
						path: "fixture.lookup.concept",
						matcher: { kind: "expression", backendId: "books" },
					},
				],
				matching: { positionalFallback: true },
			},
			{
				context: testMacroContext,
				candidateSnapshots: [
					{
						resolverId: "books",
						argumentId: "concept",
						version: "books-v1",
						candidates: [
							{
								id: "hp",
								term: "hp",
								start: 0,
								end: 2,
								matchKind: "exact",
								canonicalValue: "series",
							},
						],
					},
				],
			},
		);

		expect(result?.matches[0]?.rawValue).toBe("hp");
		expect(result?.matches[0]?.canonicalValue).toBe("series");
		expect(result?.diagnostics).toEqual([]);
	});

	test("uses the shared expression token as a positional lookup barrier", () => {
		const customContext = createMacroRuntimeContext({
			macroStartToken: "^",
			expressionToken: "#",
		});
		const result = parseMacroLine(
			"^lookup #hp",
			{
				id: "fixture.lookup",
				name: "lookup",
				version: 1,
				arguments: [
					{
						argumentId: "concept",
						name: "concept",
						path: "fixture.lookup.concept",
						matcher: { kind: "expression", backendId: "books" },
					},
				],
				matching: { positionalFallback: true },
			},
			{
				context: customContext,
				candidateSnapshots: [
					{
						resolverId: "books",
						argumentId: "concept",
						version: "books-v1",
						candidates: [
							{
								id: "hp",
								term: "hp",
								start: 0,
								end: 2,
								matchKind: "exact",
								canonicalValue: "series",
							},
						],
					},
				],
			},
		);

		expect(result?.matches[0]?.rawValue).toBe("#hp");
		expect(result?.matches[0]?.canonicalValue).toBe("series");
	});

	test("runs note parsing, child preview, and compilation through one runtime", async () => {
		const draft = await parseMacroWithAdapter(
			noteAdapter,
			"^note title=Harry Potter page=42 year=2004",
			{ context: testMacroContext },
		);

		expect(draft.input?.matches.map((match) => match.argumentId)).toEqual([
			"title",
			"page",
			"year",
		]);
		expect(draft.preview.text).toBe(
			"title: Harry Potter, page: 42, year: 2004",
		);
		expect(draft.diagnostics).toEqual([]);
		expect(draft.locks.map((lock) => lock.argumentId)).toEqual([
			"title",
			"page",
			"year",
		]);

		await expect(executeMacroWithAdapter(noteAdapter, draft)).resolves.toEqual({
			kind: "note",
			values: ["Harry Potter", "42", "2004"],
		});
	});

	test("lets observation supply derived preview slots and a nested payload", async () => {
		const draft = await parseMacroWithAdapter(
			observationAdapter,
			"^observation concept=hp severity=5/10",
			{ context: testMacroContext },
		);

		expect(draft.preview.text).toBe(
			"concept: Harry Potter (Series), severity: 5 to 10",
		);
		expect(draft.input?.arguments.map((argument) => argument.name)).toEqual([
			"concept",
			"severity",
		]);
		expect(draft.locks.map((lock) => lock.argumentId)).toEqual([
			"concept",
			"severity",
		]);

		await expect(
			executeMacroWithAdapter(observationAdapter, draft),
		).resolves.toEqual({
			kind: "observation",
			observation: { severity: { min: 5, max: 10 } },
		});
	});

	test("keeps a failed named value literal without swallowing later values", async () => {
		const draft = await parseMacroWithAdapter(
			noteAdapter,
			"^note title=Harry Potter page=42 year=not-a-year",
			{ context: testMacroContext },
		);

		expect(draft.input?.arguments.map((argument) => argument.rawValue)).toEqual(
			["Harry Potter", "42", "not-a-year"],
		);
		expect(draft.input?.matches.map((match) => match.argumentId)).toEqual([
			"title",
			"page",
		]);
		expect(draft.preview.text).toBe(
			"title: Harry Potter, page: 42, year: <blank: year>",
		);
	});
});
