import type { CliRenderer } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { ActivityBar } from "./ActivityBar";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { HelpBar } from "./HelpBar";
import { ScratchpadView } from "./ScratchpadView";
import { SidepanelHost } from "./SidepanelHost";
import { StatusBar } from "./StatusBar";
import { TabHost } from "./TabHost";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { TuiNamedColors } from "../ui/tokens";

export function WindowContainer({
	workspace,
	keymap,
	renderer,
}: {
	workspace: MacroWorkspace;
	keymap?: EditorKeymapProfile;
	renderer: CliRenderer;
}) {
	const snapshot = workspace.layout.getSnapshot();
	const columns = renderer.width;
	const rows = renderer.height;

	const sidepanelWidth = Math.max(26, Math.floor(columns * snapshot.regions.inspector.widthRatio));
	const paletteWidth = Math.min(76, Math.max(48, Math.floor(columns * 0.65)));
	const paletteMargin = Math.max(0, Math.floor((columns - paletteWidth) / 2));

	return (
		<box flexDirection="column" width="100%" height="100%">
			{/* Top Workspace Tab Strip */}
			<WorkspaceTabs workspace={workspace} />

			{/* Main Workspace Row: Activity Rail | Editor/Tab Host | Sidepanel */}
			<box flexGrow={1} flexDirection="row">
				<ActivityBar workspace={workspace} />
				<box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
					{snapshot.activeTabId === "scratchpad" ? (
						<ScratchpadView workspace={workspace} keymap={keymap} />
					) : (
						<TabHost workspace={workspace} width={columns} height={rows} />
					)}
				</box>
				{snapshot.regions.inspector.open && (
					<box width={sidepanelWidth} borderStyle="single" borderColor={TuiNamedColors.border}>
						<SidepanelHost workspace={workspace} width={sidepanelWidth} height={rows} />
					</box>
				)}
			</box>

			{/* Dynamic Keymap Help Bar (Contextual Action Hints) */}
			<HelpBar keymap={keymap} workspace={workspace} />

			{/* Solid Segmented Lualine Status Bar (Bottom Window Anchor) */}
			<StatusBar workspace={workspace} />

			{/* Floating Centered Command Palette */}
			{workspace.palette.getIsOpen() && (
				<box position="absolute" width={paletteWidth} marginLeft={paletteMargin} marginTop={2}>
					<CommandPaletteModal workspace={workspace} width={paletteWidth} />
				</box>
			)}
		</box>
	);
}
