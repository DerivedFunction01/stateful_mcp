import { describe, expect, test } from "bun:test";
import {
	INITIAL__NOTEBOOK_EDITOR_STATE,
	reduceNotebookEditor,
} from "../src/notebook/notebook-state";

const cells = [
	{ cellId: "one" },
	{ cellId: "two" },
	{ cellId: "three" },
] as any;

describe("notebook visual selection bounds", () => {
	test("clamps selection endpoints to visible cell indexes", () => {
		const state = reduceNotebookEditor(
			{ ...INITIAL__NOTEBOOK_EDITOR_STATE, cells },
			{ type: "set_visual_selection", start: -4, end: 99 },
		);
		expect(state.visualStart).toBe(0);
		expect(state.visualEnd).toBe(2);
	});

	test("does not cycle past the last visible cell", () => {
		const state = {
			...INITIAL__NOTEBOOK_EDITOR_STATE,
			cells,
			visualStart: 2,
			visualEnd: 2,
		};
		const next = reduceNotebookEditor(state, {
			type: "set_visual_selection",
			start: state.visualStart,
			end: state.visualEnd + 1,
		});
		expect(next.visualEnd).toBe(2);
	});
});
