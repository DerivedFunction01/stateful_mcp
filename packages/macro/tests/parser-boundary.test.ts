import { describe, expect, test } from "bun:test";
import { MacroDraftSession } from "../src/authoring/macro-draft-session";
import { createMacroRuntimeContext } from "../src/contracts/context";
import type { MacroSpec } from "../src/contracts/macro";
import { parseMacroLine } from "../src/parser/macro-parser";
import { createExpressionBackendFixture } from "./support/expression-backend-fixture";

const booksBackend = createExpressionBackendFixture(
	[
		{
			id: "hp",
			term: "harry",
			canonicalValue: "harry-series",
			priority: 1,
			metadata: { topic: "books" },
		},
		{
			id: "hp-long",
			term: "harry potter",
			canonicalValue: "harry-potter-full",
			priority: 5,
			metadata: { topic: "books" },
		},
		{
			id: "hp-hallows",
			term: "harry potter and the deathly hallows",
			canonicalValue: "deathly-hallows",
			priority: 10,
			metadata: { topic: "books" },
		},
	],
	{ backendVersion: "v1.0.0" },
);

const context = createMacroRuntimeContext({
	macroStartToken: "^",
	argumentDelimiter: " ",
	quoteCharacters: ['"', "'"],
	groupOpen: "[",
	groupClose: "]",
});

const librarySpec: MacroSpec = {
	id: "library.book",
	name: "book",
	version: 1,
	arguments: [
		{
			argumentId: "concept",
			name: "concept",
			path: "concept",
			matcher: { kind: "expression", backendId: "books" },
		},
		{
			argumentId: "year",
			name: "year",
			path: "year",
			matcher: { kind: "pattern", pattern: "(?<year>20\\d{2})" },
			scalarType: "integer",
		},
		{
			argumentId: "page",
			name: "page",
			path: "page",
			matcher: { kind: "pattern", pattern: "(?<page>\\d{1,3})" },
			scalarType: "integer",
		},
	],
	matching: { mode: "unordered", positionalFallback: true },
};

