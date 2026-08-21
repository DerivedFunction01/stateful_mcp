import { describe, expect, test } from "bun:test";
import { formatChord, normalizeBrowserChord } from "../src/lib/bindings";
import { BrowserKeymapController } from "../src/lib/browser-keymap-controller";
import {
	auditKeymapPolicy,
	classifyChord,
	isRecommendedUserBinding,
	normalizePrimary,
} from "../src/lib/browser-shortcut-policy";

// Polyfill KeyboardEvent and window for Bun test environment.
(globalThis as any).KeyboardEvent = class KeyboardEvent extends Event {
	key: string;
	code: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	constructor(type: string, options: any = {}) {
		super(type, options);
		this.key = options.key ?? "";
		this.code = options.code ?? "";
		this.ctrlKey = options.ctrlKey ?? false;
		this.metaKey = options.metaKey ?? false;
		this.altKey = options.altKey ?? false;
		this.shiftKey = options.shiftKey ?? false;
	}
};

if (typeof (globalThis as any).window === "undefined") {
	const listeners: Record<string, EventListener[]> = {};
	const target = {
		addEventListener: (type: string, listener: EventListener) => {
			listeners[type] ??= [];
			listeners[type].push(listener);
		},
		removeEventListener: (type: string, listener: EventListener) => {
			listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
		},
		dispatchEvent: (event: Event) => {
			for (const listener of listeners[event.type] ?? []) {
				listener.call(target, event);
			}
			return true;
		},
	};
	(globalThis as any).window = target;
}

describe("browser shortcut policy registry completeness", () => {
	test("normalizes ctrl to primary while preserving explicit meta", () => {
		expect(normalizePrimary("ctrl+shift+p")).toBe("primary+shift+p");
		expect(normalizePrimary("meta+p")).toBe("meta+p");
		expect(normalizePrimary("CTRL+P")).toBe("primary+p");
	});

	test("default command chords resolve to known dispositions", () => {
		const defaultChords = [
			"primary+\\",
			"primary+pagedown",
			"primary+pageup",
			"primary+,",
			"primary+shift+f",
			"enter",
			"shift+enter",
		];
		for (const chord of defaultChords) {
			const policy = classifyChord(chord);
			expect(policy.disposition).not.toBe("unknown");
		}
	});

	test("classifies browser chrome shortcuts as unavailable", () => {
		const policy = classifyChord("primary+t");
		expect(policy.disposition).toBe("browser-chrome");
		expect(policy.canPreventDefaultWhenDelivered).toBe(false);
		expect(isRecommendedUserBinding("primary+t")).toBe(false);
	});

	test("does not treat unknown chords as safely remappable", () => {
		const policy = classifyChord("primary+alt+z");
		expect(policy.disposition).toBe("unknown");
		expect(policy.recommendedForUserBinding).toBe(false);
	});
});

describe("platform-aware browser chord normalization", () => {
	test("windows: ctrlKey produces primary, metaKey stays explicit meta", () => {
		const event = {
			key: "p",
			code: "KeyP",
			ctrlKey: true,
			metaKey: false,
			altKey: false,
			shiftKey: false,
		} as Pick<
			KeyboardEvent,
			"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
		>;
		expect(normalizeBrowserChord(event, "windows")).toBe("primary+p");
		expect(normalizeBrowserChord(event, "linux")).toBe("primary+p");
	});

	test("mac: metaKey produces primary, ctrlKey stays explicit ctrl", () => {
		const event = {
			key: "p",
			code: "KeyP",
			ctrlKey: false,
			metaKey: true,
			altKey: false,
			shiftKey: false,
		} as Pick<
			KeyboardEvent,
			"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
		>;
		expect(normalizeBrowserChord(event, "mac")).toBe("primary+p");
	});

	test("mac: ctrlKey stays explicit ctrl even with metaKey", () => {
		const event = {
			key: "p",
			code: "KeyP",
			ctrlKey: true,
			metaKey: true,
			altKey: false,
			shiftKey: false,
		} as Pick<
			KeyboardEvent,
			"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
		>;
		expect(normalizeBrowserChord(event, "mac")).toBe("primary+ctrl+p");
	});

	test("unknown platform: neither ctrl nor meta becomes primary", () => {
		const event = {
			key: "p",
			code: "KeyP",
			ctrlKey: true,
			metaKey: false,
			altKey: false,
			shiftKey: false,
		} as Pick<
			KeyboardEvent,
			"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
		>;
		expect(normalizeBrowserChord(event, "unknown")).toBe("ctrl+p");
	});

	test("windows+P does not match primary+p", () => {
		const event = {
			key: "p",
			code: "KeyP",
			ctrlKey: false,
			metaKey: true,
			altKey: false,
			shiftKey: false,
		} as Pick<
			KeyboardEvent,
			"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
		>;
		expect(normalizeBrowserChord(event, "windows")).toBe("meta+p");
		expect(normalizeBrowserChord(event, "linux")).toBe("meta+p");
	});
});

