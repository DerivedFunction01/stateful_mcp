import type { CliRenderer } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import type { MacroCliViewProvider } from "../renderer";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { HelpBar } from "./HelpBar";
import { ScratchpadView } from "./ScratchpadView";
import { SidepanelHost } from "./SidepanelHost";
import { StatusBar } from "./StatusBar";
import { TabHost } from "./TabHost";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { TuiPanelRegion } from "../ui/primitives/TuiPanelRegion";
import type { TuiActivityItem } from "../ui/primitives/TuiActivityRail";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

export function WindowContainer({
	workspace,
	keymap,
	renderer,
	theme,
}: {
	workspace: MacroWorkspace;
	keymap?: EditorKeymapProfile;
	renderer: CliRenderer;
	theme?: TuiThemeDefinition;
}) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const snapshot = workspace.layout.getSnapshot();
	const columns = renderer.width;
	const rows = renderer.height;

	const mainFocused = snapshot.focusedPane === "main";
	const activityFocused = snapshot.focusedPane === "activity";
	const inspectorFocused = snapshot.focusedPane === "sidepanel";

	const activityWidth = Math.max(26, Math.floor(columns * snapshot.regions.activity.widthRatio));
	const inspectorWidth = Math.max(28, Math.floor(columns * snapshot.regions.inspector.widthRatio));
	const paletteWidth = Math.min(76, Math.max(48, Math.floor(columns * 0.65)));
	const paletteMargin = Math.max(0, Math.floor((columns - paletteWidth) / 2));

	// Primary Activity Region Data
	const activityContainers = workspace.views.getContainersForRegion("activity");
	const activeActivityContainer = workspace.views.getContainer(snapshot.activeActivityContainerId);
	const primaryRailItems: readonly TuiActivityItem[] = activityContainers.map((container) => ({
		id: container.id,
		label: container.title,
		icon: container.icon ?? "⌂",
		altKey: container.altKey,
		isActive: container.id === snapshot.activeActivityContainerId,
	}));

	const activeActivityView = workspace.views
		.getViewsForContainer(activeActivityContainer?.id ?? "")
		.find((v) => v.provider);

	// Secondary Inspector Region Data
	const inspectorContainers = workspace.views.getContainersForRegion("inspector");
	const activeInspectorContainer = workspace.views.getContainer(snapshot.activeInspectorContainerId);
	const secondaryRailItems: readonly TuiActivityItem[] = inspectorContainers.map((container) => ({
		id: container.id,
		label: container.title,
		icon: container.icon ?? "🔍",
		altKey: container.altKey,
		isActive: container.id === snapshot.activeInspectorContainerId,
	}));

	return (
		<box flexDirection="column" width="100%" height="100%" backgroundColor={c.bgCanvas}>
			{/* Top Workspace Tab Strip (Elevated Shelf) & Connecting Baseline Divider (▔) */}
			<box backgroundColor={c.bgSurface} height={1}>
				<WorkspaceTabs workspace={workspace} theme={theme} />
			</box>
			<box height={1}>
				<text fg={c.borderSubtle}>{"▔".repeat(columns)}</text>
			</box>

			{/* Main Triple-Region Row: [ Primary Activity ] | [ Central Stage ] | [ Secondary Inspector ] */}
			<box flexGrow={1} flexDirection="row">
				{/* 1. Left Primary Activity Region (Alt+1..2 to toggle/switch) */}
				<TuiPanelRegion
					dock={snapshot.regions.activity.dock === "end" ? "end" : "start"}
					railItems={primaryRailItems}
					activeRailId={snapshot.activeActivityContainerId}
					onSelectRail={(id) => workspace.layout.setActiveActivityContainer(id)}
					title={activeActivityContainer?.title ?? "Activity"}
					closeHint={activeActivityContainer?.altKey ? `Alt+${activeActivityContainer.altKey}` : "×"}
					panelWidth={activityWidth}
					isOpen={snapshot.regions.activity.open}
					isFocused={activityFocused}
					theme={theme}
				>
					{activeActivityView?.provider ? (
						(activeActivityView.provider as unknown as MacroCliViewProvider).render({
							viewId: activeActivityView.id,
							workspace,
							width: activityWidth,
							height: rows,
							isFocused: activityFocused,
							emitAction: (actionId: string, payload?: unknown) => void workspace.commands.executeCommand(actionId, payload),
							onEmitAction: (actionId: string, payload?: unknown) => void workspace.commands.executeCommand(actionId, payload),
						})
					) : (
						<box flexDirection="column">
							<text fg={c.fgMuted} attributes={0}>
								{activeActivityContainer?.title ?? "Activity panel"} view.
							</text>
						</box>
					)}
				</TuiPanelRegion>

				{/* 2. Central Editor Stage (Scratchpad / Active Tab) with Elevated Canvas & Light Border */}
				<box
					flexGrow={1}
					flexDirection="column"
					backgroundColor={c.bgElevated}
					borderStyle="single"
					borderColor={mainFocused ? c.borderActive : c.borderSubtle}
					paddingLeft={1}
					paddingRight={1}
					paddingTop={0}
					marginLeft={1}
					marginRight={1}
				>
					{snapshot.activeTabId === "scratchpad" ? (
						<ScratchpadView workspace={workspace} keymap={keymap} theme={theme} />
					) : (
						<TabHost workspace={workspace} width={columns} height={rows} />
					)}
				</box>

				{/* 3. Right Secondary Inspector Region (Ctrl+B / Alt+3..5 to toggle/switch) */}
				<TuiPanelRegion
					dock={snapshot.regions.inspector.dock === "start" ? "start" : "end"}
					railItems={secondaryRailItems}
					activeRailId={snapshot.activeInspectorContainerId}
					onSelectRail={(id) => workspace.layout.setActiveInspectorContainer(id)}
					title={activeInspectorContainer?.title ?? "Inspector"}
					closeHint={activeInspectorContainer?.altKey ? `Alt+${activeInspectorContainer.altKey}` : (keymap?.window.toggleSidepanel || "Ctrl+B")}
					panelWidth={inspectorWidth}
					isOpen={snapshot.regions.inspector.open}
					isFocused={inspectorFocused}
					theme={theme}
				>
					<SidepanelHost workspace={workspace} width={inspectorWidth} height={rows} theme={theme} />
				</TuiPanelRegion>
			</box>

			{/* Dynamic Keymap Help Bar (Contextual Action Hints) */}
			<HelpBar keymap={keymap} workspace={workspace} variant="nano-grid" theme={theme} />

			{/* Solid Segmented Lualine Status Bar (Bottom Window Anchor) */}
			<StatusBar workspace={workspace} theme={theme} />

			{/* Floating Centered Command Palette */}
			{workspace.palette.getIsOpen() && (
				<box position="absolute" width={paletteWidth} marginLeft={paletteMargin} marginTop={2}>
					<CommandPaletteModal workspace={workspace} width={paletteWidth} theme={theme} />
				</box>
			)}
		</box>
	);
}
