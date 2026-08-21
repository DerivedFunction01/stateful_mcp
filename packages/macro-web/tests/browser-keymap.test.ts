import { describe, expect, test } from "bun:test";
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
	test("normalizes ctrl/meta to primary", () => {
		expect(normalizePrimary("ctrl+shift+p")).toBe("primary+shift+p");
		expect(normalizePrimary("meta+p")).toBe("primary+p");
		expect(normalizePrimary("CTRL+P")).toBe("primary+p");
	});

	test("default command chords resolve to known dispositions", () => {
		const defaultChords = [
			"primary+\\",
			"primary+pagedown",
			"primary+pageup",
			"primary+,",
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

describe("auditKeymapPolicy", () => {
	test("reports unknown chords from snapshot bindings", () => {
		const snapshot = {
			keymap: {
				bindings: [
					{ command: "editor.splitGroup", chords: ["ctrl+\\"] },
					{ command: "custom.action", chords: ["ctrl+shift+x"] },
				],
			},
		} as const;
		const result = auditKeymapPolicy(snapshot);
		expect(result.unknownChords).toContain("primary+shift+x");
		expect(result.unknownChords).not.toContain("primary+\\");
	});

	test("reports duplicate chords across bindings", () => {
		const snapshot = {
			keymap: {
				bindings: [
					{ command: "cmd.a", chords: ["ctrl+s"] },
					{ command: "cmd.b", chords: ["ctrl+s"] },
				],
			},
		} as const;
		const result = auditKeymapPolicy(snapshot);
		expect(result.duplicatePolicyChords).toContain("primary+s");
	});

	test("returns empty arrays for undefined snapshot", () => {
		const result = auditKeymapPolicy(undefined);
		expect(result.unknownChords).toEqual([]);
		expect(result.duplicatePolicyChords).toEqual([]);
	});
});

describe("BrowserKeymapController dispatch announcements", () => {
	test("announces shortcut.unmapped for unknown disposition with resolved command", () => {
		const announcements: { key: string; chord?: string; command?: string }[] =
			[];
		let executedCommand: string | undefined;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [{ command: "custom.action", chords: ["ctrl+shift+x"] }],
					},
				}) as any,
			getContext: () => ({
				context: {},
				editorFocused: false,
			}),
			onCommand: (command) => {
				executedCommand = command;
			},
			announce: (a) => {
				announcements.push(a as any);
			},
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
		expect(unmapped?.chord).toBe("ctrl+shift+x");
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
						bindings: [{ command: "browser.newTab", chords: ["ctrl+t"] }],
					},
				}) as any,
			getContext: () => ({
				context: {},
				editorFocused: false,
			}),
			onCommand: (command) => {
				executedCommand = command;
			},
			announce: (a) => {
				announcements.push(a as any);
			},
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

	test("executes command for conditional disposition", () => {
		let executed = false;
		const controller = new BrowserKeymapController({
			getSnapshot: () =>
				({
					keymap: {
						bindings: [{ command: "workbench.quickOpen", chords: ["ctrl+p"] }],
					},
				}) as any,
			getContext: () => ({
				context: {},
				editorFocused: false,
			}),
			onCommand: () => {
				executed = true;
			},
			announce: () => undefined,
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
	});
});
