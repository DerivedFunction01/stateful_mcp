import { TuiNavigationPanel } from "../../ui/primitives/TuiNavigationPanel";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

const ITEMS = [
	{ id: "appearance", title: "Appearance", description: "Theme and terminal" },
	{ id: "formatting", title: "Formatting", description: "Dates and numbers" },
	{ id: "keymap", title: "Keymap", description: "Modal bindings" },
];

export const navigationPanelStory: TuiStory = {
	id: "navigation-panel",
	title: "Vertical Navigation Panel",
	category: "Primitives",
	states: ["navigation-focused", "content-focused", "footer-focused", "narrow"],
	render(context) {
		const theme = GlobalThemeRegistry.getActive();
		const region = context.stateId.replace("-focused", "");
		const width =
			context.stateId === "narrow"
				? 52
				: Math.min(84, context.size.columns - 2);
		return (
			<TuiNavigationPanel
				title="Surface Navigation"
				items={ITEMS}
				selectedIndex={1}
				focusedRegion={
					region === "navigation" || region === "content" || region === "footer"
						? region
						: "navigation"
				}
				width={width}
				theme={theme}
				content={
					<box flexDirection="column">
						<text fg={theme.colors.fgPrimary}>Selected content</text>
						<text fg={theme.colors.fgMuted}>
							The content slot is reusable by Settings, Scratchpad, and
							extension tabs.
						</text>
					</box>
				}
				footer={
					<text fg={theme.colors.fgMuted}>
						j/k navigate · h/l focus · Enter select
					</text>
				}
			/>
		);
	},
};
