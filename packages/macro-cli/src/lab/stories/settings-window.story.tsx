import { TuiDropdown } from "../../ui/primitives/TuiDropdown";
import { TuiInput } from "../../ui/primitives/TuiInput";
import { TuiNavigationPanel } from "../../ui/primitives/TuiNavigationPanel";
import { TuiSlider } from "../../ui/primitives/TuiSlider";
import { TuiToggle } from "../../ui/primitives/TuiToggle";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

const ITEMS = [
	{ id: "appearance", title: "Appearance", description: "Theme and terminal" },
	{ id: "formatting", title: "Formatting", description: "Dates and numbers" },
	{ id: "keymap", title: "Keymap", description: "Normal / Insert / Visual" },
	{
		id: "sample.runtime",
		title: "Sample Runtime",
		description: "Extension settings",
	},
];

export const settingsWindowStory: TuiStory = {
	id: "settings-window",
	title: "Settings Window",
	category: "Views",
	states: [
		"normal-navigation",
		"content-focused",
		"insert-editing",
		"diagnostics",
		"narrow",
	],
	render(context) {
		const theme = GlobalThemeRegistry.getActive();
		const isNarrow = context.stateId === "narrow";
		const focusedRegion =
			context.stateId === "normal-navigation" ? "navigation" : "content";
		return (
			<TuiNavigationPanel
				title="Settings"
				items={ITEMS}
				selectedIndex={1}
				focusedRegion={focusedRegion}
				width={isNarrow ? 54 : Math.min(96, context.size.columns - 2)}
				theme={theme}
				content={
					<box flexDirection="column">
						<text fg={theme.colors.fgPrimary}>Formatting</text>
						<text fg={theme.colors.fgMuted}>
							Schema-driven controls use shared primitives.
						</text>
						<TuiToggle
							label="Use localized dates"
							checked={true}
							isFocused={context.stateId === "content-focused"}
							theme={theme}
						/>
						<TuiDropdown
							label="Date style"
							selectedId="long"
							options={[
								{ id: "short", label: "Short" },
								{ id: "long", label: "Long" },
							]}
							isFocused={context.stateId === "content-focused"}
							theme={theme}
						/>
						<TuiSlider
							label="Display precision"
							value={2}
							min={0}
							max={4}
							unit=""
							isFocused={context.stateId === "content-focused"}
							theme={theme}
						/>
						<TuiInput
							label="Raw format"
							value={
								context.stateId === "insert-editing"
									? "YYYY-MM-DD|"
									: "YYYY-MM-DD"
							}
							isFocused={context.stateId === "insert-editing"}
							hint={
								context.stateId === "diagnostics"
									? "Invalid token"
									: "Enter to commit · Esc to cancel"
							}
							intent={context.stateId === "diagnostics" ? "error" : "default"}
							theme={theme}
							width={32}
						/>
					</box>
				}
				footer={
					<box flexDirection="column">
						<text
							fg={
								context.stateId === "diagnostics"
									? theme.colors.statusError
									: theme.colors.fgMuted
							}
						>
							{context.stateId === "diagnostics"
								? "1 validation issue"
								: "Saved"}
						</text>
						<text fg={theme.colors.fgDim}>
							NORMAL · j/k move · h/l focus · Ctrl+S save
						</text>
					</box>
				}
			/>
		);
	},
};
