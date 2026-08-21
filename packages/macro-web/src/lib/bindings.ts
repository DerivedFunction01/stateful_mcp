export type BindingContextId =
	| "global"
	| `surface:${string}`
	| `component:${string}`
	| `vim:${string}`;

export interface CommandBinding {
	readonly command: string;
	readonly shortcut: string;
	readonly context: BindingContextId;
	readonly when?: string;
}

export interface BindingContext {
	readonly id: BindingContextId;
	readonly active: boolean;
	readonly bindings: readonly CommandBinding[];
}

export interface BindingDispatchResult {
	readonly handled: boolean;
	readonly command?: string;
}

export type ShortcutPlatform = "mac" | "windows" | "linux" | "unknown";

/** Resolve the current browser platform once. */
export function getBrowserShortcutPlatform(): ShortcutPlatform {
	if (typeof navigator === "undefined") return "unknown";
	const uaData = (navigator as any).userAgentData;
	if (uaData?.platform) {
		const p = String(uaData.platform).toLowerCase();
		if (p.includes("mac")) return "mac";
		if (p.includes("win")) return "windows";
		if (p.includes("linux")) return "linux";
		return "unknown";
	}
	const platform = String((navigator as any).platform ?? "").toLowerCase();
	if (platform.includes("mac")) return "mac";
	if (platform.includes("win")) return "windows";
	if (platform.includes("linux")) return "linux";
	return "unknown";
}

/**
 * Normalize a DOM key event into a canonical chord string. The `platform`
 * parameter determines which physical modifier is emitted as the semantic
 * `primary` token:
 *   - windows/linux: `ctrlKey` → `primary`, `metaKey` → explicit `meta`
 *   - mac: `metaKey` → `primary`, `ctrlKey` → explicit `ctrl`
 *   - unknown: neither modifier is classified as `primary`
 *
 * `alt`/`Option` is intentionally dropped because it is not a first-class
 * canonical modifier and browser Alt combos are OS/chrome-owned. The browser
 * keymap controller rejects Alt events entirely.
 */
export function normalizeBrowserChord(
	event: Pick<
		KeyboardEvent,
		"key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
	>,
	platform: ShortcutPlatform,
): string {
	const modifiers: string[] = [];
	const ctrl = event.ctrlKey;
	const meta = event.metaKey;
	switch (platform) {
		case "windows":
		case "linux":
			if (ctrl) modifiers.push("primary");
			if (meta) modifiers.push("meta");
			break;
		case "mac":
			if (meta) modifiers.push("primary");
			if (ctrl) modifiers.push("ctrl");
			break;
		default:
			if (ctrl) modifiers.push("ctrl");
			if (meta) modifiers.push("meta");
			break;
	}
	if (event.shiftKey) modifiers.push("shift");
	const key =
		event.key.length === 1
			? event.key.toLowerCase()
			: event.key.toLowerCase().replace(/^arrow/, "");
	return [...modifiers, key || event.code.toLowerCase()].join("+");
}

/** Map semantic tokens to display-friendly labels for the given platform. */
const KEY_LABELS: Record<string, Record<ShortcutPlatform, string>> = {
	primary: { mac: "⌘", windows: "Ctrl", linux: "Ctrl", unknown: "Ctrl" },
	ctrl: { mac: "Ctrl", windows: "Ctrl", linux: "Ctrl", unknown: "Ctrl" },
	meta: { mac: "⌘", windows: "Win", linux: "Win", unknown: "Win" },
	shift: { mac: "Shift", windows: "Shift", linux: "Shift", unknown: "Shift" },
	alt: { mac: "Alt", windows: "Alt", linux: "Alt", unknown: "Alt" },
	enter: { mac: "Enter", windows: "Enter", linux: "Enter", unknown: "Enter" },
	escape: {
		mac: "Escape",
		windows: "Escape",
		linux: "Escape",
		unknown: "Escape",
	},
	tab: { mac: "Tab", windows: "Tab", linux: "Tab", unknown: "Tab" },
	arrowup: { mac: "↑", windows: "↑", linux: "↑", unknown: "↑" },
	arrowdown: { mac: "↓", windows: "↓", linux: "↓", unknown: "↓" },
	arrowleft: { mac: "←", windows: "←", linux: "←", unknown: "←" },
	arrowright: { mac: "→", windows: "→", linux: "→", unknown: "→" },
	home: { mac: "Home", windows: "Home", linux: "Home", unknown: "Home" },
	end: { mac: "End", windows: "End", linux: "End", unknown: "End" },
	pageup: {
		mac: "PageUp",
		windows: "PageUp",
		linux: "PageUp",
		unknown: "PageUp",
	},
	pagedown: {
		mac: "PageDown",
		windows: "PageDown",
		linux: "PageDown",
		unknown: "PageDown",
	},
	up: { mac: "↑", windows: "↑", linux: "↑", unknown: "↑" },
	down: { mac: "↓", windows: "↓", linux: "↓", unknown: "↓" },
	left: { mac: "←", windows: "←", linux: "←", unknown: "←" },
	right: { mac: "→", windows: "→", linux: "→", unknown: "→" },
	backspace: {
		mac: "Backspace",
		windows: "Backspace",
		linux: "Backspace",
		unknown: "Backspace",
	},
	delete: { mac: "Del", windows: "Del", linux: "Del", unknown: "Del" },
	insert: { mac: "Ins", windows: "Ins", linux: "Ins", unknown: "Ins" },
	capslock: { mac: "Caps", windows: "Caps", linux: "Caps", unknown: "Caps" },
};

/**
 * Format a canonical chord string for display using platform-appropriate
 * symbols. Does not mutate the stored chord.
 */
export function formatChord(chord: string, platform: ShortcutPlatform): string {
	const safePlatform = platform === "unknown" ? "windows" : platform;
	return chord
		.split("+")
		.map((part) => {
			const lower = part.toLowerCase();
			if (KEY_LABELS[lower]) return KEY_LABELS[lower][safePlatform];
			if (lower.length === 1) return lower.toUpperCase();
			return part;
		})
		.join("+");
}

export function resolveBrowserBinding(
	chord: string,
	contexts: readonly BindingContext[],
): BindingDispatchResult {
	return dispatchBinding(chord, contexts);
}

export function dispatchBinding(
	shortcut: string,
	contexts: readonly BindingContext[],
): BindingDispatchResult {
	for (const context of contexts) {
		if (!context.active) continue;
		const binding = context.bindings.find((item) => item.shortcut === shortcut);
		if (binding) return { handled: true, command: binding.command };
	}
	return { handled: false };
}
