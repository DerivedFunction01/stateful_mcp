import type { CliRenderer } from "@opentui/core";
import type { MacroWorkspace } from "@stateful-mcp/macro";
import { ActivityBar } from "./ActivityBar";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { HelpBar } from "./HelpBar";
import { JournalView } from "./JournalView";
import { ScratchpadView } from "./ScratchpadView";
import { SidepanelHost } from "./SidepanelHost";
import { StatusBar } from "./StatusBar";
import { TabHost } from "./TabHost";
import { WorkspaceTabs } from "./WorkspaceTabs";

export function WindowContainer({ workspace, renderer }: { workspace: MacroWorkspace; renderer: CliRenderer }) {
	const snapshot = workspace.layout.getSnapshot();
	const columns = renderer.width;
	const sidepanelWidth = Math.max(24, Math.floor(columns * snapshot.regions.inspector.widthRatio));
	const paletteWidth = Math.max(30, Math.floor(columns * 0.6));
	const paletteMargin = Math.max(0, Math.floor(columns * 0.2));
	const rows = renderer.height;
	return (
		<box flexDirection="column" width="100%" height="100%">
			<WorkspaceTabs workspace={workspace} />
			<box flexGrow={1} flexDirection="row">
				<ActivityBar workspace={workspace} />
				<box flexGrow={1} flexDirection="column">
					{snapshot.activeTabId === "scratchpad" ? (
						<ScratchpadView workspace={workspace} />
					) : (
						<TabHost workspace={workspace} width={columns} height={rows} />
					)}
				</box>
				{snapshot.regions.inspector.open && (
					<box width={sidepanelWidth} borderStyle="single" borderColor="gray">
						<SidepanelHost workspace={workspace} width={sidepanelWidth} height={rows} />
					</box>
				)}
			</box>
			<StatusBar workspace={workspace} />
			<HelpBar />
			{workspace.palette.getIsOpen() && (
					<box position="absolute" width={paletteWidth} marginLeft={paletteMargin} marginTop={2}>
					<CommandPaletteModal workspace={workspace} />
					</box>
			)}
		</box>
	);
}
