import { describe, expect, test } from "bun:test";
import type {
	NotebookEditorAction,
	NotebookEditorState,
} from "@stateful-mcp/clinical/notebook/notebook-state";
import { NotebookDocumentPort } from "../src/lib/windows/notebook/document";

const base = (
	partial: Partial<NotebookEditorState> = {},
): NotebookEditorState => ({
	cells: [],
	activeIndex: 0,
	draftText: "",
	commandLine: "",
	commandHistory: [],
	commandHistoryIndex: -1,
	mode: "NORMAL",
	runMode: "execute",
	authoredRevision: 0,
	persistedAuthoredRevision: 0,
	loading: false,
	message: undefined,
	preview: undefined,
	showHelp: false,
	visualStart: 0,
	visualEnd: 0,
	lastEditCellId: null,
	undoStack: [],
	redoStack: [],
	yankBuffer: null,
	...partial,
});

const finalizedMacroCell = {
	cellId: "macro-cell",
	authored: { rawText: "^note title=Example", finalizedMacro: {} },
} as NotebookEditorState["cells"][number];

describe("NotebookDocumentPort", () => {
	test("move dispatches set_active with delta", () => {
		const actions: NotebookEditorAction[] = [];
		const port = new NotebookDocumentPort(
			base({ activeIndex: 2 }),
			(action) => actions.push(action),
			{},
		);
		port.dispatch({ type: "move", delta: 1 });
		expect(actions).toEqual([{ type: "set_active", index: 3 }]);
	});

	test("insertBelow calls injected callback", () => {
		let belowCalled = false;
		const port = new NotebookDocumentPort(base(), () => {}, {
			insertBelow: () => {
				belowCalled = true;
			},
		});
		port.dispatch({ type: "insertBelow" });
		expect(belowCalled).toBe(true);
	});

	test("enterVisual dispatches set_mode VISUAL", () => {
		const actions: NotebookEditorAction[] = [];
		const port = new NotebookDocumentPort(
			base(),
			(action) => actions.push(action),
			{},
		);
		port.dispatch({ type: "enterVisual" });
		expect(actions).toEqual([{ type: "set_mode", mode: "VISUAL" }]);
	});

	test("extendSelection updates visual selection", () => {
		const actions: NotebookEditorAction[] = [];
		const port = new NotebookDocumentPort(
			base({ visualStart: 2, visualEnd: 2 }),
			(action) => actions.push(action),
			{},
		);
		port.dispatch({ type: "extendSelection", delta: 1 });
		expect(actions).toEqual([
			{ type: "set_visual_selection", start: 2, end: 3 },
		]);
	});

	test("undo dispatches undo action", () => {
		const actions: NotebookEditorAction[] = [];
		const port = new NotebookDocumentPort(
			base(),
			(action) => actions.push(action),
			{},
		);
		port.dispatch({ type: "undo" });
		expect(actions).toEqual([{ type: "undo" }]);
	});

	test("redo dispatches redo action", () => {
		const actions: NotebookEditorAction[] = [];
		const port = new NotebookDocumentPort(
			base(),
			(action) => actions.push(action),
			{},
		);
		port.dispatch({ type: "redo" });
		expect(actions).toEqual([{ type: "redo" }]);
	});

	test("deleteActive calls injected deleteActive callback", () => {
		let deleted = false;
		const port = new NotebookDocumentPort(base(), () => {}, {
			deleteActive: () => {
				deleted = true;
			},
		});
		port.dispatch({ type: "deleteActive" });
		expect(deleted).toBe(true);
	});

	test("yankActive calls injected yankActive callback", () => {
		let yanked = false;
		const port = new NotebookDocumentPort(base(), () => {}, {
			yankActive: () => {
				yanked = true;
			},
		});
		port.dispatch({ type: "yankActive" });
		expect(yanked).toBe(true);
	});

	test("paste calls injected paste callback", () => {
		let pasted = false;
		const port = new NotebookDocumentPort(base(), () => {}, {
			paste: () => {
				pasted = true;
			},
		});
		port.dispatch({ type: "paste" });
		expect(pasted).toBe(true);
	});

	test("pasteAbove calls injected pasteAbove callback", () => {
		let pastedAbove = false;
		const port = new NotebookDocumentPort(base(), () => {}, {
			pasteAbove: () => {
				pastedAbove = true;
			},
		});
		port.dispatch({ type: "pasteAbove" });
		expect(pastedAbove).toBe(true);
	});

	test("deleteSelection calls injected deleteSelection callback", () => {
		let selectionDeleted = false;
		const port = new NotebookDocumentPort(base(), () => {}, {
			deleteSelection: () => {
				selectionDeleted = true;
			},
		});
		port.dispatch({ type: "deleteSelection" });
		expect(selectionDeleted).toBe(true);
	});

	test("yankSelection calls injected yankSelection callback", () => {
		let selectionYanked = false;
		const port = new NotebookDocumentPort(base(), () => {}, {
			yankSelection: () => {
				selectionYanked = true;
			},
		});
		port.dispatch({ type: "yankSelection" });
		expect(selectionYanked).toBe(true);
	});

	test("blocks cell lifecycle actions for finalized Macro history", () => {
		let called = false;
		const actions: NotebookEditorAction[] = [];
		const port = new NotebookDocumentPort(
			base({ cells: [finalizedMacroCell] }),
			(action) => actions.push(action),
			{
				insertBelow: () => {
					called = true;
				},
				deleteActive: () => {
					called = true;
				},
			},
		);

		port.dispatch({ type: "insertBelow" });
		port.dispatch({ type: "deleteActive" });
		port.dispatch({ type: "enterVisual" });
		expect(called).toBe(false);
		expect(actions).toEqual([]);
	});
});
