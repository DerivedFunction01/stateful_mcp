import type { CliRenderer, MouseEvent } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { useEffect, useState, useSyncExternalStore } from "react";
import { SettingsModalController } from "./components/settings-modal-controller";
import { WindowContainer } from "./components/WindowContainer";
import { normalizeOpenTuiMouseEvent } from "./input/mouse";
import {
	dispatchTerminalInput,
	dispatchTerminalMouseInput,
} from "./terminal-dispatcher";

import type { TuiThemeDefinition } from "./ui/theme";

export function MacroCliApp({
	workspace,
	keymap,
	renderer,
	theme,
	onExit,
}: {
	workspace: MacroWorkspace;
	keymap: EditorKeymapProfile;
	renderer: CliRenderer;
	theme?: TuiThemeDefinition;
	onExit?: () => void;
}) {
	const [settingsModal] = useState(
		() =>
			new SettingsModalController(
				workspace.settingsUiModel,
				workspace.layout,
				workspace.settingsNavigation,
			),
	);
	const subscribe = (listener: () => void) => {
		const unsubscribers = [
			workspace.documents.subscribe(listener),
			workspace.editor.subscribe(listener),
			workspace.layout.subscribe(listener),
			workspace.palette.subscribe(listener),
			workspace.scratchpad.subscribe(listener),
			workspace.journal.subscribe(listener),
			workspace.tabs.subscribe(listener),
			workspace.views.subscribe(listener),
			workspace.settingsNavigation.subscribe(listener),
			settingsModal.subscribe(listener),
			workspace.settings?.subscribe(listener) ?? (() => undefined),
		];
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	};

	useSyncExternalStore(subscribe, () => {
		const layout = workspace.layout.getSnapshot();
		const cursor = workspace.editor.buffer.getCursor();
		return JSON.stringify({
			text: workspace.editor.buffer.getText(),
			mode: workspace.editor.getMode(),
			cursor,
			layout,
			palette: {
				open: workspace.palette.getIsOpen(),
				query: workspace.palette.getQuery(),
				selected: workspace.palette.getSelectedIndex(),
			},
			projected: workspace.scratchpad.getProjectedLines(),
			pinned: workspace.scratchpad.getPinnedMacro(),
			journal: workspace.journal.getEntries(),
			settingsNavigation: workspace.settingsNavigation.getSnapshot(),
			settings: workspace.settings
				? {
						raw: workspace.settings.getRawText(),
						diagnostics: workspace.settings.getDiagnostics(),
					}
				: undefined,
		});
	});

	useEffect(
		() => () => {
			void workspace.dispose();
		},
		[workspace],
	);

	useEffect(() => {
		const handleKeypress = (key: {
			name: string;
			sequence: string;
			ctrl: boolean;
			meta: boolean;
			shift: boolean;
		}) => {
			void dispatchTerminalInput(
				workspace,
				keymap,
				{
					input: key.sequence,
					name: key.name,
					ctrl: key.ctrl,
					meta: key.meta,
					shift: key.shift,
				},
				settingsModal,
			).then((result) => {
				if (result === "quit") {
					onExit?.();
					renderer.destroy();
				}
			});
		};
		renderer.keyInput.on("keypress", handleKeypress);
		return () => {
			renderer.keyInput.off("keypress", handleKeypress);
		};
	}, [keymap, onExit, renderer, settingsModal, workspace]);

	return (
		<WindowContainer
			workspace={workspace}
			settingsModal={settingsModal}
			keymap={keymap}
			renderer={renderer}
			onMouse={(event: MouseEvent) =>
				void dispatchTerminalMouseInput(
					workspace,
					normalizeOpenTuiMouseEvent(event),
					settingsModal,
				)
			}
			theme={theme}
		/>
	);
}
