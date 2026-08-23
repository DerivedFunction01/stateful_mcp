import { describe, expect, test } from "bun:test";
import {
	createBrowserVimController,
	createBrowserVimGroupManager,
	normalizeChordFromEvent,
} from "../src/lib/browser-vim";

describe("keymap-driven browser Vim controller", () => {
	const defaultProfile = {
		normal: {
			moveDown: "j",
			moveUp: "k",
			moveLeft: "h",
			moveRight: "l",
			enterInsert: "i",
			insertBelow: "o",
			insertAbove: "O",
			enterVisual: "v",
			undo: "u",
			redo: "ctrl+r",
			command: ":",
		},
		sequences: {
			deleteCell: "dd",
			yankCell: "yy",
		},
		visual: {
			deleteSelection: "d",
			extendDown: "j",
			extendUp: "k",
			extendLeft: "h",
			extendRight: "l",
		},
	};

	test("preserves Shift when normalizing primary browser chords", () => {
		expect(
			normalizeChordFromEvent(
				{
					key: "P",
					ctrlKey: true,
					metaKey: false,
					shiftKey: true,
					altKey: false,
					preventDefault: () => undefined,
					stopPropagation: () => undefined,
				},
				"windows",
			),
		).toBe("primary+shift+p");
	});

	test("claims supported mode transitions only when enabled", () => {
		let text = "abc\ndef";
		let selection = { start: 1, end: 1 };
		let prevented = 0;

		const controller = createBrowserVimController(false, {
			getKeymap: () => defaultProfile,
			getAdapter: () => ({
				getText: () => text,
				getSelection: () => selection,
				setSelection: (next) => {
					selection = next;
				},
				replaceSelection: (next) => {
					text =
						text.slice(0, selection.start) + next + text.slice(selection.end);
					selection = {
						start: selection.start + next.length,
						end: selection.start + next.length,
					};
				},
				moveLine: (delta) => {
					selection = {
						start: delta > 0 ? 5 : 1,
						end: delta > 0 ? 5 : 1,
					};
				},
				focus: () => undefined,
			}),
		});

		const event = (key: string) => ({
			key,
			preventDefault: () => {
				prevented++;
			},
			stopPropagation: () => undefined,
		});

		// Disabled -> passes event through
		expect(controller.handleKeyDown(event("i"))).toBe(false);

		// Enabled -> handles keymap actions
		controller.setEnabled(true);
		expect(controller.handleKeyDown(event("i"))).toBe(true);
		expect(controller.getState().mode).toBe("INSERT");

		// INSERT mode allows normal typing
		expect(controller.handleKeyDown(event("x"))).toBe(false);

		// Escape returns to NORMAL
		expect(controller.handleKeyDown(event("Escape"))).toBe(true);
		expect(controller.getState().mode).toBe("NORMAL");

		// Normal motion
		expect(controller.handleKeyDown(event("h"))).toBe(true);
		expect(selection).toEqual({ start: 0, end: 0 });

		// Normal line down motion
		expect(controller.handleKeyDown(event("j"))).toBe(true);
		expect(selection).toEqual({ start: 5, end: 5 });
	});

	test("suppresses unmapped keys in NORMAL mode with zero fallback", () => {
		let selection = { start: 1, end: 1 };
		let prevented = 0;

		// Custom profile where moveDown is 'n' instead of 'j'
		const customProfile = {
			normal: {
				moveDown: "n",
				enterInsert: "i",
			},
			sequences: {
				deleteCell: "xx",
			},
		};

		const controller = createBrowserVimController(true, {
			getKeymap: () => customProfile,
			getAdapter: () => ({
				getText: () => "first\nsecond",
				getSelection: () => selection,
				setSelection: (next) => {
					selection = next;
				},
				replaceSelection: () => undefined,
				moveLine: (delta) => {
					if (delta > 0) selection = { start: 7, end: 7 };
				},
				focus: () => undefined,
			}),
		});

		const event = (key: string) => ({
			key,
			preventDefault: () => {
				prevented++;
			},
			stopPropagation: () => undefined,
		});

		// 'n' moves down
		prevented = 0;
		expect(controller.handleKeyDown(event("n"))).toBe(true);
		expect(selection).toEqual({ start: 7, end: 7 });
		expect(prevented).toBe(1);

		// 'j' is unmapped in this profile: it must NOT move down (Zero Fallback)
		selection = { start: 1, end: 1 };
		prevented = 0;
		expect(controller.handleKeyDown(event("j"))).toBe(true); // Suppressed from inserting text
		expect(selection).toEqual({ start: 1, end: 1 }); // Did NOT trigger moveDown
		expect(prevented).toBe(1);

		// Random letters in NORMAL mode are suppressed from typing
		prevented = 0;
		expect(controller.handleKeyDown(event("t"))).toBe(true);
		expect(prevented).toBe(1);
		expect(controller.getState().mode).toBe("NORMAL");

		// ':' is unmapped in this profile: must NOT enter COMMAND mode (Zero Fallback)
		prevented = 0;
		expect(controller.handleKeyDown(event(":"))).toBe(true);
		expect(prevented).toBe(1);
		expect(controller.getState().mode).toBe("NORMAL");
		expect(controller.getState().commandText).toBe("");
	});

	test("resolves structured section-oriented profile (keymap.vim)", () => {
		const text = "alpha\nbeta";
		let selection = { start: 0, end: 0 };
		let prevented = 0;

		const sectionedProfile = {
			vim: {
				normal: {
					moveDown: "j",
					enterInsert: "i",
				},
				visual: {
					extendDown: "j",
				},
				sequences: {
					deleteCell: "dd",
				},
			},
		};

		const controller = createBrowserVimController(true, {
			getKeymap: () => sectionedProfile,
			getAdapter: () => ({
				getText: () => text,
				getSelection: () => selection,
				setSelection: (next) => {
					selection = next;
				},
				replaceSelection: () => undefined,
				moveLine: (delta) => {
					if (delta > 0) selection = { start: 6, end: 6 };
				},
				focus: () => undefined,
			}),
		});

		const event = (key: string) => ({
			key,
			preventDefault: () => {
				prevented++;
			},
			stopPropagation: () => undefined,
		});

		// Motion via keymap.vim.normal
		expect(controller.handleKeyDown(event("j"))).toBe(true);
		expect(selection).toEqual({ start: 6, end: 6 });

		// Mode transition via keymap.vim.normal
		expect(controller.handleKeyDown(event("i"))).toBe(true);
		expect(controller.getState().mode).toBe("INSERT");
	});

	test("handles cell-aware navigation and cell range selection in VISUAL mode", () => {
		let activeCell = 0;
		let selectedRange: { start: number; end: number } | null = null;
		let executedRange: { start: number; end: number } | null = null;

		const profile = {
			vim: {
				normal: {
					moveDown: "j",
					moveUp: "k",
					enterVisual: "v",
					enterInsert: "i",
					runCell: "r",
					command: ";",
				},
				visual: {
					extendDown: "j",
					extendUp: "k",
					deleteSelection: "d",
					yankSelection: "y",
					swapAnchor: "o",
				},
			},
		};

		let openedCommandQuery: string | undefined;
		let openedAsCommandMode = false;
		let openedCommandToken: string | undefined;

		const controller = createBrowserVimController(true, {
			getKeymap: () => profile,
			onOpenCommandMode: (q, commandMode, commandToken) => {
				openedCommandQuery = q;
				openedAsCommandMode = commandMode === true;
				openedCommandToken = commandToken;
			},
			getAdapter: () => ({
				getActiveCellIndex: () => activeCell,
				setActiveCellIndex: (idx) => {
					activeCell = idx;
				},
				getCellCount: () => 4,
				getSelectedCellRange: () => selectedRange,
				setSelectedCellRange: (r) => {
					selectedRange = r;
				},
				moveCell: (delta) => {
					activeCell = Math.max(0, Math.min(3, activeCell + delta));
				},
				extendCellSelection: (delta) => {
					const next = Math.max(0, Math.min(3, activeCell + delta));
					activeCell = next;
					selectedRange = selectedRange
						? { start: selectedRange.start, end: next }
						: { start: activeCell, end: next };
				},
				swapSelectionAnchor: () => {
					if (selectedRange) {
						selectedRange = {
							start: selectedRange.end,
							end: selectedRange.start,
						};
						activeCell = selectedRange.end;
					}
				},
				executeCellRange: (start, end) => {
					executedRange = { start, end };
				},
				getText: () => "c1\nc2\nc3\nc4",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		const event = (key: string) => ({
			key,
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});

		// 1. Move cell down
		expect(controller.handleKeyDown(event("j"))).toBe(true);
		expect(activeCell).toBe(1);

		// 2. Enter VISUAL mode (cell selection anchored at cell 1)
		expect(controller.handleKeyDown(event("v"))).toBe(true);
		expect(controller.getState().mode).toBe("VISUAL");
		expect(selectedRange!).toEqual({ start: 1, end: 1 });

		// 3. Extend visual range down
		expect(controller.handleKeyDown(event("j"))).toBe(true);
		expect(activeCell).toBe(2);
		expect(selectedRange!).toEqual({ start: 1, end: 2 });

		// 4. Swap anchor in visual mode
		expect(controller.handleKeyDown(event("o"))).toBe(true);
		expect(selectedRange!).toEqual({ start: 2, end: 1 });
		expect(activeCell).toBe(1);

		// 5. Batch execute selected range with 'r'
		expect(controller.handleKeyDown(event("r"))).toBe(true);
		expect(executedRange!).toEqual({ start: 2, end: 1 });
		expect(controller.getState().mode).toBe("NORMAL");
		expect(selectedRange).toBeNull();

		// 6. Enter command mode with configured command key ';'
		expect(controller.handleKeyDown(event(";"))).toBe(true);
		expect(controller.getState().mode).toBe("COMMAND");
		expect(controller.getState().commandText).toBe(";");
		expect(openedCommandQuery).toBe(";");
		expect(openedAsCommandMode).toBe(true);
		expect(openedCommandToken).toBe(";");

		// 7. Closing the command palette returns Vim to NORMAL and clears its text.
		controller.exitCommandMode();
		expect(controller.getState().mode).toBe("NORMAL");
		expect(controller.getState().commandText).toBe("");
		controller.exitCommandMode();
		expect(controller.getState().mode).toBe("NORMAL");
	});

	test("maps pointer targets to logical cells and cellwise drag ranges", () => {
		let caret = { cell: 0, column: 0 };
		const controller = createBrowserVimController(true, {
			variant: "scratchpad",
			getKeymap: () => ({ vim: { normal: {}, visual: {} } }),
			getAdapter: () => ({
				getCellCount: () => 4,
				setCellCaret: (cell, column) => {
					caret = { cell, column };
				},
				getText: () => "one\ntwo\nthree\nfour",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		controller.setPointerTarget(2, 4, 2);
		expect(controller.getState().activeCellIndex).toBe(2);
		expect(controller.getState().mode).toBe("NORMAL");
		expect(caret).toEqual({ cell: 2, column: 2 });

		controller.setPointerTarget(3, 4, 1, true);
		expect(controller.getState().mode).toBe("VISUAL");
		expect(controller.getState().visualRange).toEqual({ start: 2, end: 3 });
		expect(caret).toEqual({ cell: 3, column: 1 });
	});

	test("routes configured search keys to find mode instead of the command palette", () => {
		const directions: string[] = [];
		const controller = createBrowserVimController(true, {
			variant: "scratchpad",
			getKeymap: () => ({
				vim: {
					normal: { search: "f", searchAlt: "b" },
				},
			}),
			onOpenSearch: (direction) => directions.push(direction),
			getAdapter: () => ({
				getCellCount: () => 1,
				getText: () => "text",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		expect(
			controller.handleKeyDown({
				key: "f",
				preventDefault: () => undefined,
				stopPropagation: () => undefined,
			}),
		).toBe(true);
		expect(
			controller.handleKeyDown({
				key: "b",
				preventDefault: () => undefined,
				stopPropagation: () => undefined,
			}),
		).toBe(true);
		expect(
			controller.handleKeyDown({
				key: "/",
				preventDefault: () => undefined,
				stopPropagation: () => undefined,
			}),
		).toBe(true);
		expect(directions).toEqual(["forward", "backward"]);
	});

	test("keeps insert-mode pointer targeting cellwise without entering visual mode", () => {
		const event = (key: string) => ({
			key,
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		let caret = { cell: 0, column: 0 };
		const controller = createBrowserVimController(true, {
			variant: "scratchpad",
			getKeymap: () => defaultProfile,
			getAdapter: () => ({
				getCellCount: () => 4,
				setCellCaret: (cell, column) => {
					caret = { cell, column };
				},
				getText: () => "one\ntwo\nthree\nfour",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		controller.handleKeyDown(event("i"));
		controller.setPointerTarget(2, 4, 3, true);

		expect(controller.getState().mode).toBe("INSERT");
		expect(controller.getState().activeCellIndex).toBe(2);
		expect(controller.getState().caretColumn).toBe(3);
		expect(controller.getState().visualRange).toBeNull();
		expect(caret).toEqual({ cell: 2, column: 3 });
	});

	test("passes the logical cell and column when normal mode enters insert mode", () => {
		const event = (key: string) => ({
			key,
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		let focused: { cell?: number; column?: number } = {};
		const controller = createBrowserVimController(true, {
			variant: "scratchpad",
			getKeymap: () => defaultProfile,
			getAdapter: () => ({
				getCellCount: () => 4,
				setCellCaret: () => undefined,
				focusCellForEdit: (cell, column) => {
					focused = { cell, column };
				},
				getText: () => "one\ntwo\nthree\nfour",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		controller.setPointerTarget(2, 4, 2);
		controller.handleKeyDown(event("i"));

		expect(focused).toEqual({ cell: 2, column: 2 });
		expect(controller.getState().mode).toBe("INSERT");
	});

	test("dispatches insert structural keys through effective keybindings", () => {
		const prevented: string[] = [];
		const inserted: string[] = [];
		const controller = createBrowserVimController(true, {
			variant: "scratchpad",
			getKeymap: () => ({
				bindings: [
					{ command: "editor.enterInsert", chords: ["i"], modes: ["NORMAL"] },
					{ command: "editor.insertTab", chords: ["tab"], modes: ["INSERT"] },
				],
			}),
			getAdapter: () => ({
				getCellCount: () => 1,
				getCellText: () => "macro",
				setCellCaret: () => undefined,
				insertTextAtCaret: (text) => inserted.push(text),
				getText: () => "macro",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		controller.handleKeyDown({
			key: "i",
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		const handled = controller.handleKeyDown({
			key: "Tab",
			preventDefault: () => prevented.push("tab"),
			stopPropagation: () => undefined,
		});

		expect(handled).toBe(true);
		expect(prevented).toEqual(["tab"]);
		expect(inserted).toEqual(["\t"]);
	});

	test("supports multi-chord array bindings for motions and sequences", () => {
		let moved = 0;
		let deleted = 0;
		const controller = createBrowserVimController(true, {
			variant: "scratchpad",
			getKeymap: () => ({
				normal: {
					moveDown: ["j", "down"],
					moveUp: ["k", "up"],
				},
				sequences: {
					deleteCell: ["dd", "xx"],
				},
			}),
			getAdapter: () => ({
				getCellCount: () => 4,
				getCellText: () => "line",
				setCellCaret: () => undefined,
				setActiveCellIndex: () => undefined,
				deleteCell: () => {
					deleted++;
					return "deleted";
				},
				moveLine: (delta) => {
					moved += delta;
				},
				getText: () => "line 1\nline 2\nline 3\nline 4",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		// Motion via "j"
		controller.handleKeyDown({
			key: "j",
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		expect(controller.getState().activeCellIndex).toBe(1);

		// Motion via "ArrowDown" (chord "down")
		controller.handleKeyDown({
			key: "ArrowDown",
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		expect(controller.getState().activeCellIndex).toBe(2);

		// Motion via "ArrowUp" (chord "up")
		controller.handleKeyDown({
			key: "ArrowUp",
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		expect(controller.getState().activeCellIndex).toBe(1);

		// Alternate sequence "xx"
		controller.handleKeyDown({
			key: "x",
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		controller.handleKeyDown({
			key: "x",
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});
		expect(deleted).toBe(1);
	});

	test("dispatches editor.executeValidLines on primary+shift+enter in standard and Vim mode", () => {
		let executed = false;
		const controller = createBrowserVimController(false, {
			variant: "scratchpad",
			getKeymap: () => ({
				bindings: [
					{
						command: "editor.executeValidLines",
						chords: ["primary+shift+enter"],
						modes: ["NORMAL", "INSERT", "VISUAL"],
					},
				],
			}),
			onExecuteValidLines: () => {
				executed = true;
			},
			getAdapter: () => ({
				getText: () => "line 1\nline 2",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		// Trigger Ctrl+Shift+Enter in standard / Insert mode
		const handled = controller.handleKeyDown({
			key: "Enter",
			ctrlKey: true,
			shiftKey: true,
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});

		expect(handled).toBe(true);
		expect(executed).toBe(true);
	});

	test("operates on continuous text buffers in generic variant without cell execution", () => {
		let text = "hello world\nsecond line here\nthird line";
		let selection = { start: 0, end: 0 };
		const deletedLines: string[] = [];
		const pasted: string[] = [];

		const genericProfile = {
			vim: {
				normal: {
					moveDown: "j",
					moveUp: "k",
					moveLeft: "h",
					moveRight: "l",
					moveWord: "w",
					moveWordBackward: "b",
					moveToLineStart: "0",
					moveToLineEnd: "$",
					moveToFirstNonBlank: "^",
					deleteChar: "x",
					enterInsert: "i",
					enterVisual: "v",
					pasteBelow: "p",
					nextMatch: "n",
					previousMatch: "N",
				},
				sequences: {
					deleteLine: "dd",
					yankLine: "yy",
				},
				visual: {
					deleteSelection: "d",
					yankSelection: "y",
					pasteSelection: "p",
					extendDown: "j",
					extendUp: "k",
					extendLeft: "h",
					extendRight: "l",
				},
			},
		};

		const controller = createBrowserVimController(true, {
			variant: "generic",
			getKeymap: () => genericProfile,
			getAdapter: () => ({
				getText: () => text,
				getSelection: () => selection,
				setSelection: (next) => {
					selection = next;
				},
				replaceSelection: (replacement) => {
					const min = Math.min(selection.start, selection.end);
					const max = Math.max(selection.start, selection.end);
					text = text.slice(0, min) + replacement + text.slice(max);
					selection = {
						start: min + replacement.length,
						end: min + replacement.length,
					};
				},
				moveLine: (delta) => {
					selection = {
						start: delta > 0 ? 12 : 0,
						end: delta > 0 ? 12 : 0,
					};
				},
				moveToLineBoundary: (boundary) => {
					selection = {
						start: boundary === "end" ? 11 : 0,
						end: boundary === "end" ? 11 : 0,
					};
				},
				moveWord: (direction) => {
					selection = {
						start: direction > 0 ? 6 : 0,
						end: direction > 0 ? 6 : 0,
					};
				},
				deleteCharUnderCaret: () => {
					text =
						text.slice(0, selection.start) + text.slice(selection.start + 1);
				},
				deleteCurrentLine: () => {
					const lines = text.split("\n");
					const del = lines.shift() ?? "";
					deletedLines.push(del);
					text = lines.join("\n");
					return del;
				},
				pasteCell: (content, position) => {
					pasted.push(`${position}:${content}`);
				},
				focus: () => undefined,
			}),
		});

		const event = (key: string) => ({
			key,
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});

		// 1. Move word forward
		controller.handleKeyDown(event("w"));
		expect(selection).toEqual({ start: 6, end: 6 });

		// 2. Move to line end
		controller.handleKeyDown(event("$"));
		expect(selection).toEqual({ start: 11, end: 11 });

		// 3. Delete char under cursor
		selection = { start: 0, end: 0 };
		controller.handleKeyDown(event("x"));
		expect(text.startsWith("ello")).toBe(true);

		// 4. Line delete sequence "dd"
		controller.handleKeyDown(event("d"));
		controller.handleKeyDown(event("d"));
		expect(deletedLines).toEqual(["ello world"]);
		expect(text).toBe("second line here\nthird line");

		// 5. Visual character selection and deletion
		selection = { start: 0, end: 7 };
		controller.handleKeyDown(event("v"));
		expect(controller.getState().mode).toBe("VISUAL");
		controller.handleKeyDown(event("d"));
		expect(controller.getState().mode).toBe("NORMAL");
		expect(text).toBe("line here\nthird line");
	});

	test("dynamically routes variant based on function evaluator", () => {
		let currentProvider: "file" | "scratchpad" = "scratchpad";
		let cellExecuted = false;

		const controller = createBrowserVimController(true, {
			variant: () => (currentProvider === "file" ? "generic" : "scratchpad"),
			getKeymap: () => ({
				vim: {
					normal: {
						runCell: "r",
						moveDown: "j",
					},
				},
			}),
			onExecuteLine: () => {
				if (currentProvider !== "file") {
					cellExecuted = true;
				}
			},
			getAdapter: () => ({
				getCellCount: () => 3,
				getActiveCellIndex: () => 0,
				getText: () => "line 1\nline 2\nline 3",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		const event = (key: string) => ({
			key,
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});

		// Scratchpad mode -> r executes cell
		controller.handleKeyDown(event("r"));
		expect(cellExecuted).toBe(true);

		// Switch to file document
		cellExecuted = false;
		currentProvider = "file";
		controller.handleKeyDown(event("r"));
		expect(cellExecuted).toBe(false);
	});

	test("yields unmapped modifier chords in NORMAL, VISUAL, and INSERT modes to workbench controller", () => {
		let prevented = false;
		const makeEvent = (
			key: string,
			modifiers: {
				ctrlKey?: boolean;
				metaKey?: boolean;
				altKey?: boolean;
				shiftKey?: boolean;
			} = {},
		) => ({
			key,
			ctrlKey: modifiers.ctrlKey ?? false,
			metaKey: modifiers.metaKey ?? false,
			altKey: modifiers.altKey ?? false,
			shiftKey: modifiers.shiftKey ?? false,
			preventDefault: () => {
				prevented = true;
			},
			stopPropagation: () => undefined,
		});

		const controller = createBrowserVimController(true, {
			getKeymap: () => ({
				vim: {
					normal: {
						moveDown: "j",
						enterInsert: "i",
						enterVisual: "v",
						redo: "ctrl+r",
					},
					visual: {
						extendDown: "j",
					},
				},
			}),
			getAdapter: () => ({
				getCellCount: () => 3,
				getActiveCellIndex: () => 0,
				getText: () => "line 1\nline 2\nline 3",
				getSelection: () => ({ start: 0, end: 0 }),
				setSelection: () => undefined,
				replaceSelection: () => undefined,
				focus: () => undefined,
			}),
		});

		// 1. NORMAL mode: Unmapped modifier chord (ctrl+shift+p) returns false and does NOT preventDefault
		prevented = false;
		const handledPalette = controller.handleKeyDown(
			makeEvent("P", { ctrlKey: true, shiftKey: true }),
		);
		expect(handledPalette).toBe(false);
		expect(prevented).toBe(false);

		// 2. NORMAL mode: Mapped vim modifier chord (ctrl+r) returns true and preventsDefault
		prevented = false;
		const handledRedo = controller.handleKeyDown(
			makeEvent("r", { ctrlKey: true }),
		);
		expect(handledRedo).toBe(true);
		expect(prevented).toBe(true);

		// 3. NORMAL mode: Unmapped bare character (z) returns true and suppresses text typing (preventDefault = true)
		prevented = false;
		const handledBareKey = controller.handleKeyDown(makeEvent("z"));
		expect(handledBareKey).toBe(true);
		expect(prevented).toBe(true);

		// 4. Enter VISUAL mode (v): Unmapped modifier chord (ctrl+b) returns false
		controller.handleKeyDown(makeEvent("v"));
		expect(controller.getState().mode).toBe("VISUAL");
		prevented = false;
		const handledVisualMod = controller.handleKeyDown(
			makeEvent("b", { ctrlKey: true }),
		);
		expect(handledVisualMod).toBe(false);
		expect(prevented).toBe(false);

		// 5. Enter INSERT mode (i): Unmapped modifier chord (ctrl+s) returns false
		controller.handleKeyDown(makeEvent("Escape")); // exit visual
		controller.handleKeyDown(makeEvent("i")); // enter insert
		expect(controller.getState().mode).toBe("INSERT");
		prevented = false;
		const handledInsertMod = controller.handleKeyDown(
			makeEvent("s", { ctrlKey: true }),
		);
		expect(handledInsertMod).toBe(false);
		expect(prevented).toBe(false);
	});
});

describe("BrowserVimGroupManager multi-group per-view modal state", () => {
	const defaultProfile = {
		normal: {
			moveDown: "j",
			moveUp: "k",
			enterInsert: "i",
			enterVisual: "v",
			command: ":",
		},
		sequences: {
			deleteCell: "dd",
		},
		visual: {
			extendDown: "j",
			deleteSelection: "d",
		},
	};

	const makeEvent = (key: string) => ({
		key,
		preventDefault: () => undefined,
		stopPropagation: () => undefined,
	});

	test("maintains independent modal states across groups viewing the same document", () => {
		let groupAOpenedPalette = false;
		const manager = createBrowserVimGroupManager(true, {
			getKeymap: () => defaultProfile,
			onOpenCommandMode: () => {
				groupAOpenedPalette = true;
			},
		});

		manager.initGroup("group-1", "doc-1");
		manager.initGroup("group-2", "doc-1");

		expect(manager.getState("group-1").mode).toBe("NORMAL");
		expect(manager.getState("group-2").mode).toBe("NORMAL");

		// Put Group 1 into INSERT mode
		manager.handleKeyDown("group-1", makeEvent("i"));
		expect(manager.getState("group-1").mode).toBe("INSERT");
		expect(manager.getState("group-2").mode).toBe("NORMAL");

		// Group 2 remains in NORMAL and handles motion without changing Group 1
		manager.handleKeyDown("group-2", makeEvent("j"));
		expect(manager.getState("group-2").mode).toBe("NORMAL");
		expect(manager.getState("group-1").mode).toBe("INSERT");

		// Group 1 enters command mode
		manager.handleKeyDown("group-1", makeEvent("Escape"));
		manager.handleKeyDown("group-1", makeEvent(":"));
		expect(manager.getState("group-1").mode).toBe("COMMAND");
		expect(manager.getState("group-2").mode).toBe("NORMAL");
		expect(groupAOpenedPalette).toBe(true);

		// Exiting command mode resets only group 1
		manager.exitCommandMode("group-1");
		expect(manager.getState("group-1").mode).toBe("NORMAL");
	});

	test("resets mode and restores preserved cursor when switching documents in a group", () => {
		const manager = createBrowserVimGroupManager(true, {
			getKeymap: () => defaultProfile,
		});

		const g1 = manager.initGroup("group-1", "doc-A");
		g1.setActiveCell(3, 10, 5);
		g1.handleKeyDown(makeEvent("i"));
		expect(g1.getState().mode).toBe("INSERT");

		// Switch to doc-B: resets to NORMAL and starts with default cursor
		g1.activateDocument("doc-B");
		expect(g1.getState().mode).toBe("NORMAL");
		expect(g1.getState().activeCellIndex).toBe(0);

		// Move in doc-B
		g1.setActiveCell(1, 10, 2);

		// Switch back to doc-A: resets to NORMAL and restores doc-A cursor (cell 3, col 5)
		g1.activateDocument("doc-A");
		expect(g1.getState().mode).toBe("NORMAL");
		expect(g1.getState().activeCellIndex).toBe(3);
		expect(g1.getState().caretColumn).toBe(5);
	});

	test("resets transient visual and sequence state on view reset without losing cursor", () => {
		const manager = createBrowserVimGroupManager(true, {
			getKeymap: () => defaultProfile,
		});

		const g1 = manager.initGroup("group-1", "doc-1");
		g1.setActiveCell(2, 5, 3);
		g1.handleKeyDown(makeEvent("v"));
		expect(g1.getState().mode).toBe("VISUAL");

		// Blur / focus loss resets view to NORMAL
		g1.resetView("blur");
		expect(g1.getState().mode).toBe("NORMAL");
		expect(g1.getState().visualRange).toBeNull();
		expect(g1.getState().activeCellIndex).toBe(2);
		expect(g1.getState().caretColumn).toBe(3);
	});

	test("toggling global enabled preference updates all active groups", () => {
		const manager = createBrowserVimGroupManager(false, {
			getKeymap: () => defaultProfile,
		});

		manager.initGroup("group-1", "doc-1");
		manager.initGroup("group-2", "doc-2");

		expect(manager.getState("group-1").mode).toBe("INSERT");
		expect(manager.getState("group-2").mode).toBe("INSERT");

		manager.setEnabled(true);
		expect(manager.getState("group-1").mode).toBe("NORMAL");
		expect(manager.getState("group-2").mode).toBe("NORMAL");

		manager.setEnabled(false);
		expect(manager.getState("group-1").mode).toBe("INSERT");
		expect(manager.getState("group-2").mode).toBe("INSERT");
	});
});
