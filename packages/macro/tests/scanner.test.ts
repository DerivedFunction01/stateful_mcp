import { describe, expect, test } from "bun:test";
import type { MacroDiagnostic } from "../src/contracts/input";
import {
	scanNamedAssignments,
	splitByDelimiter,
	splitListItems,
	tokenizePositionalTokens,
} from "../src/parser/macro-scanner";

describe("shared lexical scanner", () => {
	test("scans basic named assignments and preserves exact spans", () => {
		const diagnostics: MacroDiagnostic[] = [];
		const raw = "^macro name=harry year=2004";
		const segments = scanNamedAssignments(raw, 7, diagnostics);

		expect(diagnostics).toHaveLength(0);
		expect(segments).toHaveLength(2);

		expect(segments[0]).toMatchObject({
			name: "name",
			value: "harry",
			start: 7,
			equalsOffset: 11,
			sourceSpan: { start: 12, end: 17 },
			valueSpan: { start: 12, end: 17 },
		});
		expect(segments[1]).toMatchObject({
			name: "year",
			value: "2004",
			start: 18,
			equalsOffset: 22,
			sourceSpan: { start: 23, end: 27 },
			valueSpan: { start: 23, end: 27 },
		});
	});

	test("preserves whitespace around equals and tracks sourceSpan vs valueSpan", () => {
		const diagnostics: MacroDiagnostic[] = [];
		const raw = '^cmd title = "deathly hallows"  year = 2007';
		const segments = scanNamedAssignments(raw, 5, diagnostics, {
			quoteCharacters: ['"'],
		});

		expect(diagnostics).toHaveLength(0);
		expect(segments).toHaveLength(2);

		expect(segments[0]).toMatchObject({
			name: "title",
			value: "deathly hallows",
			start: 5,
			equalsOffset: 11,
			sourceSpan: { start: 13, end: 30 },
			valueSpan: { start: 14, end: 29 },
		});
		expect(
			raw.slice(segments[0]!.sourceSpan.start, segments[0]!.sourceSpan.end),
		).toBe('"deathly hallows"');
		expect(
			raw.slice(segments[0]!.valueSpan.start, segments[0]!.valueSpan.end),
		).toBe("deathly hallows");

		expect(segments[1]).toMatchObject({
			name: "year",
			value: "2007",
			start: 32,
			equalsOffset: 37,
			sourceSpan: { start: 39, end: 43 },
			valueSpan: { start: 39, end: 43 },
		});
	});

	test("handles quoted escapes and assignment-like text inside quotes", () => {
		const diagnostics: MacroDiagnostic[] = [];
		const raw = '^cmd text="hello \\"world\\" foo=bar" other=value';
		const segments = scanNamedAssignments(raw, 5, diagnostics);

		expect(diagnostics).toHaveLength(0);
		expect(segments).toHaveLength(2);
		expect(segments[0]?.name).toBe("text");
		expect(segments[0]?.value).toBe('hello \\"world\\" foo=bar');
		expect(segments[1]?.name).toBe("other");
		expect(segments[1]?.value).toBe("value");
	});

	test("handles grouped values and assignment-like text inside groups", () => {
		const diagnostics: MacroDiagnostic[] = [];
		const raw = "^cmd tags=[tag1, tag2=inner, tag3] done=true";
		const segments = scanNamedAssignments(raw, 5, diagnostics, {
			groupOpen: "[",
			groupClose: "]",
		});

		expect(diagnostics).toHaveLength(0);
		expect(segments).toHaveLength(2);
		expect(segments[0]?.name).toBe("tags");
		expect(segments[0]?.value).toBe("[tag1, tag2=inner, tag3]");
		expect(segments[1]?.name).toBe("done");
		expect(segments[1]?.value).toBe("true");
	});

	test("emits diagnostics for unterminated quotes and groups", () => {
		const quoteDiag: MacroDiagnostic[] = [];
		scanNamedAssignments('^cmd val="unterminated', 5, quoteDiag);
		expect(quoteDiag).toContainEqual(
			expect.objectContaining({ code: "UNTERMINATED_QUOTE" }),
		);

		const groupDiag: MacroDiagnostic[] = [];
		scanNamedAssignments("^cmd val=[nested", 5, groupDiag, {
			groupOpen: "[",
			groupClose: "]",
		});
		expect(groupDiag).toContainEqual(
			expect.objectContaining({ code: "UNTERMINATED_GROUP" }),
		);
	});

	test("splits by delimiter respecting quotes and group nesting", () => {
		const raw = 'one; two = "three; four"; [five; six]; seven';
		const parts = splitByDelimiter(raw, { start: 0, end: raw.length }, ";", {
			quoteCharacters: ['"'],
			groupOpen: "[",
			groupClose: "]",
		});

		expect(parts).toHaveLength(4);
		expect(raw.slice(parts[0]!.start, parts[0]!.end)).toBe("one");
		expect(raw.slice(parts[1]!.start, parts[1]!.end)).toBe(
			'two = "three; four"',
		);
		expect(raw.slice(parts[2]!.start, parts[2]!.end)).toBe("[five; six]");
		expect(raw.slice(parts[3]!.start, parts[3]!.end)).toBe("seven");
	});

	test("splits list items respecting quotes and bracket nesting", () => {
		const text = 'alpha, "beta, gamma", [delta, epsilon], zeta';
		const items = splitListItems(text, 10, ",", {
			quoteCharacters: ['"'],
			groupOpen: "[",
			groupClose: "]",
		});

		expect(items.map((i) => i.rawValue)).toEqual([
			"alpha",
			'"beta, gamma"',
			"[delta, epsilon]",
			"zeta",
		]);
		expect(items[0]?.start).toBe(10);
	});

	test("tokenizes positional regions", () => {
		const raw = "^cmd foo bar baz";
		const tokens = tokenizePositionalTokens(raw, { start: 5, end: raw.length });
		expect(tokens.map((t) => raw.slice(t.start, t.end))).toEqual([
			"foo",
			"bar",
			"baz",
		]);
	});
});
