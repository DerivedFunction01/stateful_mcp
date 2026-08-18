import {
	SettingsUiModel,
	WorkspaceSettingsService,
} from "@stateful-mcp/macro";
import { SettingsWindowView } from "../../components/SettingsWindow";
import {
	DEFAULT_WORKSPACE_SETTINGS_VALUES,
	getDefaultSettingsSchema,
} from "../../config/default-settings";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

export const settingsWindowStory: TuiStory = {
	id: "settings-window",
	title: "Settings Window (VS Code Style)",
	category: "Views",
	states: [
		"base-overview",
		"derived-spanish",
		"search-active",
		"narrow",
	],
	render(context) {
		const theme = GlobalThemeRegistry.getActive();
		const state = context.stateId;
		const isNarrow = state === "narrow";
		const isSpanish = state === "derived-spanish";
		const isSearch = state === "search-active";

		const width = isNarrow ? 64 : Math.min(108, context.size.columns - 4);

		const service = new WorkspaceSettingsService({
			defaults: DEFAULT_WORKSPACE_SETTINGS_VALUES,
			schema: getDefaultSettingsSchema(),
			storage: {
				read: () => null,
				write: () => {},
				reset: () => {},
			},
		});

		const uiModel = new SettingsUiModel(service);

		if (isSpanish) {
			uiModel.setActiveProfileId("spanish");
			uiModel.setValue(["values", "decimalSeparator"], ",");
		}

		if (isSearch) {
			uiModel.setSearchQuery("decimal");
		}

		return (
			<SettingsWindowView
				model={uiModel}
				width={width}
				theme={theme}
				focusedRegion={isSearch ? "search" : "content"}
				selectedCategoryId={isSpanish || isSearch ? "values" : "syntax"}
			/>
		);
	},
};
