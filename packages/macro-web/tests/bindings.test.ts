import { describe, expect, test } from "bun:test";
import { dispatchBinding, type BindingContext } from "../src/lib/bindings";
import { createBrowserVimController } from "../src/lib/browser-vim";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

describe("browser binding contexts", () => {
	test("only dispatches bindings from active contexts", () => {
		const contexts: BindingContext[] = [
			{
				id: "surface:settings",
				active: false,
				bindings: [{ command: "settings.resetField", shortcut: "Escape", context: "surface:settings" }],
			},
			{
				id: "vim:scratchpad",
				active: true,
				bindings: [{ command: "editor.moveLineUp", shortcut: "k", context: "vim:scratchpad" }],
			},
		];

		expect(dispatchBinding("Escape", contexts)).toEqual({ handled: false });
		expect(dispatchBinding("k", contexts)).toEqual({ handled: true, command: "editor.moveLineUp" });
	});

	test("does not intercept native keys with no active binding", () => {
		expect(dispatchBinding("Ctrl+Z", [{ id: "global", active: true, bindings: [] }])).toEqual({ handled: false });
	});

	test("keeps Vim mode scoped to a browser editor context", () => {
		const controller = createBrowserVimController(true);
		const event = (key: string) => ({ key } as ReactKeyboardEvent);
		expect(controller.getState().mode).toBe("NORMAL");
		expect(controller.handleKeyDown(event("i"))).toBe(true);
		expect(controller.getState().mode).toBe("INSERT");
		expect(controller.handleKeyDown(event("Escape"))).toBe(true);
		expect(controller.getState().mode).toBe("NORMAL");
	});
});
