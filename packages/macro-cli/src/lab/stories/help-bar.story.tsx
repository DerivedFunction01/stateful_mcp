import type { TuiStory } from "../story-contract";
import { TuiHelpBar, type TuiShortcutHint } from "../../ui/primitives/TuiHelpBar";
import { GlobalThemeRegistry } from "../../ui/theme";

const NORMAL_HINTS: readonly TuiShortcutHint[] = [
	{ key: "Tab", action: "Next Tab" },
	{ key: "i / Enter", action: "Insert" },
	{ key: "v", action: "Visual" },
	{ key: "dd", action: "Delete" },
	{ key: "Ctrl+P", action: "Command Palette" },
	{ key: "Alt+1", action: "Activity" },
	{ key: "Ctrl+B", action: "Inspector" },
	{ key: "Ctrl+W", action: "Focus Pane" },
	{ key: "Alt+P", action: "Pin" },
];

const ACTIVITY_PANEL_HINTS: readonly TuiShortcutHint[] = [
	{ key: "↑/↓", action: "Navigate" },
	{ key: "Enter", action: "Open" },
	{ key: "Ctrl+W", action: "Focus Pane" },
	{ key: "Esc", action: "Editor" },
];

const INSPECTOR_PANEL_HINTS: readonly TuiShortcutHint[] = [
	{ key: "↑/↓", action: "Navigate" },
	{ key: "Enter", action: "Execute" },
	{ key: "Ctrl+B", action: "Close" },
	{ key: "Ctrl+W", action: "Focus Pane" },
	{ key: "Esc", action: "Editor" },
];

const PALETTE_HINTS: readonly TuiShortcutHint[] = [
	{ key: "↑/↓", action: "Navigate" },
	{ key: "Enter", action: "Execute" },
	{ key: "Esc", action: "Close" },
];

export const helpBarStory: TuiStory = {
	id: "help-bar",
	title: "Contextual Help Bar",
	category: "Core",
	states: [
		"nano-grid",
		"activity-focused",
		"inspector-focused",
		"palette-focused",
		"lualine-pills",
		"opencode-compact",
		"bracket-chips",
		"subtle-text",
	],
	render(context) {
		const stateId = context.stateId;
		const theme = GlobalThemeRegistry.getActive();

		let hints = NORMAL_HINTS;
		let variant: any = "nano-grid";

		if (stateId === "activity-focused") {
			hints = ACTIVITY_PANEL_HINTS;
		} else if (stateId === "inspector-focused") {
			hints = INSPECTOR_PANEL_HINTS;
		} else if (stateId === "palette-focused") {
			hints = PALETTE_HINTS;
		} else if (stateId === "lualine-pills" || stateId === "opencode-compact" || stateId === "bracket-chips" || stateId === "subtle-text") {
			variant = stateId;
		}

		return (
			<box flexDirection="column" padding={1} width={context.size.columns} backgroundColor={theme.colors.bgCanvas}>
				<TuiHelpBar variant={variant} hints={hints} theme={theme} />
			</box>
		);
	},
};
