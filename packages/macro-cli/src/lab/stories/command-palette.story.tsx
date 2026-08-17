import type { TuiStory } from "../story-contract";
import {
	TuiCommandPalette,
	type TuiPaletteCommand,
} from "../../ui/primitives/TuiCommandPalette";

const PALETTE_COMMANDS: readonly TuiPaletteCommand[] = [
	{
		id: "cmd-switch-session",
		title: "Switch session",
		category: "Suggested",
		shortcut: "ctrl+x l",
	},
	{
		id: "cmd-switch-model",
		title: "Switch model",
		category: "Suggested",
		shortcut: "ctrl+x m",
	},
	{
		id: "cmd-hide-tips",
		title: "Hide tips",
		category: "System",
		shortcut: "ctrl+x h",
	},
	{
		id: "cmd-plugins",
		title: "Plugins",
		category: "System",
	},
	{
		id: "cmd-install-plugin",
		title: "Install plugin",
		category: "System",
	},
	{
		id: "cmd-view-status",
		title: "View status",
		category: "System",
		shortcut: "ctrl+x s",
	},
	{
		id: "cmd-view-debug-info",
		title: "View debug info",
		category: "System",
	},
	{
		id: "cmd-switch-theme",
		title: "Switch theme",
		category: "System",
		shortcut: "ctrl+x t",
	},
	{
		id: "cmd-switch-to-light-mode",
		title: "Switch to light mode",
		category: "System",
	},
	{
		id: "cmd-lock-theme-mode",
		title: "Lock theme mode",
		category: "System",
	},
	{
		id: "cmd-help",
		title: "Help",
		category: "System",
	},
	{
		id: "cmd-open-docs",
		title: "Open docs",
		category: "System",
	},
	{
		id: "cmd-exit-the-app",
		title: "Exit the app",
		category: "System",
		shortcut: "ctrl+c, ctrl+d, ctrl+x q",
	},
	{
		id: "cmd-toggle-debug-panel",
		title: "Toggle debug panel",
		category: "System",
	},
	{
		id: "cmd-toggle-console",
		title: "Toggle console",
		category: "System",
	},
	{
		id: "cmd-write-heap-snapshot",
		title: "Write heap snapshot",
		category: "System",
	},
];

export const commandPaletteStory: TuiStory = {
	id: "command-palette",
	title: "Command Palette Modal",
	category: "Modals",
	states: [
		"opencode-floating",
		"opencode-search-active",
		"opencode-bordered",
		"vscode-quickpick",
		"empty-results",
	],
	render(context) {
		const stateId = context.stateId;

		if (stateId === "opencode-search-active") {
			const filtered = PALETTE_COMMANDS.filter((c) =>
				c.title.toLowerCase().includes("switch"),
			);
			return (
				<box padding={2} justifyContent="center" alignItems="center">
					<TuiCommandPalette
						variant="opencode"
						query="switch"
						items={filtered}
						selectedIndex={0}
						width={68}
					/>
				</box>
			);
		}

		if (stateId === "opencode-bordered") {
			return (
				<box padding={2} justifyContent="center" alignItems="center">
					<TuiCommandPalette
						variant="opencode-bordered"
						items={PALETTE_COMMANDS}
						selectedIndex={1}
						width={68}
					/>
				</box>
			);
		}

		if (stateId === "vscode-quickpick") {
			return (
				<box padding={2} justifyContent="center" alignItems="center">
					<TuiCommandPalette
						variant="vscode-quickpick"
						items={PALETTE_COMMANDS}
						selectedIndex={0}
						width={68}
					/>
				</box>
			);
		}

		if (stateId === "empty-results") {
			return (
				<box padding={2} justifyContent="center" alignItems="center">
					<TuiCommandPalette
						variant="opencode"
						query="unknown command xyz"
						items={[]}
						width={68}
					/>
				</box>
			);
		}

		// Default: opencode-floating
		return (
			<box padding={2} justifyContent="center" alignItems="center">
				<TuiCommandPalette
					variant="opencode"
					items={PALETTE_COMMANDS}
					selectedIndex={0}
					width={68}
				/>
			</box>
		);
	},
};
