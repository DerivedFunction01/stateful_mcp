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
		if (container) {
			if ((container.region ?? "activity") === "activity") workspace.layout.setActiveActivityContainer(container.id);
			else workspace.layout.setActiveInspectorContainer(container.id);
		}
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

	const layout = workspace.layout.getSnapshot();
	const contribution =
		layout.focusedPane === "sidepanel"
			? workspace.views
					.getViewsForContainer(layout.activeContainerId)
					.find((view) => view.provider)?.provider
			: layout.activeTabId === "scratchpad"
				? undefined
				: workspace.tabs.getTab(layout.activeTabId)?.provider;
	if (contribution?.handleInput) {
		const result = await contribution.handleInput(
			{
				type: "key",
				key: name,
				input,
				ctrl: event.ctrl,
				meta: event.meta,
				shift: event.shift,
			},
			{
				scopeId:
					layout.focusedPane === "sidepanel"
						? layout.activeContainerId
						: layout.activeTabId,
				emitAction: (actionId, payload) => {
					void workspace.commands.executeCommand(actionId, payload);
				},
			},
		);
		if (result === "handled") return "handled";
	}

	if (layout.activeTabId === "scratchpad" && chordMatches(keymap.window.nextTab, chordEvent)) {
		if (workspace.scratchpad.createPinnedMacroLine()) return "handled";
		workspace.layout.nextTab(1);
		return "handled";
	}
	if (chordMatches(keymap.window.prevTab, chordEvent)) {
		workspace.layout.nextTab(-1);
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
