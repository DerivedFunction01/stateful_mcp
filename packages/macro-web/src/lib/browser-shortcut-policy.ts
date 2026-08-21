/**
 * Browser-owned shortcut capability policy.
 *
 * This registry is advisory capability metadata only. It is NOT a default Macro
 * keymap and NOT a command mapping. It answers whether a user-entered chord is
 * safe, conditional, discouraged, or unavailable in a web page, so the keymap
 * UI and diagnostics can warn correctly. It must never force `primary+p` or
 * `primary+shift+p` to any Macro command — those come only from the effective
 * Macro/browser keymap.
 *
 * Chords use the platform-neutral `primary` token: `primary` maps to Ctrl on
 * Windows/Linux and to Command (meta) on macOS.
 */

export type BrowserShortcutDisposition =
	| "page-default"
	| "conditional"
	| "browser-chrome"
	| "platform-reserved"
	| "discouraged"
	| "unknown";

export interface BrowserShortcutPolicy {
	readonly chord: string;
	readonly disposition: BrowserShortcutDisposition;
	readonly browserNotes: readonly string[];
	readonly recommendedForUserBinding: boolean;
	readonly canPreventDefaultWhenDelivered: boolean;
	/** Preserve native clipboard/undo/redo/selection when not claimed. */
	readonly nativeEditing?: boolean;
	/** Accessibility-sensitive; warn even if otherwise usable. */
	readonly accessibilitySensitive?: boolean;
}

export const BROWSER_SHORTCUT_POLICY_VERSION = 1;

function entry(
	chord: string,
	disposition: BrowserShortcutDisposition,
	browserNotes: readonly string[],
	options: Partial<BrowserShortcutPolicy> = {},
): BrowserShortcutPolicy {
	return {
		chord,
		disposition,
		browserNotes,
		recommendedForUserBinding:
			options.recommendedForUserBinding ??
			(disposition === "page-default" || disposition === "conditional"),
		canPreventDefaultWhenDelivered:
			options.canPreventDefaultWhenDelivered ??
			(disposition === "page-default" || disposition === "conditional"),
		...options,
	};
}

