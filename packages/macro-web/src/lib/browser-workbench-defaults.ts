import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import {
	type BrowserShortcutPolicy,
	classifyChord,
} from "./browser-shortcut-policy";

/** Capability metadata for a chord, used in browser diagnostics. */
export function baselineCapability(chord: string): BrowserShortcutPolicy {
	return classifyChord(chord);
}

/**
 * Returns the effective shortcut string for a command ID from the host snapshot keymap
 * or command descriptors. Strictly zero frontend fallback tables.
 */
export function getEffectiveCommandShortcut(
	snapshot: WorkspaceSnapshot | undefined,
	commandId: string,
): string | undefined {
	if (!snapshot) return undefined;

	// 1. Check explicit command bindings from host snapshot keymap
	const explicit = snapshot.keymap?.bindings?.find(
		(b) => b.command === commandId,
	);
	if (explicit?.chords?.length) return explicit.chords[0];

	// 2. Check registered command descriptor keybinding
	const cmd = snapshot.commands?.find((c) => c.id === commandId);
	if (cmd?.keybinding) return cmd.keybinding;

	return undefined;
}
