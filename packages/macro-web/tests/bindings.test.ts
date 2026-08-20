import { describe, expect, test } from "bun:test";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { type BindingContext, dispatchBinding } from "../src/lib/bindings";
import { createBrowserVimController } from "../src/lib/browser-vim";
import { EditorSurfaceRegistry } from "../src/lib/editor-surface-registry";

describe("browser binding contexts", () => {
	test("only dispatches bindings from active contexts", () => {
		const contexts: BindingContext[] = [
			{
				id: "surface:settings",
				active: false,
				bindings: [
					{
						command: "settings.resetField",
						shortcut: "Escape",
						context: "surface:settings",
					},
				],
			},
			{
				id: "vim:scratchpad",
				active: true,
				bindings: [
					{
						command: "editor.moveLineUp",
						shortcut: "k",
						context: "vim:scratchpad",
					},
				],
			},
		];

		expect(dispatchBinding("Escape", contexts)).toEqual({ handled: false });
		expect(dispatchBinding("k", contexts)).toEqual({
			handled: true,
			command: "editor.moveLineUp",
		});
	});

	test("does not intercept native keys with no active binding", () => {
		expect(
			dispatchBinding("Ctrl+Z", [{ id: "global", active: true, bindings: [] }]),
		).toEqual({ handled: false });
	});

	test("keeps Vim mode scoped to a browser editor context", () => {
		const controller = createBrowserVimController(true, {
			keymap: {
				profileId: "default",
				name: "Standard Vim Modal",
				vim: {
					normal: { enterInsert: "i" },
				},
				bindings: [],
			},
		});
		const event = (key: string) =>
			({
				key,
				preventDefault: () => undefined,
			}) as unknown as ReactKeyboardEvent;
		expect(controller.getState().mode).toBe("NORMAL");
		expect(controller.handleKeyDown(event("i"))).toBe(true);
		expect(controller.getState().mode).toBe("INSERT");
		expect(controller.handleKeyDown(event("Escape"))).toBe(true);
		expect(controller.getState().mode).toBe("NORMAL");
	});

	test("does not claim unsupported browser command mode", () => {
		let reported = 0;
		let prevented = 0;
		const controller = createBrowserVimController(true, {
			keymap: {
				profileId: "default",
				name: "Standard Vim Modal",
				vim: {
					normal: { command: ":" },
				},
				bindings: [],
			},
			onCommandModeUnsupported: () => reported++,
		});
		const event = {
			key: ":",
			preventDefault: () => prevented++,
		} as unknown as ReactKeyboardEvent;
		expect(controller.handleKeyDown(event)).toBe(false);
		expect(controller.getState().mode).toBe("NORMAL");
		expect(reported).toBe(1);
		expect(prevented).toBe(0);
	});

	test("selects only the focused registered editor surface", () => {
		const registry = new EditorSurfaceRegistry();
		const first = { id: "first" } as HTMLElement;
		const second = { id: "second" } as HTMLElement;
		const registration = (
			id: string,
			element: HTMLElement,
			focused: boolean,
		) => ({
			id,
			element,
			focused,
			context: { focusedRegion: "main" as const },
			vimEnabled: true,
			mode: "NORMAL" as const,
		});
		registry.register(registration("first", first, false));
		registry.register(registration("second", second, true));
		expect(registry.getActive()?.id).toBe("second");
		registry.update("first", { focused: true });
		expect(registry.getActive()?.id).toBe("first");
		registry.update("second", { focused: false });
		registry.update("first", { focused: false });
		expect(registry.getActive()).toBeUndefined();
		registry.unregister("first");
		expect(registry.list()).toHaveLength(1);
	});
});