const REGISTRY: readonly BrowserShortcutPolicy[] = [
	// ── Browser chrome / window / tab: never recommend for Macro commands ──
	entry("primary+n", "browser-chrome", ["new window / private window"]),
	entry("primary+shift+n", "browser-chrome", ["new private/incognito window"]),
	entry("primary+t", "browser-chrome", ["new tab"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+shift+t", "browser-chrome", ["reopen closed tab"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+w", "browser-chrome", ["close tab/window"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+shift+w", "browser-chrome", ["close window"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+tab", "browser-chrome", ["next browser tab"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+shift+tab", "browser-chrome", ["previous browser tab"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+1", "browser-chrome", ["select browser tab 1"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+2", "browser-chrome", ["select browser tab 2"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+3", "browser-chrome", ["select browser tab 3"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+4", "browser-chrome", ["select browser tab 4"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+5", "browser-chrome", ["select browser tab 5"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+6", "browser-chrome", ["select browser tab 6"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+7", "browser-chrome", ["select browser tab 7"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+8", "browser-chrome", ["select browser tab 8"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+9", "browser-chrome", ["select browser tab 9"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+l", "browser-chrome", ["address bar focus"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("alt+d", "browser-chrome", ["address bar focus (Windows/Linux)"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("f6", "browser-chrome", ["address bar / toolbar focus cycle"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+k", "browser-chrome", ["address-bar search (some browsers)"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+e", "browser-chrome", ["address-bar search"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+b", "page-default", [
		"toggle primary sidebar (VS Code convention)",
	]),
	entry("primary+h", "browser-chrome", ["browser history page"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+j", "browser-chrome", ["browser downloads page"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+shift+b", "browser-chrome", ["bookmarks bar toggle"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+shift+o", "browser-chrome", ["bookmarks manager"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("shift+escape", "browser-chrome", ["browser task manager (Chrome)"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("f10", "browser-chrome", ["browser toolbar/menu focus"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+shift+delete", "browser-chrome", ["clear browsing data"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("alt+f4", "browser-chrome", ["close window (Windows/Linux)"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry("primary+q", "browser-chrome", ["quit browser (macOS)"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),

	// ── Page/default + conditional: deliverable but vary by browser ──
	entry("primary+p", "conditional", ["print", "often browser-handled"], {
		browserNotes: ["VS Code-style quick-open is conditional here"],
	}),
	entry("primary+shift+p", "conditional", [
		"private-window or browser-specific action in some environments",
	]),
	entry("primary+f", "conditional", ["browser Find"]),
	entry("f3", "conditional", ["browser Find next"]),
	entry("primary+g", "conditional", ["next Find match"]),
	entry("primary+shift+g", "conditional", ["previous Find match"]),
	entry("primary+s", "conditional", ["save page"]),
	entry("f5", "conditional", ["reload"]),
	entry("primary+r", "conditional", ["reload"]),
	entry("primary+shift+r", "conditional", ["hard reload"]),
	entry("primary+o", "conditional", ["open file"]),
	entry("primary+u", "conditional", ["view source"]),
	entry("primary+d", "conditional", ["bookmark page"]),
	entry("primary+shift+d", "conditional", ["bookmark tabs"]),
	entry("primary+plus", "conditional", ["browser zoom in"], {
		recommendedForUserBinding: false,
	}),
	entry("primary+minus", "conditional", ["browser zoom out"], {
		recommendedForUserBinding: false,
	}),
	entry("primary+0", "conditional", ["reset browser zoom"], {
		recommendedForUserBinding: false,
	}),
	entry("f1", "conditional", ["browser/OS help"]),
	entry("f7", "conditional", ["caret browsing / accessibility"], {
		accessibilitySensitive: true,
	}),
	entry("primary+shift+i", "conditional", ["developer tools"]),
	entry("f12", "conditional", ["developer tools"]),
	entry("primary+shift+j", "conditional", ["web console"]),
	entry("primary+shift+k", "conditional", ["web console (Firefox)"]),
	entry(
		"escape",
		"discouraged",
		[
			"stop loading / close browser UI",
			"use only in an active modal/chord/editor context",
		],
		{
			recommendedForUserBinding: false,
		},
	),
	entry(
		"tab",
		"discouraged",
		[
			"browser/page focus traversal",
			"use roving focus within owned widgets only",
		],
		{
			recommendedForUserBinding: false,
			canPreventDefaultWhenDelivered: false,
		},
	),
	entry("shift+tab", "discouraged", ["browser/page focus traversal"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),

	// ── Native editing / accessibility: keep unless an owned editor claims ──
	entry("primary+c", "page-default", ["native copy"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("primary+x", "page-default", ["native cut"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("primary+v", "page-default", ["native paste"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("primary+z", "page-default", ["native undo"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("primary+shift+z", "page-default", ["native redo"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("primary+a", "page-default", ["native select-all"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("home", "page-default", ["cursor/scroll move"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("end", "page-default", ["cursor/scroll move"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("pageup", "page-default", ["viewport scroll"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("pagedown", "page-default", ["viewport scroll"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("arrowup", "page-default", ["caret/list/scroll navigation"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("arrowdown", "page-default", ["caret/list/scroll navigation"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("arrowleft", "page-default", ["caret/list/scroll navigation"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),
	entry("arrowright", "page-default", ["caret/list/scroll navigation"], {
		nativeEditing: true,
		canPreventDefaultWhenDelivered: false,
		recommendedForUserBinding: false,
	}),

	// ── Function keys (conservative) ──
	entry("f2", "conditional", ["OS/editor/accessibility dependent"]),
	entry("f4", "conditional", [
		"system/window or address-bar on some platforms",
	]),
	entry("f8", "conditional", ["platform/laptop/AT dependent"]),
	entry("f9", "conditional", ["platform/laptop/AT dependent"]),
	entry("f11", "browser-chrome", ["browser fullscreen (OS-owned)"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),

	// ── Macro default bindings (must be present to avoid unknown disposition) ──
	entry("primary+\\", "page-default", ["editor split group"]),
	entry("primary+pagedown", "page-default", [
		"next editor tab / viewport scroll",
	]),
	entry("primary+pageup", "page-default", [
		"previous editor tab / viewport scroll",
	]),
	entry("primary+,", "conditional", ["open settings / focus address bar"]),
	entry("enter", "page-default", ["native confirm / editor execute"]),
	entry("shift+enter", "page-default", [
		"native newline / editor insert line break",
	]),

	// ── Platform-Reserved & OS-Level Intercepts ──
	entry(
		"primary+alt+delete",
		"platform-reserved",
		["system security screen (Windows)"],
		{
			recommendedForUserBinding: false,
			canPreventDefaultWhenDelivered: false,
		},
	),
	entry("alt+tab", "platform-reserved", ["OS window switcher"], {
		recommendedForUserBinding: false,
		canPreventDefaultWhenDelivered: false,
	}),
	entry(
		"primary+space",
		"platform-reserved",
		["Spotlight (macOS) / IME switch"],
		{
			recommendedForUserBinding: false,
			canPreventDefaultWhenDelivered: false,
		},
	),
	entry(
		"primary+alt+escape",
		"platform-reserved",
		["Force Quit menu (macOS)"],
		{
			recommendedForUserBinding: false,
			canPreventDefaultWhenDelivered: false,
		},
	),
	entry(
		"primary+shift+escape",
		"platform-reserved",
		["OS task manager (Windows)"],
		{
			recommendedForUserBinding: false,
			canPreventDefaultWhenDelivered: false,
		},
	),
];

const POLICY_BY_CHORD = new Map<string, BrowserShortcutPolicy>(
	REGISTRY.map((policy) => [policy.chord, policy]),
);

if (POLICY_BY_CHORD.size !== REGISTRY.length)
	throw new Error("Duplicate browser shortcut policy chord");

/** Normalize a raw chord string to the platform-neutral `primary` token. */
export function normalizePrimary(chord: string): string {
	return chord
		.toLowerCase()
		.split("+")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => (part === "ctrl" || part === "meta" ? "primary" : part))
		.join("+");
}

const UNKNOWN_POLICY: BrowserShortcutPolicy = {
	chord: "unknown",
	disposition: "unknown",
	browserNotes: ["No capability data; do not silently intercept."],
	recommendedForUserBinding: false,
	canPreventDefaultWhenDelivered: false,
};

/** Classify a chord (raw or normalized) into its browser capability policy. */
export function classifyChord(chord: string): BrowserShortcutPolicy {
	const normalized = normalizePrimary(chord);
	const found = POLICY_BY_CHORD.get(normalized);
	if (found) return found;
	return { ...UNKNOWN_POLICY, chord: normalized };
}

/** Whether a chord is safe for an explicit user binding in the given context. */
export function isRecommendedUserBinding(
	chord: string,
	inOwnedEditor = false,
): boolean {
	const policy = classifyChord(chord);
	if (policy.nativeEditing && !inOwnedEditor) return false;
	return policy.recommendedForUserBinding;
}

export interface AuditKeymapPolicyResult {
	readonly unknownChords: readonly string[];
	readonly duplicatePolicyChords: readonly string[];
}

/**
 * Audit a workspace snapshot's keymap bindings against the browser shortcut
 * policy registry. Returns any chords that resolve to `unknown` disposition
 * and any policy chords that are duplicated across bindings.
 *
 * Call once at controller attach time (or when the snapshot reference changes),
 * not on every keydown.
 */
export function auditKeymapPolicy(
	snapshot:
		| {
				readonly keymap: {
					readonly bindings: readonly { readonly chords: readonly string[] }[];
				};
		  }
		| undefined,
): AuditKeymapPolicyResult {
	if (!snapshot) return { unknownChords: [], duplicatePolicyChords: [] };

	const unknownChords: string[] = [];
	const seen = new Set<string>();
	const duplicatePolicyChords: string[] = [];

	for (const binding of snapshot.keymap.bindings) {
		for (const rawChord of binding.chords) {
			const normalized = normalizePrimary(rawChord);
			if (seen.has(normalized)) {
				duplicatePolicyChords.push(normalized);
				continue;
			}
			seen.add(normalized);
			const policy = classifyChord(normalized);
			if (policy.disposition === "unknown") unknownChords.push(normalized);
		}
	}

	if (unknownChords.length > 0) {
		console.warn(
			`[browser-shortcut-policy] ${unknownChords.length} keymap binding(s) resolve to unknown browser disposition and will be blocked:`,
			unknownChords,
		);
	}
	if (duplicatePolicyChords.length > 0) {
		console.warn(
			`[browser-shortcut-policy] ${duplicatePolicyChords.length} duplicate chord(s) detected across keymap bindings:`,
			duplicatePolicyChords,
		);
	}

	return { unknownChords, duplicatePolicyChords };
}