describe("Phase 2 parser boundary hardening", () => {
	describe("1. Runtime context is syntax source of truth", () => {
		test("requires runtime context syntax and ignores any attempts by macro specs to define syntax", () => {
			const specWithoutSyntax: MacroSpec = {
				...librarySpec,
			};
			// Even with custom context, parser uses context from options
			const customContext = createMacroRuntimeContext({ macroStartToken: "!" });
			expect(
				parseMacroLine("^book year=2004", specWithoutSyntax, {
					context: customContext,
				}),
			).toBeNull();
			expect(
				parseMacroLine("!book year=2004", specWithoutSyntax, {
					context: customContext,
				})?.macroName,
			).toBe("book");
		});
	});

	describe("2. Named-assignment boundary enforcement", () => {
		test("handles concept=harry 2004 10 with partial consumption and positional inference", () => {
			const result = parseMacroLine(
				"^book concept=harry 2004 10",
				librarySpec,
				{
					context,
					backends: { books: booksBackend },
				},
			);
			expect(result).not.toBeNull();
			expect(result?.arguments.map((a) => a.name)).toEqual([
				"concept",
				"year",
				"page",
			]);
			expect(result?.arguments[0]?.rawValue).toBe("harry");
			expect(result?.arguments[1]?.rawValue).toBe("2004");
			expect(result?.arguments[2]?.rawValue).toBe("10");
			expect(result?.matches.map((m) => m.argumentId)).toEqual([
				"concept",
				"year",
				"page",
			]);
		});

		test("handles year=not-a-year page=10: fails matcher, consumes first token, allows later arguments", () => {
			const result = parseMacroLine(
				"^book year=not-a-year page=10",
				librarySpec,
				{
					context,
					backends: { books: booksBackend },
				},
			);
			expect(result).not.toBeNull();
			expect(result?.arguments.map((a) => a.rawValue)).toEqual([
				"not-a-year",
				"10",
			]);
			expect(result?.matches.map((m) => m.argumentId)).toEqual(["page"]);
		});

		test("handles whitespace around equals and assignment-like text in quotes", () => {
			const result = parseMacroLine(
				'^book concept = "harry" year = 2004',
				librarySpec,
				{
					context,
					backends: { books: booksBackend },
				},
			);
			expect(result).not.toBeNull();
			expect(result?.arguments[0]?.name).toBe("concept");
			expect(result?.arguments[0]?.rawValue).toBe("harry");
			expect(result?.arguments[1]?.name).toBe("year");
			expect(result?.arguments[1]?.rawValue).toBe("2004");
		});

		test("reports unknown and duplicate named assignments", () => {
			const result = parseMacroLine(
				"^book year=2004 bogus=xyz year=2005",
				librarySpec,
				{ context },
			);
			expect(
				result?.diagnostics.some((d) => d.code === "UNKNOWN_ARGUMENT"),
			).toBe(true);
			expect(
				result?.diagnostics.some((d) => d.code === "DUPLICATE_ARGUMENT"),
			).toBe(true);
		});
	});

	describe("3. Authoritative and version-aware candidate snapshots", () => {
		test("accepts candidate snapshot without a live backend and without BACKEND_MISSING", () => {
			const result = parseMacroLine("^book concept=harry", librarySpec, {
				context,
				candidateSnapshots: [
					{
						resolverId: "books",
						argumentId: "concept",
						version: "snapshot-v1",
						candidates: [
							{
								id: "hp-snap",
								term: "harry",
								start: 0,
								end: 5,
								matchKind: "exact",
								canonicalValue: "snapshot-harry",
								metadata: { source: "snapshot" },
							},
						],
					},
				],
			});
			expect(result?.diagnostics).toHaveLength(0);
			expect(result?.matches[0]).toMatchObject({
				argumentId: "concept",
				canonicalValue: "snapshot-harry",
				sourceId: "hp-snap",
				resolverVersion: "snapshot-v1",
				metadata: { source: "snapshot" },
			});
		});

		test("uses snapshot when versions match between snapshot and live backend", () => {
			const result = parseMacroLine("^book concept=harry", librarySpec, {
				context,
				backends: { books: booksBackend }, // version is v1.0.0
				candidateSnapshots: [
					{
						resolverId: "books",
						argumentId: "concept",
						version: "v1.0.0",
						candidates: [
							{
								id: "hp-snap",
								term: "harry",
								start: 0,
								end: 5,
								matchKind: "exact",
								canonicalValue: "snapshot-match",
							},
						],
					},
				],
			});
			expect(result?.diagnostics).toHaveLength(0);
			expect(result?.matches[0]?.canonicalValue).toBe("snapshot-match");
		});

		test("emits STALE_SNAPSHOT diagnostic and falls back to live backend on version mismatch", () => {
			const result = parseMacroLine("^book concept=harry", librarySpec, {
				context,
				backends: { books: booksBackend }, // version is v1.0.0
				candidateSnapshots: [
					{
						resolverId: "books",
						argumentId: "concept",
						version: "v0.9.0-old",
						candidates: [
							{
								id: "hp-stale",
								term: "harry",
								start: 0,
								end: 5,
								matchKind: "exact",
								canonicalValue: "stale-val",
							},
						],
					},
				],
			});
			expect(result?.diagnostics.some((d) => d.code === "STALE_SNAPSHOT")).toBe(
				true,
			);
			// Falls back to live backend
			expect(result?.matches[0]?.canonicalValue).toBe("harry-series");
		});
	});

	describe("4. Separation of textual match kind from structural stability", () => {
		test("exact shorter match is matchKind exact even when longer continuation exists", () => {
			const result = parseMacroLine("^book harry", librarySpec, {
				context,
				backends: { books: booksBackend },
				mode: "live",
			});
			expect(result?.matches[0]?.matchKind).toBe("exact");
		});

		test("draft session marks shorter continuation as unstable resolution without corrupting matchKind", () => {
			const session = new MacroDraftSession({
				spec: librarySpec,
				context,
				backends: { books: booksBackend },
				initialText: "^book harry",
			});
			const snapshot = session.snapshot();
			const conceptResolution = snapshot.resolutions.find(
				(r) => r.argumentId === "concept",
			);
			expect(conceptResolution?.disposition).toBe("unstable");
			expect(conceptResolution?.match?.matchKind).toBe("exact");
			expect(snapshot.payloadPreview?.arguments[0]?.state).toBe("pending");
		});

		test("preview never creates locks without explicit acceptance", () => {
			const session = new MacroDraftSession({
				spec: librarySpec,
				context,
				backends: { books: booksBackend },
				initialText: "^book harry potter and the deathly hallows 2007",
			});
			const snapshot = session.snapshot();
			expect(snapshot.locks).toHaveLength(0);
		});
	});

	describe("5. Lock reconciliation across edits and invalidations", () => {
		test("preserves locks on edit before, invalidates on edit inside, leaves unchanged on edit after", () => {
			const session = new MacroDraftSession({
				spec: librarySpec,
				context,
				backends: { books: booksBackend },
				initialText: "^book harry",
			});
			session.acceptCandidate("concept");
			expect(session.snapshot().locks).toHaveLength(1);
			const initialLock = session.snapshot().locks[0]!;

			// Edit before lock
			const shifted = session.applyEdit({ start: 0, end: 0, text: "   " });
			expect(shifted.locks[0]?.start).toBe(initialLock.start + 3);
			expect(shifted.locks[0]?.end).toBe(initialLock.end + 3);

			// Edit after lock
			const afterEdit = session.applyEdit({
				start: shifted.text.length,
				end: shifted.text.length,
				text: " 2004",
			});
			expect(afterEdit.locks).toHaveLength(1);

			// Edit inside lock invalidates it
			const insideEdit = session.applyEdit({
				start: afterEdit.locks[0]!.start + 1,
				end: afterEdit.locks[0]!.start + 2,
				text: "x",
			});
			expect(insideEdit.locks).toHaveLength(0);
		});
	});
});
