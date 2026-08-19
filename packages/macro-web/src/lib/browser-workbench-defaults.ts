/**
 * Browser workbench default keybindings.
 *
 * This is a renderer *policy* layer below explicit Macro profile / user
 * bindings. It maps VS Code-style chords only to canonical Macro command IDs.
 * It is NOT persisted as a Macro
 * profile and NEVER rewrites the canonical terminal/Vim default profile. The
 * host `DEFAULT_EDITOR_KEYMAP_PROFILE` (including its `ctrl+p` command-palette
 * binding) is untouched.
 *
 * Chords use the platform-neutral `primary` token (Ctrl on Windows/Linux,
 * Command on macOS).
 */
import {
	type BrowserShortcutPolicy,
	classifyChord,
} from "./browser-shortcut-policy";

export interface BrowserBaselineBinding {
	readonly command: string;
	readonly chord: string;
	readonly context: string;
	readonly titleI18nKey?: string;
}

export const BROWSER_WORKBENCH_BASELINE: readonly BrowserBaselineBinding[] = [
	{
		command: "workspace.saveActive",
		chord: "primary+s",
		context: "global",
		titleI18nKey: "workspace.saveActive",
	},
	{
		command: "workspace.toggleSidepanel",
		chord: "primary+b",
		context: "global",
		titleI18nKey: "workspace.toggleSidepanel",
	},
];

/** Capability metadata for a baseline chord, used in diagnostics. */
export function baselineCapability(chord: string): BrowserShortcutPolicy {
	return classifyChord(chord);
}
