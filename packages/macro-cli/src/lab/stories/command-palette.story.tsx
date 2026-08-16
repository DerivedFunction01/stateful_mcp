import type { TuiStory } from "../story-contract";
import { TuiCommandPalette, type TuiPaletteCommand } from "../../ui/primitives/TuiCommandPalette";

const SAMPLE_COMMANDS: readonly TuiPaletteCommand[] = [
	{ id: "cmd.switchSession", title: "Switch session", category: "Suggested", shortcut: "ctrl+x l" },
	{ id: "cmd.switchModel", title: "Switch model", category: "Suggested", shortcut: "ctrl+x m" },
	{ id: "cmd.hideTips", title: "Hide tips", category: "System", shortcut: "ctrl+x h" },
	{ id: "cmd.plugins", title: "Plugins", category: "System" },
	{ id: "cmd.installPlugin", title: "Install plugin", category: "System" },
	{ id: "cmd.viewStatus", title: "View status", category: "System", shortcut: "ctrl+x s" },
	{ id: "cmd.viewDebug", title: "View debug info", category: "System" },
	{ id: "cmd.switchTheme", title: "Switch theme", category: "System", shortcut: "ctrl+x t" },
	{ id: "cmd.scratchpadPin", title: "Pin active macro", category: "Workspace", shortcut: "alt+p" },
	{ id: "cmd.scratchpadExec", title: "Execute valid macros", category: "Workspace", shortcut: "ctrl+enter" },
];

export const commandPaletteStory: TuiStory = {
	id: "command-palette",
	title: "Command Palette Modal",
	category: "Modals",
	states: ["suggested-commands", "active-search", "no-matches", "narrow-modal"],
	render(context) {
		const width = context.stateId === "narrow-modal" ? 44 : Math.min(68, context.size.columns - 4);

		switch (context.stateId) {
			case "active-search":
				return (
					<TuiCommandPalette
						query="switch"
						items={SAMPLE_COMMANDS.filter((c) => c.title.toLowerCase().includes("switch"))}
						selectedIndex={0}
						width={width}
						i18n={context.workspace.i18n}
					/>
				);
			case "no-matches":
				return (
					<TuiCommandPalette
						query="xyznotfound"
						items={[]}
						selectedIndex={0}
						width={width}
						i18n={context.workspace.i18n}
					/>
				);
			case "narrow-modal":
				return (
					<TuiCommandPalette
						query=""
						items={SAMPLE_COMMANDS.slice(0, 4)}
						selectedIndex={1}
						width={width}
						i18n={context.workspace.i18n}
					/>
				);
			case "suggested-commands":
			default:
				return (
					<TuiCommandPalette
						query=""
						items={SAMPLE_COMMANDS}
						selectedIndex={0}
						width={width}
						i18n={context.workspace.i18n}
					/>
				);
		}
	},
};
