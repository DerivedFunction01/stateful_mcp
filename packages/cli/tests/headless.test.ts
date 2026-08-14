import { describe, expect, test } from "bun:test";
import { parseHeadlessArgs } from "../src/headless";
import { HeadlessDispatcher } from "../src/lib/headless/dispatcher";
import {
	createHeadlessNotebookState,
	reduceHeadlessNotebook,
} from "../src/lib/headless/notebook-state";

describe("headless notebook", () => {
	test("supports generic tabs, edits, cursor movement, and undo", () => {
		let state = createHeadlessNotebookState({ initialText: "ab" });
		state = reduceHeadlessNotebook(state, { type: "edit.insert", text: "c" });
		expect(state.tabs[0]?.text).toBe("abc");
		state = reduceHeadlessNotebook(state, { type: "cursor.home" });
		state = reduceHeadlessNotebook(state, { type: "edit.insert", text: "x" });
		state = reduceHeadlessNotebook(state, { type: "undo" });
		expect(state.tabs[0]?.text).toBe("abc");
	});

	test("parses common headless options once", () => {
		expect(
			parseHeadlessArgs([
				"notebook",
				"--headless",
				"edit",
				"set",
				"--text=hello",
			]),
		).toEqual({
			command: "edit set",
			options: { text: "hello" },
		});
	});

	test("returns versioned JSON command envelopes", async () => {
		const dispatcher = new HeadlessDispatcher();
		const response = await dispatcher.dispatch({ command: "state" });
		expect(response.ok).toBe(true);
		expect(response.version).toBe(1);
	});
});