describe("shortcut display formatting", () => {
	test("formats primary to platform symbol", () => {
		expect(formatChord("primary+p", "mac")).toBe("⌘+P");
		expect(formatChord("primary+p", "windows")).toBe("Ctrl+P");
		expect(formatChord("primary+p", "linux")).toBe("Ctrl+P");
	});

	test("formats explicit ctrl and meta", () => {
		expect(formatChord("ctrl+p", "mac")).toBe("Ctrl+P");
		expect(formatChord("meta+p", "windows")).toBe("Win+P");
		expect(formatChord("meta+p", "mac")).toBe("⌘+P");
	});

	test("formats special keys with title casing", () => {
		expect(formatChord("shift+enter", "windows")).toBe("Shift+Enter");
		expect(formatChord("primary+pageup", "mac")).toBe("⌘+PageUp");
		expect(formatChord("primary+arrowleft", "linux")).toBe("Ctrl+←");
	});
});

describe("auditKeymapPolicy", () => {
	test("reports unknown chords from bindings", () => {
		const result = auditKeymapPolicy([
			{ command: "editor.splitGroup", chords: ["ctrl+\\"] },
			{ command: "custom.action", chords: ["ctrl+shift+x"] },
		]);
		expect(result.unknownChords).toContain("primary+shift+x");
		expect(result.unknownChords).not.toContain("primary+\\");
	});

	test("reports duplicate chords across bindings with overlapping modes", () => {
		const result = auditKeymapPolicy([
			{ command: "cmd.a", chords: ["ctrl+s"], modes: ["NORMAL"] },
			{ command: "cmd.b", chords: ["ctrl+s"], modes: ["NORMAL", "INSERT"] },
		]);
		expect(result.duplicatePolicyChords).toContain("primary+s");
		expect(result.conflictingBindings.length).toBeGreaterThan(0);
		expect((result.conflictingBindings as any)[0].commands).toEqual([
			"cmd.a",
			"cmd.b",
		]);
	});

	test("does not report mode-disjoint bindings as duplicates", () => {
		const result = auditKeymapPolicy([
			{
				command: "editor.executeLine",
				chords: ["enter"],
				modes: ["NORMAL", "VISUAL"],
			},
			{ command: "editor.splitLine", chords: ["enter"], modes: ["INSERT"] },
		]);
		expect(result.duplicatePolicyChords).not.toContain("enter");
		expect(result.conflictingBindings).toHaveLength(0);
	});

	test("returns empty arrays for empty bindings", () => {
		const result = auditKeymapPolicy([]);
		expect(result.unknownChords).toEqual([]);
		expect(result.duplicatePolicyChords).toEqual([]);
		expect(result.conflictingBindings).toEqual([]);
	});

	test("reports unrestricted binding as conflicting with mode-restricted binding", () => {
		const result = auditKeymapPolicy([
			{ command: "cmd.a", chords: ["ctrl+s"] },
			{ command: "cmd.b", chords: ["ctrl+s"], modes: ["NORMAL"] },
		]);
		expect(result.duplicatePolicyChords).toContain("primary+s");
	});
});

