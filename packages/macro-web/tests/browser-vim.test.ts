import { describe, expect, test } from "bun:test";
import { createBrowserVimController } from "../src/lib/browser-vim";

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
	});

	test("resolves structured section-oriented profile (keymap.vim)", () => {
		let text = "alpha\nbeta";
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
});
