import {
	chordMatches,
	type EditorKeymapProfile,
	type MacroWorkspace,
} from "@stateful-mcp/macro";

export interface TerminalKeyEvent {
	readonly input?: string;
	readonly char?: string;
	readonly name?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	readonly shift?: boolean;
}

export async function dispatchTerminalInput(
	workspace: MacroWorkspace,
	keymap: EditorKeymapProfile,
	event: TerminalKeyEvent,
): Promise<"handled" | "ignored" | "quit"> {
	const input = event.input ?? event.char ?? "";
	const name = event.name;
	const chordEvent = { ...event, char: input };

	if (workspace.palette.getIsOpen()) {
		if (name === "escape") {
			workspace.palette.close();
			return "handled";
		}
		if (name === "up") {
			workspace.palette.moveSelection(-1);
			return "handled";
		}
		if (name === "down") {
			workspace.palette.moveSelection(1);
			return "handled";
		}
		if (name === "return" || name === "enter") {
			await workspace.palette.executeSelected();
			return "handled";
		}
		if (name === "backspace") {
			workspace.palette.setQuery(workspace.palette.getQuery().slice(0, -1));
			return "handled";
		}
		if (input && !event.ctrl && !event.meta) {
			workspace.palette.setQuery(workspace.palette.getQuery() + input);
			return "handled";
		}
		return "ignored";
	}

	if (chordMatches(keymap.window.openCommandPalette, chordEvent)) {
		workspace.palette.open();
		return "handled";
	}
	if (chordMatches(keymap.window.toggleSidepanel, chordEvent)) {
		workspace.layout.toggleSidepanel();
		return "handled";
	}
	if (event.ctrl && (name === "c" || input.toLowerCase() === "c")) {
		return "quit";
	}
	if (event.ctrl && (name === "return" || name === "enter")) {
		await workspace.scratchpad.executeAllValidLines();
		return "handled";
	}
	if (event.meta && /^[1-9]$/u.test(input)) {
		const container = workspace.views.getContainerForAltKey(input);
		if (container) workspace.layout.setActiveContainer(container.id);
		return container ? "handled" : "ignored";
	}
	if (event.meta && input.toLowerCase() === "p") {
		const line = workspace.scratchpad.getProjectedLine(
			workspace.editor.buffer.getCursor().line,
		);
		workspace.scratchpad.setPinnedMacro(
			workspace.scratchpad.getPinnedMacro() === line?.macroName
				? null
				: (line?.macroName ?? null),
		);
		return "handled";
	}
	if (name === "escape") {
		workspace.editor.setMode("NORMAL");
		return "handled";
	}

	return workspace.editor.handleKey({
		char: input,
		name,
		ctrl: event.ctrl,
		meta: event.meta,
		shift: event.shift,
	})
		? "handled"
		: "ignored";
}