describe("BrowserKeymapController dispatch announcements", () => {
	test("preserves Enter for non-Vim editor editing", () => {
		let executed = false;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [{ command: "editor.executeLine", chords: ["enter"] }],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "INSERT" },
				editorFocused: true,
				vimEnabled: false,
			}),
			onCommand: () => {
				executed = true;
			},
			announce: () => undefined,
			platform: "windows",
		});
		controller.attach(window);
		const event = new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
			cancelable: true,
		});
		window.dispatchEvent(event);
		controller.dispose();

		expect(executed).toBe(false);
		expect(event.defaultPrevented).toBe(false);
	});

	test("preserves Shift+Enter for non-Vim editor editing", () => {
		let executed = false;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{ command: "editor.insertLineBreak", chords: ["shift+enter"] },
						],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "INSERT" },
				editorFocused: true,
				vimEnabled: false,
			}),
			onCommand: () => {
				executed = true;
			},
			announce: () => undefined,
			platform: "windows",
		});
		controller.attach(window);
		const event = new KeyboardEvent("keydown", {
			key: "Enter",
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		window.dispatchEvent(event);
		controller.dispose();

		expect(executed).toBe(false);
		expect(event.defaultPrevented).toBe(false);
	});

	test("announces shortcut.unmapped for unknown disposition with resolved command", () => {
		const announcements: { key: string; chord?: string; command?: string }[] =
			[];
		let executedCommand: string | undefined;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{ command: "custom.action", chords: ["primary+shift+x"] },
						],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "NORMAL" },
				editorFocused: false,
			}),
			onCommand: (command) => {
				executedCommand = command;
			},
			announce: (a) => {
				announcements.push(a as any);
			},
			platform: "windows",
		});

		// Simulate a keydown for a chord that resolves to a command but is
		// unknown in the browser policy registry.
		const event = new KeyboardEvent("keydown", {
			key: "x",
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		controller.attach(window);
		window.dispatchEvent(event);
		controller.dispose();

		const unmapped = announcements.find((a) => a.key === "shortcut.unmapped");
		expect(unmapped).toBeDefined();
		expect(unmapped?.chord).toBe("Ctrl+Shift+X");
		expect(unmapped?.command).toBe("custom.action");
		// onCommand should NOT be called for unknown disposition.
		expect(executedCommand).toBeUndefined();
	});

	test("announces shortcut.unavailable for browser-chrome disposition", () => {
		const announcements: { key: string; chord?: string }[] = [];
		let executedCommand: string | undefined;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [{ command: "browser.newTab", chords: ["primary+t"] }],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "NORMAL" },
				editorFocused: false,
			}),
			onCommand: (command) => {
				executedCommand = command;
			},
			announce: (a) => {
				announcements.push(a as any);
			},
			platform: "windows",
		});

		const event = new KeyboardEvent("keydown", {
			key: "t",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		});
		controller.attach(window);
		window.dispatchEvent(event);
		controller.dispose();

		expect(
			announcements.find((a) => a.key === "shortcut.unavailable"),
		).toBeDefined();
		expect(executedCommand).toBeUndefined();
	});

	test("executes command for conditional disposition and formats chord", () => {
		let executed = false;
		const announcements: { key: string; chord?: string }[] = [];
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{ command: "workbench.quickOpen", chords: ["primary+p"] },
						],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "NORMAL" },
				editorFocused: false,
			}),
			onCommand: () => {
				executed = true;
			},
			announce: (a) => {
				announcements.push(a as any);
			},
			platform: "windows",
		});

		const event = new KeyboardEvent("keydown", {
			key: "p",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		});
		controller.attach(window);
		window.dispatchEvent(event);
		controller.dispose();

		expect(executed).toBe(true);
		expect(
			announcements.find((a) => a.key === "shortcut.conditional")?.chord,
		).toBe("Ctrl+P");
	});

	test("dispatches command palette via uiCommandHandlers on Ctrl+Shift+P", () => {
		const announcements: { key: string }[] = [];
		let paletteOpened = false;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{
								command: "workbench.commandPalette",
								chords: ["primary+shift+p"],
							},
						],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "NORMAL" },
				editorFocused: false,
			}),
			onCommand: (command) => {
				if (command === "workbench.commandPalette") paletteOpened = true;
			},
			announce: (a) => {
				announcements.push(a as any);
			},
			platform: "windows",
		});

		const event = new KeyboardEvent("keydown", {
			key: "p",
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		controller.attach(window);
		window.dispatchEvent(event);
		controller.dispose();

		expect(paletteOpened).toBe(true);
	});

	test("dispatches command palette without an active editor mode", () => {
		let paletteOpened = false;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{
								command: "workbench.commandPalette",
								chords: ["primary+shift+p"],
								modes: ["NORMAL", "INSERT", "VISUAL"],
							},
						],
					},
				}) as any,
			getContext: () => ({
				context: {},
				editorFocused: false,
			}),
			onCommand: (command) => {
				if (command === "workbench.commandPalette") paletteOpened = true;
			},
			announce: () => undefined,
			platform: "windows",
		});
		controller.attach(window);
		window.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "P",
				ctrlKey: true,
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		controller.dispose();
		expect(paletteOpened).toBe(true);
	});

	test("dispatches quickOpen find on Ctrl+P", () => {
		const announcements: { key: string }[] = [];
		let findOpened = false;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{ command: "workbench.quickOpen", chords: ["primary+p"] },
						],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "NORMAL" },
				editorFocused: false,
			}),
			onCommand: (command) => {
				if (command === "workbench.quickOpen") findOpened = true;
			},
			announce: (a) => {
				announcements.push(a as any);
			},
			platform: "windows",
		});

		const event = new KeyboardEvent("keydown", {
			key: "p",
			ctrlKey: true,
			bubbles: true,
			cancelable: true,
		});
		controller.attach(window);
		window.dispatchEvent(event);
		controller.dispose();

		expect(findOpened).toBe(true);
	});

	test("dispatches find and replace commands from primary chords", () => {
		const executed: string[] = [];
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{ command: "editor.find", chords: ["primary+f"] },
							{ command: "editor.replace", chords: ["primary+shift+f"] },
						],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "NORMAL" },
				editorFocused: false,
			}),
			onCommand: (command) => {
				executed.push(command);
			},
			announce: () => undefined,
			platform: "windows",
		});
		controller.attach(window);
		window.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "f",
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		window.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "f",
				ctrlKey: true,
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		controller.dispose();
		expect(executed).toEqual(["editor.find", "editor.replace"]);
	});

	test("does not match windows meta+p to primary+p", () => {
		let executed = false;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [
							{ command: "workbench.quickOpen", chords: ["primary+p"] },
						],
					},
				}) as any,
			getContext: () => ({
				context: { editorMode: "NORMAL" },
				editorFocused: false,
			}),
			onCommand: (command) => {
				executed = command === "workbench.quickOpen";
			},
			announce: () => undefined,
			platform: "windows",
		});

		const event = new KeyboardEvent("keydown", {
			key: "p",
			metaKey: true,
			ctrlKey: false,
			bubbles: true,
			cancelable: true,
		});
		controller.attach(window);
		window.dispatchEvent(event);
		controller.dispose();

		expect(executed).toBe(false);
	});
});
