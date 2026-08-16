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
		expect(draft.locks).toEqual([]);
		expect(draft.executionPreview?.status).toBe("valid");
		expect(
			draft.executionPreview?.bindings.map((item) => item.argumentId),
		).toEqual(["title", "page", "year"]);

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
		expect(draft.locks).toEqual([]);
		expect(draft.executionPreview?.status).toBe("valid");

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

	test("rejects execution when the preview text is stale", async () => {
		const draft = await parseMacroWithAdapter(
			noteAdapter,
			"^note title=Harry Potter page=42 year=2004",
			{ context: testMacroContext },
		);

		await expect(
			executeMacroWithAdapter(noteAdapter, draft, {
				text: "^note title=Changed page=42 year=2004",
			}),
		).rejects.toThrow("text is stale");
	});

	test("keeps candidate snapshots in the executable preview", async () => {
		const candidates = [
			{
				resolverId: "fixture",
				argumentId: "title",
				version: "fixture-v1",
				candidates: [],
			},
		] as const;
		const draft = await parseMacroWithAdapter(
			noteAdapter,
			"^note title=Harry Potter page=42 year=2004",
			{ context: testMacroContext, candidates },
		);

		expect(draft.executionPreview?.candidateSnapshots).toEqual(candidates);
		await expect(
			executeMacroWithAdapter(noteAdapter, draft, { candidates }),
		).resolves.toEqual({
			kind: "note",
			values: ["Harry Potter", "42", "2004"],
		});
		await expect(
			executeMacroWithAdapter(noteAdapter, draft, {
				candidates: [
					{
						...candidates[0],
						version: "fixture-v2",
					},
				],
			}),
		).rejects.toThrow("candidates are stale");
	});

	test("rejects execution when the runtime context changes", async () => {
		const draft = await parseMacroWithAdapter(
			noteAdapter,
			"^note title=Harry Potter page=42 year=2004",
			{ context: testMacroContext },
		);

		await expect(
			executeMacroWithAdapter(noteAdapter, draft, {
				context: createMacroRuntimeContext({
					macroStartToken: "!",
				}),
			}),
		).rejects.toThrow("context is stale");
	});

	test("rejects candidate snapshot when owner extension or resource is mismatched", () => {
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
				backends: {
					books: {
						ownerExtensionId: "books-extension",
						resourceId: "books-resource",
						version: "1",
						search: () => [],
					},
				},
				candidateSnapshots: [
					{
						resolverId: "books",
						argumentId: "concept",
						version: "1",
						ownerExtensionId: "foreign-extension",
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

		expect(result?.diagnostics).toEqual([
			expect.objectContaining({
				code: "CROSS_RESOURCE_CANDIDATE_REJECTED",
				argumentId: "concept",
			}),
		]);
		expect(result?.matches).toHaveLength(0);
	});

	test("diagnoses resolver version mismatch and rejects execution with updated backend", async () => {
		const candidates = [
			{
				resolverId: "books",
				argumentId: "concept",
				version: "1",
				candidates: [
					{
						id: "hp",
						term: "hp",
						start: 0,
						end: 2,
						matchKind: "exact" as const,
						canonicalValue: "series",
					},
				],
			},
		];

		const mockBackendV1 = {
			ownerExtensionId: "books-extension",
			resourceId: "books",
			version: "1",
			search: () => [],
		};

		const mockBackendV2 = {
			ownerExtensionId: "books-extension",
			resourceId: "books",
			version: "2",
			search: () => [],
		};

		const draft = await parseMacroWithAdapter(
			observationAdapter,
			"^observation concept=hp severity=5/10",
			{
				context: testMacroContext,
				backends: { books: mockBackendV1 },
				candidates,
			},
		);

		// Execution with current backend v1 succeeds
		await expect(
			executeMacroWithAdapter(observationAdapter, draft, {
				backends: { books: mockBackendV1 },
			}),
		).resolves.toBeDefined();

		// Execution with updated backend v2 rejects due to stale resolver version
		await expect(
			executeMacroWithAdapter(observationAdapter, draft, {
				backends: { books: mockBackendV2 },
			}),
		).rejects.toThrow("stale");

		// Execution with missing backend rejects
		await expect(
			executeMacroWithAdapter(observationAdapter, draft, {
				backends: {},
			}),
		).rejects.toThrow("unavailable");
	});
});
