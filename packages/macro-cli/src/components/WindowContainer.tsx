import type { CliRenderer } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { HelpBar } from "./HelpBar";
import { ScratchpadView } from "./ScratchpadView";
import { SidepanelHost } from "./SidepanelHost";
import { StatusBar } from "./StatusBar";
import { TabHost } from "./TabHost";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { TuiPanelRegion } from "../ui/primitives/TuiPanelRegion";
import type { TuiActivityItem } from "../ui/primitives/TuiActivityRail";
import type { TuiSidepanelCard } from "../ui/primitives/TuiSidepanel";
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

	const workspaceCards: readonly TuiSidepanelCard[] = workspace.tabs.getTabs().map((tab) => ({
		id: tab.id,
		title: tab.label,
		isActive: tab.id === snapshot.activeTabId,
	}));

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
			{/* Top Workspace Tab Strip */}
			<WorkspaceTabs workspace={workspace} theme={theme} />

			{/* Main Triple-Region Row: [ Primary Activity ] | [ Central Stage ] | [ Secondary Inspector ] */}
			<box flexGrow={1} flexDirection="row">
				{/* 1. Left Primary Activity Region */}
				<TuiPanelRegion
					dock={snapshot.regions.activity.dock === "end" ? "end" : "start"}
					railItems={primaryRailItems}
					activeRailId={snapshot.activeActivityContainerId}
					onSelectRail={(id) => workspace.layout.setActiveActivityContainer(id)}
					title={activeActivityContainer?.title ?? "Workspace"}
					closeHint="Alt+1"
					panelWidth={activityWidth}
					cards={workspaceCards}
					description="Scratchpads, notebooks, and open application tabs live here."
					isOpen={snapshot.regions.activity.open}
					theme={theme}
				/>

				{/* 2. Central Editor Stage (Scratchpad / Active Tab) */}
				<box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
					{snapshot.activeTabId === "scratchpad" ? (
						<ScratchpadView workspace={workspace} keymap={keymap} theme={theme} />
					) : (
						<TabHost workspace={workspace} width={columns} height={rows} />
					)}
				</box>

				{/* 3. Right Secondary Inspector Region */}
				<TuiPanelRegion
					dock={snapshot.regions.inspector.dock === "start" ? "start" : "end"}
					railItems={secondaryRailItems}
					activeRailId={snapshot.activeInspectorContainerId}
					onSelectRail={(id) => workspace.layout.setActiveInspectorContainer(id)}
					title={activeInspectorContainer?.title ?? "Inspector"}
					closeHint="Ctrl+B"
					panelWidth={inspectorWidth}
					isOpen={snapshot.regions.inspector.open}
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
