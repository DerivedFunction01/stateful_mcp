import { useApp, useInput } from "ink";
import { useEffect, useSyncExternalStore } from "react";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { dispatchTerminalInput } from "./terminal-dispatcher";
import { WindowContainer } from "./components/WindowContainer";

export function MacroCliApp({
	workspace,
	keymap,
	onExit,
}: {
	workspace: MacroWorkspace;
	keymap: EditorKeymapProfile;
	onExit?: () => void;
}) {
	const { exit } = useApp();
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
	useInput((input, key) => {
		void dispatchTerminalInput(workspace, keymap, {
			input,
			name: key.return
				? "return"
				: key.escape
					? "escape"
					: key.upArrow
						? "up"
						: key.downArrow
							? "down"
							: key.leftArrow
								? "left"
								: key.rightArrow
									? "right"
									: key.backspace
										? "backspace"
										: key.delete
											? "delete"
												: key.tab
													? "tab"
														: undefined,
			ctrl: key.ctrl,
			meta: key.meta,
			shift: key.shift,
		}).then((result) => {
			if (result === "quit") {
				onExit?.();
				exit();
			}
		});
	});
	return <WindowContainer workspace={workspace} />;
}
