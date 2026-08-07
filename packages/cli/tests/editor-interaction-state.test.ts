import { describe, expect, test } from "bun:test";
import {
	INITIAL_EDITOR_INTERACTION_STATE,
	focusForSection,
	reduceEditorInteraction,
	selectionBounds,
} from "../src/lib/editor/interaction-state";

describe("editor interaction state", () => {
	test("focusForSection maps clinical sections to scratchpad targets", () => {
		expect(focusForSection("assessment")).toBe("assessment-scratchpad");
		expect(focusForSection("subjective")).toBe("subjective-scratchpad");
	});

	test("n-style scratchpad focus remains Normal until Insert is explicit", () => {
		const focused = reduceEditorInteraction(
			INITIAL_EDITOR_INTERACTION_STATE,
			{ type: "focus", target: "assessment-scratchpad" },
		);
		expect(focused.focus).toBe("assessment-scratchpad");
		expect(focused.mode).toBe("NORMAL");
		const inserted = reduceEditorInteraction(focused, { type: "enter-insert" });
		expect(inserted.mode).toBe("INSERT");
	});

	test("cell Visual mode owns a cell range", () => {
		const visual = reduceEditorInteraction(
			reduceEditorInteraction(
				INITIAL_EDITOR_INTERACTION_STATE,
				{ type: "focus", target: "assessment-scratchpad" },
			),
			{ type: "enter-visual", anchor: 2 },
		);
		const extended = reduceEditorInteraction(visual, {
			type: "extend-visual",
			delta: -1,
		});
		expect(extended.cellSelection).toEqual({ anchor: 2, active: 1 });
		expect(selectionBounds(extended.cellSelection!)).toEqual({ start: 1, end: 2 });
	});

	test("Macro console Visual mode owns a text range", () => {
		const visual = reduceEditorInteraction(
			reduceEditorInteraction(INITIAL_EDITOR_INTERACTION_STATE, {
				type: "focus",
				target: "macro-console",
			}),
			{ type: "enter-visual", anchor: 4 },
		);
		const extended = reduceEditorInteraction(visual, {
			type: "extend-visual",
			delta: 1,
		});
		expect(extended.textSelection).toEqual({ anchor: 4, active: 5 });
		expect(extended.cellSelection).toBeNull();
	});

	test("Escape returns to target-local Normal and clears selection", () => {
		const visual = reduceEditorInteraction(
			INITIAL_EDITOR_INTERACTION_STATE,
			{ type: "enter-visual", anchor: 1 },
		);
		const normal = reduceEditorInteraction(visual, { type: "exit-to-normal" });
		expect(normal.mode).toBe("NORMAL");
		expect(normal.cellSelection).toBeNull();
	});

	test("unsupported workspace panes normalize Visual to Normal", () => {
		const focused = reduceEditorInteraction(
			INITIAL_EDITOR_INTERACTION_STATE,
			{ type: "focus", target: "workspace-pane" },
		);
		const mode = reduceEditorInteraction(focused, {
			type: "enter-visual",
			anchor: 0,
		});
		expect(mode.mode).toBe("NORMAL");
		expect(mode.cellSelection).toBeNull();
	});

	test("console toggle changes focus without retaining Visual selection", () => {
		const scratchpad = reduceEditorInteraction(
			INITIAL_EDITOR_INTERACTION_STATE,
			{ type: "focus", target: "assessment-scratchpad" },
		);
		const toggled = reduceEditorInteraction(scratchpad, { type: "toggle-console" });
		expect(toggled.focus).toBe("macro-console");
		expect(toggled.mode).toBe("NORMAL");
		expect(toggled.cellSelection).toBeNull();
	});
});
