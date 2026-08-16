import type { TuiStory } from "../story-contract";
import { TuiHelpBar, type TuiShortcutHint } from "../../ui/primitives/TuiHelpBar";

const EDIT_HINTS: readonly TuiShortcutHint[] = [
	{ key: "Esc", action: "Normal Mode" },
	{ key: "Ctrl+P", action: "Commands" },
	{ key: "Ctrl+Space", action: "Autocomplete" },
	{ key: "Ctrl+C", action: "Quit" },
];

const MODAL_HINTS: readonly TuiShortcutHint[] = [
	{ key: "↑/↓", action: "Navigate" },
	{ key: "Enter", action: "Execute" },
	{ key: "Esc", action: "Close" },
];

export const helpBarStory: TuiStory = {
	id: "help-bar",
	title: "Contextual Help Bar",
	category: "Core",
	states: ["workspace-default", "editor-insert", "modal-navigation", "custom-tip"],
	render(context) {
		switch (context.stateId) {
			case "editor-insert":
				return <TuiHelpBar hints={EDIT_HINTS} />;
			case "modal-navigation":
				return <TuiHelpBar hints={MODAL_HINTS} />;
			case "custom-tip":
				return <TuiHelpBar customText="● Tip: Press Alt+P to pin the active macro line" />;
			case "workspace-default":
			default:
				return <TuiHelpBar />;
		}
	},
};
