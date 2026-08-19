import {
	chordMatches,
	type EditorKeymapProfile,
	type MacroWorkspace,
	matchKeymapCommand,
} from "@stateful-mcp/macro";
import type { NormalizedMouseEvent } from "./input/mouse";
import {
	SettingsModalController,
	type SettingsModalController as SettingsModalControllerType,
} from "./components/settings-modal-controller";

export interface TerminalKeyEvent {
	readonly input?: string;
	readonly char?: string;
	readonly name?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	readonly shift?: boolean;
}

export type TerminalMouseEvent = NormalizedMouseEvent;

const settingsControllers = new WeakMap<MacroWorkspace, SettingsModalControllerType>();

export function getSettingsModalController(
	workspace: MacroWorkspace,
	provided?: SettingsModalControllerType,
): SettingsModalControllerType {
	if (provided) {
		settingsControllers.set(workspace, provided);
		return provided;
	}
	const existing = settingsControllers.get(workspace);
	if (existing) return existing;
	const controller = new SettingsModalController(
		workspace.settingsUiModel,
		workspace.layout,
		workspace.settingsNavigation,
	);
	workspace.settingsNavigation.subscribe(() => {
		if (!controller.getSnapshot().open) {
			controller.open(workspace.settingsNavigation.getSnapshot(), false);
		}
	});
	settingsControllers.set(workspace, controller);
	return controller;
}

export async function dispatchTerminalMouseInput(
	workspace: MacroWorkspace,
	event: TerminalMouseEvent,
	settingsModal?: SettingsModalControllerType,
): Promise<"handled" | "ignored"> {
	const controller = getSettingsModalController(workspace, settingsModal);
	const layout = workspace.layout.getSnapshot();
	if (layout.activeModal?.id === "settings") {
		return controller.handleInput(event);
	}
	if (workspace.palette.getIsOpen()) {
		if (event.type === "wheel") {
			workspace.palette.moveSelection(event.delta && event.delta > 0 ? 1 : -1);
			return "handled";
		}
		return "ignored";
	}

	const contribution =
		layout.focusedPane === "sidepanel"
			? workspace.views
					.getViewsForContainer(layout.activeContainerId)
					.find((view) => view.provider)?.provider
			: layout.focusedPane === "main" && layout.activeTabId !== "scratchpad"
				? workspace.tabs.getTab(layout.activeTabId)?.provider
				: undefined;
	if (contribution?.handleInput) {
		const result = await contribution.handleInput(event, {
			scopeId:
				layout.focusedPane === "sidepanel"
					? layout.activeContainerId
					: layout.activeTabId,
			mode: workspace.editor.getMode(),
			emitAction: (actionId, payload) =>
				void workspace.commands.executeCommand(actionId, payload),
		});
		if (result === "handled") return "handled";
	}
	return "ignored";
}

