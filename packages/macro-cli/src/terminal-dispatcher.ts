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
	const isEnter = name === "return" || name === "enter" || input === "\r" || input === "\n";

	// 1. Command Palette Modal Focus
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
		if (isEnter) {
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

	// 2. Global Hotkeys
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

	// 3. Pinned Macro Toggle
	const pinChord = keymap.window.pinMacro;
	if ((pinChord && chordMatches(pinChord, chordEvent)) || (event.meta && input.toLowerCase() === "p")) {
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

	// 4. Alt+Number activity / inspector switching
	if (event.meta && input && /^[1-9]$/u.test(input)) {
		const container = workspace.views.getContainerForAltKey(input);
		if (container) {
			if ((container.region ?? "activity") === "activity") workspace.layout.setActiveActivityContainer(container.id);
			else workspace.layout.setActiveInspectorContainer(container.id);
		}
		return container ? "handled" : "ignored";
	}

	// 5. Global Escape returns to NORMAL mode
	if (name === "escape") {
		workspace.editor.setMode("NORMAL");
		return "handled";
	}

	const currentMode = workspace.editor.getMode();
	const layout = workspace.layout.getSnapshot();
	const isScratchpadActive = layout.activeTabId === "scratchpad";

	// 6. Mode-Aware Scratchpad Execution & Navigation (Aligned with cli/clinical)
	if (isScratchpadActive) {
		// INSERT Mode:
		// - Enter: executes all populated macrolines
		// - Tab: creates/duplicates macroline below
		// - Up/Down: moves active line without leaving insert mode
		if (currentMode === "INSERT") {
			if (isEnter && !event.ctrl && !event.meta) {
				await workspace.scratchpad.executeAllValidLines();
				return "handled";
			}
			if (name === "tab" || input === "\t") {
				if (!workspace.scratchpad.createPinnedMacroLine()) {
					const cur = workspace.editor.buffer.getCursor();
					workspace.editor.buffer.insertLine(cur.line + 1, "");
					workspace.editor.buffer.setCursor(cur.line + 1, 0);
				}
				return "handled";
			}
		}

		// VISUAL Mode:
		// - Enter or 'r': executes selected range of macrolines
		if (currentMode === "VISUAL") {
			if (isEnter || input === "r") {
				const sel = workspace.editor.buffer.getSelection();
				if (sel) {
					const startLine = Math.min(sel.start.line, sel.end.line);
					const endLine = Math.max(sel.start.line, sel.end.line);
					for (let i = startLine; i <= endLine; i++) {
						await workspace.scratchpad.executeLine(i);
					}
				} else {
					const cur = workspace.editor.buffer.getCursor();
					await workspace.scratchpad.executeLine(cur.line);
				}
				workspace.editor.setMode("NORMAL");
				return "handled";
			}
		}

		// NORMAL Mode:
		// - Enter: enters INSERT mode on current line
		// - 'r': executes current/all valid macrolines
		// - Tab / Shift+Tab: cycles top-level workspace tabs
		if (currentMode === "NORMAL") {
			if (isEnter && !event.ctrl && !event.meta) {
				workspace.editor.setMode("INSERT");
				return "handled";
			}
			if (input === "r" || (keymap.normal.runCell && chordMatches(keymap.normal.runCell, chordEvent))) {
				const cursor = workspace.editor.buffer.getCursor();
				const receipt = await workspace.scratchpad.executeLine(cursor.line);
				if (!receipt && workspace.scratchpad.getValidLineCount() > 0) {
					await workspace.scratchpad.executeAllValidLines();
				}
				return "handled";
			}
		}
	}

	// 7. View / Tab Contribution input handling
	const contribution =
		layout.focusedPane === "sidepanel"
			? workspace.views
					.getViewsForContainer(layout.activeContainerId)
					.find((view) => view.provider)?.provider
			: isScratchpadActive
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

	// 8. Top-level Tab Navigation in NORMAL mode
	if (chordMatches(keymap.window.nextTab, chordEvent)) {
		workspace.layout.nextTab(1);
		return "handled";
	}
	if (chordMatches(keymap.window.prevTab, chordEvent)) {
		workspace.layout.nextTab(-1);
		return "handled";
	}

	// 9. Editor Input Dispatch (Normal motions, Insert typing, Visual selections)
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
