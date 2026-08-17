import { TuiStatusBar } from "../../ui/primitives/TuiStatusBar";
import type { TuiStory } from "../story-contract";

export const statusBarStory: TuiStory = {
	id: "status-bar",
	title: "Status Bar",
	category: "Core",
	states: ["default"],
	render(context) {
		return (
			<box flexDirection="column" padding={1} width={context.size.columns}>
				<TuiStatusBar
					variant="lualine"
					mode="NORMAL"
					validCount={3}
					totalCount={3}
					cursorLine={1}
					cursorCol={1}
					locale="en"
				/>
			</box>
		);
	},
};
