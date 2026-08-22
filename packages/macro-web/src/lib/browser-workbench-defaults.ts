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

	// 1. Check structured workbench section from host snapshot
	if (snapshot.keymap?.workbench) {
		if (
			commandId === "workbench.openPalette" ||
			commandId === "workbench.commandPalette" ||
			commandId === "palette.open"
		) {
			if (snapshot.keymap.workbench.openCommandPalette)
				return snapshot.keymap.workbench.openCommandPalette;
		}
		if (
			commandId === "workbench.quickOpen" ||
			commandId === "workbench.openFile"
		) {
			if (snapshot.keymap.workbench.quickOpen)
				return snapshot.keymap.workbench.quickOpen;
		}
		if (
			commandId === "workbench.openSettings" ||
			commandId === "settings.open"
		) {
			if (snapshot.keymap.workbench.openSettings)
				return snapshot.keymap.workbench.openSettings;
		}
		if (commandId === "workspace.toggleSidepanel") {
			if (snapshot.keymap.workbench.toggleSidepanel)
				return snapshot.keymap.workbench.toggleSidepanel;
		}
		if (commandId === "workspace.toggleActivity") {
			if (snapshot.keymap.workbench.toggleActivityPanel)
				return snapshot.keymap.workbench.toggleActivityPanel;
		}
		if (
			commandId === "workbench.toggleDrawer" ||
			commandId === "workbench.toggleOutput"
		) {
			if (snapshot.keymap.workbench.toggleDrawer)
				return snapshot.keymap.workbench.toggleDrawer;
		}
		if (
			commandId === "editor.splitGroup" ||
			commandId === "editor.createSplitGroup"
		) {
			if (snapshot.keymap.workbench.splitGroup)
				return snapshot.keymap.workbench.splitGroup;
		}
		if (commandId === "editor.pinMacro") {
			if (snapshot.keymap.workbench.pinMacro)
				return snapshot.keymap.workbench.pinMacro;
		}
	}

	// 2. Check explicit command bindings from host snapshot
	const explicit = snapshot.keymap?.bindings?.find(
		(b) => b.command === commandId,
	);
	if (explicit?.chords?.length) return explicit.chords[0];

	// 3. Check registered command descriptor keybinding
	const cmd = snapshot.commands?.find((c) => c.id === commandId);
	if (cmd?.keybinding) return cmd.keybinding;

	return undefined;
}
