import { TextAttributes } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";
import type { MacroCliViewProvider } from "../renderer";
import { JournalView } from "./JournalView";
import type { TuiThemeDefinition } from "../ui/theme";
import { GlobalThemeRegistry } from "../ui/theme";

export function SidepanelHost({
	workspace,
	width,
	height,
	theme,
}: {
	workspace: MacroWorkspace;
	width: number;
	height: number;
	theme?: TuiThemeDefinition;
}) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const snapshot = workspace.layout.getSnapshot();
	const container = workspace.views.getContainer(
		snapshot.activeInspectorContainerId,
	);

	if (container?.id === "journal") {
		return <JournalView workspace={workspace} />;
	}

	const view = workspace.views
		.getViewsForContainer(container?.id ?? "")
		.find((candidate) => candidate.provider);

	if (view?.provider) {
		const provider = view.provider as unknown as MacroCliViewProvider;
		const emitAction = (actionId: string, payload?: unknown) => {
			void workspace.commands.executeCommand(actionId, payload);
		};
		return provider.render({
			viewId: view.id,
			workspace,
			width,
			height,
			isFocused: snapshot.focusedPane === "sidepanel",
			emitAction,
			onEmitAction: emitAction,
		});
	}

	// Default Node / Slot Inspector details
	const projected = workspace.scratchpad.getProjectedLines();
	const activeLineIndex = workspace.editor.buffer.getCursor().line;
	const activeProjection = projected[activeLineIndex];

	return (
		<box flexDirection="column">
			{activeProjection ? (
				<box flexDirection="column">
					<box height={1} marginBottom={1}>
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							Node: {activeProjection.macroName}
						</text>
					</box>
					<text fg={activeProjection.isValid ? c.statusSuccess : c.statusWarning} attributes={TextAttributes.BOLD}>
						{activeProjection.isValid ? "✓ All slots satisfied" : "! Missing or invalid parameters"}
					</text>
					{activeProjection.preview && (
						<box marginTop={1}>
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								↳ {activeProjection.preview.text}
							</text>
						</box>
					)}
				</box>
			) : (
				<box flexDirection="column">
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						No active macro selected in buffer.
					</text>
				</box>
			)}
		</box>
	);
}
