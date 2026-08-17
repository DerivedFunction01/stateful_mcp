import type { TuiStory } from "../story-contract";
import { TuiHelpBar, type TuiShortcutHint } from "../../ui/primitives/TuiHelpBar";

const NORMAL_HINTS: readonly TuiShortcutHint[] = [
	{ key: "Tab", action: "Next Tab" },
	{ key: "i / Enter", action: "Insert" },
	{ key: "v", action: "Visual" },
	{ key: "dd", action: "Delete" },
	{ key: "Ctrl+P", action: "Command Palette" },
	{ key: "Ctrl+B", action: "Sidepanel" },
	{ key: "Alt+P", action: "Pin" },
];

export const helpBarStory: TuiStory = {
	id: "help-bar",
	title: "Contextual Help Bar",
	category: "Core",
	states: [
		"lualine-pills",
		"nano-grid",
		"opencode-compact",
		"bracket-chips",
		"subtle-text",
	],
	render(context) {
		const stateId = context.stateId;

		if (stateId === "nano-grid") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiHelpBar variant="nano-grid" hints={NORMAL_HINTS} />
				</box>
			);
		}

		if (stateId === "opencode-compact") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiHelpBar variant="opencode-compact" hints={NORMAL_HINTS} />
				</box>
			);
		}

		if (stateId === "bracket-chips") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiHelpBar variant="bracket-chips" hints={NORMAL_HINTS} />
				</box>
			);
		}

		if (stateId === "subtle-text") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiHelpBar variant="subtle-text" hints={NORMAL_HINTS} />
				</box>
			);
		}

		// Default: lualine-pills
		return (
			<box flexDirection="column" padding={1} width={context.size.columns}>
				<TuiHelpBar variant="lualine-pills" hints={NORMAL_HINTS} />
			</box>
		);
	},
};