export async function dispatchTerminalInput(
	workspace: MacroWorkspace,
	keymap: EditorKeymapProfile,
	event: TerminalKeyEvent,
	settingsModal?: SettingsModalControllerType,
): Promise<"handled" | "ignored" | "quit"> {
	const controller = getSettingsModalController(workspace, settingsModal);
	const input = event.input ?? event.char ?? "";
	const name = event.name;
	const chordEvent = { ...event, char: input };
	const isEnter =
		name === "return" || name === "enter" || input === "\r" || input === "\n";
	const layout = workspace.layout.getSnapshot();

	if (layout.activeModal?.id === "settings") {
		if (name === "escape") {
			controller.requestClose();
			return "handled";
		}
		const modalCommand = matchKeymapCommand(keymap, chordEvent, {
			activeTabId: layout.activeTabId,
			focusedPane: "modal",
			editorMode: workspace.editor.getMode(),
		});
		if (modalCommand === "settings.save") {
			await controller.save();
			return "handled";
		}
		if (modalCommand?.startsWith("settings."))
			return controller.handleCommand(modalCommand);
		if (
			controller.getSnapshot().dialog ||
			!["search", "json"].includes(controller.getSnapshot().focus) &&
			!['tab', 'pageup', 'pagedown', 'enter', 'return'].includes(name ?? input.toLowerCase())
		)
			return "ignored";
		return controller.handleInput({
			type: "key",
			key: name,
			input,
			ctrl: event.ctrl,
			meta: event.meta,
			shift: event.shift,
		});
	}

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

	// Command-line input is a distinct modal surface and owns every key while open.
	if (workspace.editor.getMode() === "COMMAND") {
		if (name === "escape") {
			workspace.editor.setMode("NORMAL");
			workspace.layout.setFocusedPane("main");
			return "handled";
		}
		const handled = workspace.editor.handleKey({
			char: input,
			name,
			ctrl: event.ctrl,
			meta: event.meta,
			shift: event.shift,
		});
		const submitted = workspace.editor.consumeSubmittedCommand();
		if (submitted !== null) {
			const [verb, ...args] = submitted.split(/\s+/u).filter(Boolean);
			const command = verb ? workspace.commands.resolveVerb(verb) : undefined;
			if (!command) return "handled";
			try {
				const result = await workspace.commands.executeCommand(
					command.command,
					...args,
				);
				workspace.layout.setFocusedPane("main");
				if (
					verb &&
					["q", "quit", "qa", "quitall", "wq", "wqa"].includes(
						verb.toLowerCase(),
					) &&
					!(result as { blocked?: boolean } | undefined)?.blocked
				)
					return "quit";
			} catch {
				return "handled";
			}
		}
		return handled ? "handled" : "ignored";
	}

	// 2. Global Hotkeys
	if (chordMatches(keymap.window.openCommandPalette, chordEvent)) {
		workspace.palette.open();
		return "handled";
	}
	if (
		keymap.window.toggleActivityPanel &&
		chordMatches(keymap.window.toggleActivityPanel, chordEvent)
	) {
		workspace.layout.toggleRegion("activity");
		return "handled";
	}
	if (
		keymap.window.toggleSidepanel &&
		chordMatches(keymap.window.toggleSidepanel, chordEvent)
	) {
		workspace.layout.toggleSidepanel();
		return "handled";
	}
	if (chordMatches(keymap.window.switchSplitFocus, chordEvent)) {
		workspace.layout.switchSplitFocus();
		return "handled";
	}
	if (
		matchKeymapCommand(keymap, chordEvent, {
			activeTabId: layout.activeTabId,
			focusedPane: layout.focusedPane,
			editorMode: workspace.editor.getMode(),
		}) === "workspace.quit"
	) {
		return "quit";
	}

	// 3. Pinned Macro Toggle
	const pinChord = keymap.window.pinMacro;
	if (pinChord && chordMatches(pinChord, chordEvent)) {
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

	// 4. Alt+Number JetBrains-style Focus & Navigation State Machine
	const cleanDigit = (input.replace(/^\x1b/u, "") || name || "").trim();
	const isAltChord = Boolean(event.meta || input.startsWith("\x1b"));
	if (isAltChord && /^[1-9]$/u.test(cleanDigit)) {
		const container = workspace.views.getContainerForAltKey(cleanDigit);
		if (container) {
			const targetRegion =
				(container.region ?? "activity") === "activity"
					? "activity"
					: "inspector";
			const targetPane = targetRegion === "activity" ? "activity" : "sidepanel";
			const activeId =
				targetRegion === "activity"
					? layout.activeActivityContainerId
					: layout.activeInspectorContainerId;
			const isRegionOpen = layout.regions[targetRegion].open;
			const isSameContainer = activeId === container.id;
			const isAlreadyFocused = layout.focusedPane === targetPane;

			if (isRegionOpen && isSameContainer && isAlreadyFocused) {
				// Scenario D: already focused on this container -> toggle/collapse panel and return focus to main
				workspace.layout.setRegionOpen(targetRegion, false);
				workspace.layout.setFocusedPane("main");
			} else {
				// Scenarios A, B, C: open if closed, select container, and grant focus
				if (!isRegionOpen) {
					workspace.layout.setRegionOpen(targetRegion, true);
				}
				if (targetRegion === "activity") {
					workspace.layout.setActiveActivityContainer(container.id);
				} else {
					workspace.layout.setActiveInspectorContainer(container.id);
				}
				workspace.layout.setFocusedPane(targetPane);
			}
			return "handled";
		}
	}

	// 5. Alt+] / Alt+[ (or Alt+PgDn/PgUp) to cycle through all containers in current region
	const isAltNext = isAltChord && (cleanDigit === "]" || name === "pagedown");
	const isAltPrev = isAltChord && (cleanDigit === "[" || name === "pageup");
	if (isAltNext || isAltPrev) {
		const region =
			layout.focusedPane === "sidepanel" ? "inspector" : "activity";
		const containers = workspace.views.getContainersForRegion(region);
		if (containers.length > 0) {
			const activeId =
				region === "activity"
					? layout.activeActivityContainerId
					: layout.activeInspectorContainerId;
			const currentIndex = Math.max(
				0,
				containers.findIndex((c) => c.id === activeId),
			);
			const delta = isAltNext ? 1 : -1;
			const nextIndex =
				(currentIndex + delta + containers.length) % containers.length;
			const target = containers[nextIndex];
			if (target) {
				if (region === "activity") {
					workspace.layout.setActiveActivityContainer(target.id);
					if (!layout.regions.activity.open)
						workspace.layout.setRegionOpen("activity", true);
					workspace.layout.setFocusedPane("activity");
				} else {
					workspace.layout.setActiveInspectorContainer(target.id);
					if (!layout.regions.inspector.open)
						workspace.layout.setRegionOpen("inspector", true);
					workspace.layout.setFocusedPane("sidepanel");
				}
			}
			return "handled";
		}
	}

	// 6. Global Escape: return focus to main editor, or return to NORMAL mode if already in main
	if (
		name === "escape" &&
		(layout.focusedPane !== "main" || layout.activeTabId === "scratchpad")
	) {
		if (layout.focusedPane !== "main") {
			workspace.layout.setFocusedPane("main");
			return "handled";
		}
		workspace.editor.setMode("NORMAL");
		return "handled";
	}

	const currentMode = workspace.editor.getMode();
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
			if (
				isEnter ||
				(keymap.normal.runCell &&
					chordMatches(keymap.normal.runCell, chordEvent))
			) {
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
		// - ':' enters the command bar
		// - Enter: enters INSERT mode on current line
		// - 'r': executes current/all valid macrolines
		// - Tab / Shift+Tab: cycles top-level workspace tabs
		if (currentMode === "NORMAL") {
			if (
				keymap.normal.command &&
				chordMatches(keymap.normal.command, chordEvent)
			) {
				const handled = workspace.editor.handleKey({
					char: input,
					name,
					ctrl: event.ctrl,
					meta: event.meta,
					shift: event.shift,
				});
				workspace.layout.setFocusedPane("command");
				return handled ? "handled" : "ignored";
			}
			if (isEnter && !event.ctrl && !event.meta) {
				workspace.editor.setMode("INSERT");
				return "handled";
			}
			if (
				keymap.normal.runCell &&
				chordMatches(keymap.normal.runCell, chordEvent)
			) {
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
	const profileCommand = matchKeymapCommand(keymap, chordEvent, {
		activeTabId: layout.activeTabId,
		focusedPane: layout.focusedPane,
		editorMode: currentMode,
	});
	if (
		profileCommand === "workspace.openSettings" ||
		profileCommand === "workspace.toggleSettings"
	) {
		await workspace.commands.executeCommand(profileCommand);
		return "handled";
	}
	if (profileCommand && contribution?.handleAction) {
		const result = await contribution.handleAction(profileCommand, undefined, {
			scopeId:
				layout.focusedPane === "sidepanel"
					? layout.activeContainerId
					: layout.activeTabId,
			mode: currentMode,
			emitAction: (actionId, payload) =>
				void workspace.commands.executeCommand(actionId, payload),
		});
		if (result === "handled") return "handled";
	}
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
				mode: currentMode,
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
	if (isScratchpadActive && layout.focusedPane === "main") {
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

	return "ignored";
}
