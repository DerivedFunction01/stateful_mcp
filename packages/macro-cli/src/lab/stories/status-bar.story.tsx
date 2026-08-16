import type { TuiStory } from "../story-contract";
import { TuiStatusBar } from "../../ui/primitives/TuiStatusBar";

export const statusBarStory: TuiStory = {
	id: "status-bar",
	title: "Status Bar Component",
	category: "Core",
	states: ["normal-mode", "insert-mode", "validation-errors", "pinned-macro", "spanish-locale"],
	render(context) {
		switch (context.stateId) {
			case "insert-mode":
				return (
					<TuiStatusBar
						mode="INSERT"
						cursorLine={3}
						cursorCol={12}
						validCount={2}
						totalCount={3}
						locale="en"
					/>
				);
			case "validation-errors":
				return (
					<TuiStatusBar
						mode="NORMAL"
						cursorLine={5}
						cursorCol={1}
						validCount={1}
						totalCount={4}
						diagnosticErrorCount={2}
						diagnosticWarningCount={1}
						locale="en"
					/>
				);
			case "pinned-macro":
				return (
					<TuiStatusBar
						mode="NORMAL"
						cursorLine={1}
						cursorCol={24}
						validCount={3}
						totalCount={3}
						pinnedMacro="^deploy"
						locale="en"
					/>
				);
			case "spanish-locale":
				return (
					<TuiStatusBar
						mode="NORMAL"
						cursorLine={1}
						cursorCol={1}
						validCount={2}
						totalCount={2}
						locale="es"
					/>
				);
			case "normal-mode":
			default:
				return (
					<TuiStatusBar
						mode="NORMAL"
						cursorLine={1}
						cursorCol={1}
						validCount={3}
						totalCount={3}
						locale="en"
					/>
				);
		}
	},
};
