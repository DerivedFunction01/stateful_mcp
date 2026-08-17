import {
	TuiHelpBar,
	type TuiShortcutHint,
} from "../../ui/primitives/TuiHelpBar";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

const NORMAL_HINTS: readonly TuiShortcutHint[] = [
	{ key: "Tab", action: "Next Tab" },
	{ key: "i", action: "Insert" },
	{ key: "v", action: "Visual" },
	{ key: "dd", action: "Delete" },
	{ key: "Ctrl+P", action: "Command Palette" },
	{ key: "Ctrl+E", action: "Activity" },
	{ key: "Ctrl+B", action: "Inspector" },
	{ key: "Ctrl+W", action: "Focus Pane" },
	{ key: "Alt+P", action: "Pin" },
];

export const helpBarStory: TuiStory = {
	id: "help-bar",
	title: "Contextual Help Bar",
	category: "Core",
	states: ["default"],
	render(context) {
		const theme = GlobalThemeRegistry.getActive();

		return (
			<box
				flexDirection="column"
				padding={1}
				width={context.size.columns}
				backgroundColor={theme.colors.bgCanvas}
			>
				<TuiHelpBar variant="nano-grid" hints={NORMAL_HINTS} theme={theme} />
			</box>
		);
	},
};
