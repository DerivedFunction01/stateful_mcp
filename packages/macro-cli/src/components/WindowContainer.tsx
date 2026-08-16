import { Box, Text, useStdout } from "ink";
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

export function WindowContainer({ workspace }: { workspace: MacroWorkspace }) {
	const { stdout } = useStdout();
	const snapshot = workspace.layout.getSnapshot();
	const columns = stdout.columns ?? 100;
	const sidepanelWidth = Math.max(24, Math.floor(columns * snapshot.sidepanelWidthRatio));
	const paletteWidth = Math.max(30, Math.floor(columns * 0.6));
	const paletteMargin = Math.max(0, Math.floor(columns * 0.2));
	const activeContainer = workspace.views.getContainer(snapshot.activeContainerId);
	return (
		<Box flexDirection="column" width="100%" height="100%">
			<WorkspaceTabs workspace={workspace} />
			<Box flexGrow={1} flexDirection="row">
				<ActivityBar workspace={workspace} />
				<Box flexGrow={1} flexDirection="column">
					{snapshot.activeTabId === "scratchpad" ? (
						<ScratchpadView workspace={workspace} />
					) : (
						<TabHost workspace={workspace} width={columns} height={stdout.rows ?? 24} />
					)}
				</Box>
				{snapshot.sidepanelOpen && (
					<Box width={sidepanelWidth} borderStyle="single" borderColor="gray">
						<SidepanelHost workspace={workspace} width={sidepanelWidth} height={stdout.rows ?? 24} />
					</Box>
				)}
			</Box>
			<StatusBar workspace={workspace} />
			<HelpBar />
			{workspace.palette.getIsOpen() && (
					<Box position="absolute" width={paletteWidth} marginLeft={paletteMargin} marginTop={2}>
					<CommandPaletteModal workspace={workspace} />
				</Box>
			)}
		</Box>
	);
}
