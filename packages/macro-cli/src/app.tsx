import { useEffect, useSyncExternalStore } from "react";
import type { CliRenderer } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { dispatchTerminalInput } from "./terminal-dispatcher";
import { WindowContainer } from "./components/WindowContainer";

import { GlobalThemeRegistry, type TuiThemeDefinition } from "./ui/theme";

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
	const subscribe = (listener: () => void) => {
		const unsubscribers = [
			workspace.editor.subscribe(listener),
			workspace.layout.subscribe(listener),
			workspace.palette.subscribe(listener),
			workspace.scratchpad.subscribe(listener),
			workspace.journal.subscribe(listener),
			workspace.tabs.subscribe(listener),
			workspace.views.subscribe(listener),
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
		});
	});

	useEffect(
		() => () => {
			void workspace.dispose();
		},
		[workspace],
	);

	useEffect(() => {
		const handleKeypress = (key: { name: string; sequence: string; ctrl: boolean; meta: boolean; shift: boolean }) => {
			void dispatchTerminalInput(workspace, keymap, {
				input: key.sequence,
				name: key.name,
				ctrl: key.ctrl,
				meta: key.meta,
				shift: key.shift,
			}).then((result) => {
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
	}, [keymap, onExit, renderer, workspace]);

	return <WindowContainer workspace={workspace} keymap={keymap} renderer={renderer} theme={theme} />;
}
