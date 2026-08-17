import type { CliRenderer, MouseEvent } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import type { MacroCliViewProvider } from "../renderer";
import {
	resolveTuiWorkspaceLayout,
	TuiWorkspaceSurface,
} from "../ui/compositions";
import type { TuiActivityItem } from "../ui/primitives/TuiActivityRail";
import { TuiMenuBar, type TuiMenuGroup } from "../ui/primitives/TuiMenuBar";
import { TuiPanelRegion } from "../ui/primitives/TuiPanelRegion";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { HelpBar } from "./HelpBar";
import { ScratchpadView } from "./ScratchpadView";
import { SidepanelHost } from "./SidepanelHost";
import { StatusBar } from "./StatusBar";
import { TabHost } from "./TabHost";
import { WorkspaceTabs } from "./WorkspaceTabs";

export function WindowContainer({
	workspace,
	keymap,
	renderer,
	theme,
	onMouse,
}: {
	workspace: MacroWorkspace;
	keymap?: EditorKeymapProfile;
	renderer: CliRenderer;
	theme?: TuiThemeDefinition;
	onMouse?: (event: MouseEvent) => void;
}) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const snapshot = workspace.layout.getSnapshot();
	const columns = renderer.width;
	const rows = renderer.height;

	const mainFocused = snapshot.focusedPane === "main";
	const activityFocused = snapshot.focusedPane === "activity";
	const inspectorFocused = snapshot.focusedPane === "sidepanel";

	const activityWidth = Math.max(
		26,
		Math.floor(columns * snapshot.regions.activity.widthRatio),
	);
	const inspectorWidth = Math.max(
		28,
		Math.floor(columns * snapshot.regions.inspector.widthRatio),
	);
	const paletteWidth = Math.min(76, Math.max(48, Math.floor(columns * 0.65)));
	const paletteMargin = Math.max(0, Math.floor((columns - paletteWidth) / 2));

	// Primary Activity Region Data
	const activityContainers = workspace.views.getContainersForRegion("activity");
	const activeActivityContainer = workspace.views.getContainer(
		snapshot.activeActivityContainerId,
	);
	const primaryRailItems: readonly TuiActivityItem[] = activityContainers.map(
		(container) => ({
			id: container.id,
			label: container.title,
			icon: container.icon ?? "⌂",
			altKey: container.altKey,
			isActive: container.id === snapshot.activeActivityContainerId,
		}),
	);

	const activeActivityView = workspace.views
		.getViewsForContainer(activeActivityContainer?.id ?? "")
		.find((v) => v.provider);

	// Secondary Inspector Region Data
	const inspectorContainers =
		workspace.views.getContainersForRegion("inspector");
	const activeInspectorContainer = workspace.views.getContainer(
		snapshot.activeInspectorContainerId,
	);
	const secondaryRailItems: readonly TuiActivityItem[] =
		inspectorContainers.map((container) => ({
			id: container.id,
			label: container.title,
			icon: container.icon ?? "🔍",
			altKey: container.altKey,
			isActive: container.id === snapshot.activeInspectorContainerId,
		}));
	const execute = (command: string) => {
		void workspace.commands.executeCommand(command);
	};
	const menuGroups: readonly TuiMenuGroup[] = [
		{
			id: "file",
			label: "File",
			items: [
				{
					id: "save",
					label: "Save",
					shortcut: ":w",
					onSelect: () => execute("workspace.saveActive"),
				},
				{
					id: "settings",
					label: "Settings",
					onSelect: () => execute("workspace.openSettings"),
				},
				{
					id: "extensions",
					label: "Extensions",
					onSelect: () => execute("workspace.openExtensions"),
				},
				{
					id: "quit",
					label: "Quit",
					shortcut: ":q",
					onSelect: () => execute("workspace.quit"),
				},
			],
		},
		{
			id: "edit",
			label: "Edit",
			items: [
				{
					id: "palette",
					label: "Command Palette",
					shortcut: "Ctrl+P",
					onSelect: () => workspace.palette.open(),
				},
			],
		},
		{
			id: "view",
			label: "View",
			items: [
				{
					id: "sidepanel",
					label: "Toggle Sidepanel",
					shortcut: keymap?.window.toggleSidepanel,
					onSelect: () => execute("workspace.toggleSidepanel"),
				},
			],
		},
		{
			id: "help",
			label: "Help",
			items: [{ id: "help", label: "Keyboard Help" }],
		},
	];

	const layoutResult = resolveTuiWorkspaceLayout({
		width: columns,
		activityWidth,
		inspectorWidth,
		activityOpen: snapshot.regions.activity.open,
		inspectorOpen: snapshot.regions.inspector.open,
		outerPadding: 0,
	});
	const contentWidth = Math.max(20, layoutResult.bodyWidth - 4);
	const contentHeight = Math.max(1, rows - 6);

	return (
		<box width="100%" height="100%" onMouse={onMouse}>
			<TuiWorkspaceSurface
				menuBar={
					<TuiMenuBar
						groups={menuGroups}
						width={columns}
						theme={theme}
						compact={columns < 80}
					/>
				}
				tabBar={<WorkspaceTabs workspace={workspace} theme={theme} />}
				startRegion={
					<TuiPanelRegion
						dock={snapshot.regions.activity.dock === "end" ? "end" : "start"}
						railItems={primaryRailItems}
						activeRailId={snapshot.activeActivityContainerId}
						onSelectRail={(id) =>
							workspace.layout.setActiveActivityContainer(id)
						}
						onMouseDownRail={() => workspace.layout.setFocusedPane("activity")}
						title={activeActivityContainer?.title ?? "Activity"}
						closeHint={
							activeActivityContainer?.altKey
								? `Alt+${activeActivityContainer.altKey}`
								: "×"
						}
						panelWidth={activityWidth}
						height={rows}
						isOpen={snapshot.regions.activity.open}
						isFocused={activityFocused}
						theme={theme}
					>
						{activeActivityView?.provider ? (
							(
								activeActivityView.provider as unknown as MacroCliViewProvider
							).render({
								viewId: activeActivityView.id,
								workspace,
								width: activityWidth,
								height: rows,
								isFocused: activityFocused,
								emitAction: (actionId: string, payload?: unknown) =>
									void workspace.commands.executeCommand(actionId, payload),
								onEmitAction: (actionId: string, payload?: unknown) =>
									void workspace.commands.executeCommand(actionId, payload),
							})
						) : (
							<box flexDirection="column">
								<text fg={c.fgMuted} attributes={0}>
									{activeActivityContainer?.title ?? "Activity panel"} view.
								</text>
							</box>
						)}
					</TuiPanelRegion>
				}
				body={
					<box flexGrow={1} flexDirection="column">
						{snapshot.activeTabId === "scratchpad" ? (
							<ScratchpadView
								workspace={workspace}
								keymap={keymap}
								height={contentHeight}
								theme={theme}
							/>
						) : (
							<TabHost
								workspace={workspace}
								width={contentWidth}
								height={contentHeight}
							/>
						)}
					</box>
				}
				endRegion={
					<TuiPanelRegion
						dock={snapshot.regions.inspector.dock === "start" ? "start" : "end"}
						railItems={secondaryRailItems}
						activeRailId={snapshot.activeInspectorContainerId}
						onSelectRail={(id) =>
							workspace.layout.setActiveInspectorContainer(id)
						}
						onMouseDownRail={() => workspace.layout.setFocusedPane("sidepanel")}
						title={activeInspectorContainer?.title ?? "Inspector"}
						closeHint={
							activeInspectorContainer?.altKey
								? `Alt+${activeInspectorContainer.altKey}`
								: keymap?.window.toggleSidepanel || "Ctrl+B"
						}
						panelWidth={inspectorWidth}
						height={rows}
						isOpen={snapshot.regions.inspector.open}
						isFocused={inspectorFocused}
						theme={theme}
					>
						<SidepanelHost
							workspace={workspace}
							width={inspectorWidth}
							height={rows}
							theme={theme}
						/>
					</TuiPanelRegion>
				}
				footer={
					<>
						<HelpBar
							keymap={keymap}
							workspace={workspace}
							variant="nano-grid"
							theme={theme}
						/>
						<StatusBar workspace={workspace} theme={theme} />
					</>
				}
				width={columns}
				height={rows}
				layout={{
					activityWidth,
					inspectorWidth,
					activityOpen: snapshot.regions.activity.open,
					inspectorOpen: snapshot.regions.inspector.open,
					bodyFrame: mainFocused ? "focused" : "subtle",
					showHeaderDivider: false,
				}}
				theme={theme}
			/>

			{/* Floating Centered Command Palette */}
			{workspace.palette.getIsOpen() && (
				<box
					position="absolute"
					width={paletteWidth}
					marginLeft={paletteMargin}
					marginTop={2}
				>
					<CommandPaletteModal
						workspace={workspace}
						width={paletteWidth}
						theme={theme}
					/>
				</box>
			)}
		</box>
	);
}
