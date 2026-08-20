import { describe, expect, test } from "bun:test";
import { createBrowserVimController } from "../src/lib/browser-vim";

describe("real editor browser Vim adapter", () => {
	test("claims supported mode transitions only when enabled", () => {
		let text = "abc";
		let selection = { start: 1, end: 1 };
		const controller = createBrowserVimController(false, {
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
				focus: () => undefined,
			}),
		});
		const event = (key: string) => ({
			key,
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
		});

		expect(controller.handleKeyDown(event("i"))).toBe(false);
		controller.setEnabled(true);
		expect(controller.handleKeyDown(event("i"))).toBe(true);
		expect(controller.getState().mode).toBe("INSERT");
		expect(controller.handleKeyDown(event("Escape"))).toBe(true);
		expect(controller.getState().mode).toBe("NORMAL");
		expect(controller.handleKeyDown(event("h"))).toBe(true);
		expect(selection).toEqual({ start: 0, end: 0 });
	});
});
