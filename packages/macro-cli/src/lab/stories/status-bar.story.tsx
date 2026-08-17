import type { TuiStory } from "../story-contract";
import { TuiStatusBar } from "../../ui/primitives/TuiStatusBar";

export const statusBarStory: TuiStory = {
	id: "status-bar",
	title: "Status Bar",
	category: "Core",
	states: [
		"lualine-powerline",
		"vscode-ribbon",
		"opencode-minimal",
		"segmented-cards",
		"visual-selection-mode",
		"insert-typing-mode",
	],
	render(context) {
		const stateId = context.stateId;

		// 1. Neovim Lualine / Powerline Style
		if (stateId === "lualine-powerline") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiStatusBar
						variant="lualine"
						mode="NORMAL"
						sessionTitle="session-1"
						validCount={3}
						totalCount={3}
						cursorLine={1}
						cursorCol={1}
						locale="en"
					/>
				</box>
			);
		}

		// 2. VS Code Status Ribbon Style
		if (stateId === "vscode-ribbon") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiStatusBar
						variant="vscode"
						mode="NORMAL"
						validCount={3}
						totalCount={3}
						cursorLine={12}
						cursorCol={4}
						locale="en"
					/>
				</box>
			);
		}

		// 3. OpenCode Minimalist Style
		if (stateId === "opencode-minimal") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiStatusBar
						variant="opencode"
						mode="NORMAL"
						validCount={3}
						totalCount={3}
						cursorLine={1}
						cursorCol={1}
						pinnedMacro="@medication"
						locale="en"
					/>
				</box>
			);
		}

		// 4. Segmented Cards Style
		if (stateId === "segmented-cards") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiStatusBar
						variant="segmented"
						mode="NORMAL"
						validCount={2}
						totalCount={3}
						cursorLine={2}
						cursorCol={8}
						pinnedMacro="@vitals"
						locale="en"
					/>
				</box>
			);
		}

		// 5. Visual Selection Mode
		if (stateId === "visual-selection-mode") {
			return (
				<box flexDirection="column" padding={1} width={context.size.columns}>
					<TuiStatusBar
						variant="lualine"
						mode="VISUAL"
						validCount={2}
						totalCount={3}
						cursorLine={3}
						cursorCol={14}
						locale="en"
					/>
				</box>
			);
		}

		// 6. Insert Mode
		return (
			<box flexDirection="column" padding={1} width={context.size.columns}>
				<TuiStatusBar
					variant="lualine"
					mode="INSERT"
					validCount={3}
					totalCount={4}
					cursorLine={4}
					cursorCol={22}
					pinnedMacro="^deploy"
					locale="es"
				/>
			</box>
		);
	},
};
