import { describe, expect, test } from "bun:test";
import { MacroDraftSession } from "../src/authoring/macro-draft-session";
import { createMacroRuntimeContext } from "../src/contracts/context";
import type { MacroSpec } from "../src/contracts/macro";
import { createExpressionBackendFixture } from "./support/expression-backend-fixture";

const backend = createExpressionBackendFixture([
	{ id: "short", term: "harry potter", canonicalValue: "series", priority: 1 },
	{
		id: "long",
		term: "harry potter and the deathly hallows",
		canonicalValue: "book",
		priority: 10,
	},
]);

const context = createMacroRuntimeContext({
	macroStartToken: "^",
	quoteCharacters: ['"', "'"],
	groupOpen: "[",
	groupClose: "]",
});

const spec: MacroSpec = {
	id: "note",
	name: "note",
	version: 1,
	matching: { positionalFallback: true },
	arguments: [
		{
			argumentId: "title",
			name: "title",
			path: "args.title",
			matcher: { kind: "expression", backendId: "books" },
		},
	],
};

function session(initialText: string): MacroDraftSession {
	return new MacroDraftSession({
		spec,
		context,
		backends: { books: backend },
		initialText,
	});
}

describe("neutral macro draft session", () => {
	test("keeps a short expression pending while a longer continuation is possible", () => {
		const snapshot = session("^note harry potter").snapshot();
		expect(snapshot.mode).toBe("macro");
		expect(
			snapshot.resolutions.find((item) => item.argumentId === "title")
				?.disposition,
		).toBe("unstable");
		expect(snapshot.locks).toHaveLength(0);
		expect(snapshot.payloadPreview?.arguments[0]?.state).toBe("pending");
	});

	test("selects and commits the complete longer expression", () => {
		const draft = session("^note harry potter and the deathly hallows");
		expect(
			draft.snapshot().resolutions.find((item) => item.argumentId === "title")
				?.disposition,
		).toBe("selected");
		const result = draft.commit();
		expect(result.status).toBe("matched");
		expect(result.payload).toEqual({ args: { title: "book" } });
		expect(draft.snapshot().locks[0]?.rawText).toBe(
			"harry potter and the deathly hallows",
		);
	});

	test("explicitly accepts a pending candidate", () => {
		const draft = session("^note harry potter");
		const snapshot = draft.acceptCandidate("title");
		expect(snapshot.locks).toHaveLength(1);
		expect(snapshot.locks[0]?.source).toBe("explicit");
		expect(snapshot.payloadPreview?.arguments[0]?.state).toBe("locked");
	});

	test("keeps the short expression pending when an unmatched longer continuation contains a typo", () => {
		const draft = session("^note harry potter and teh deathly hallows");
		const snapshot = draft.snapshot();
		expect(
			snapshot.resolutions.find((item) => item.argumentId === "title")
				?.disposition,
		).toBe("unstable");
		expect(snapshot.payloadPreview?.arguments[0]?.state).toBe("pending");
		expect(draft.commit().payload).toEqual({ args: { title: "series" } });
	});

	test("reconciles accepted locks across unrelated and intersecting edits", () => {
		const draft = session("^note harry potter");
		draft.acceptCandidate("title");
		const shifted = draft.applyEdit({ start: 0, end: 0, text: "  " });
		expect(shifted.locks[0]?.start).toBe(shifted.text.indexOf("harry"));
		expect(
			draft.applyEdit({
				start: shifted.locks[0]!.start + 1,
				end: shifted.locks[0]!.start + 1,
				text: "x",
			}).locks,
		).toHaveLength(0);
	});

	test("increments revisions for authoritative edits and clears locks for whole replacement", () => {
		const draft = session("^note harry potter");
		draft.acceptCandidate("title");
		const before = draft.snapshot().revision;
		const afterEdit = draft.applyEdit({ start: 6, end: 6, text: "x" });
		expect(afterEdit.revision).toBe(before + 1);
		expect(draft.setText("^note hp").locks).toHaveLength(0);
	});
});
