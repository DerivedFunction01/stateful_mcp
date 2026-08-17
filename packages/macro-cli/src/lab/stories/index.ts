import { globalStoryRegistry, TuiStoryRegistry } from "../story-registry";
import { activityRailStory } from "./activity-rail.story";
import { commandPaletteStory } from "./command-palette.story";
import { completionPopupStory } from "./completion-popup.story";
import { emptyStateStory } from "./empty-state.story";
import { formInputsStory } from "./form-inputs.story";
import { helpBarStory } from "./help-bar.story";
import { inspectorRegionStory } from "./inspector-region.story";
import { journalStory } from "./journal.story";
import { modalStory } from "./modal.story";
import { primitivesStory } from "./primitives.story";
import { scratchpadStory } from "./scratchpad.story";
import { statusBarStory } from "./status-bar.story";
import { tabsStory } from "./tabs.story";
import { themesStory } from "./themes.story";

export function registerCoreStories(registry: TuiStoryRegistry = globalStoryRegistry): void {
	registry.register(commandPaletteStory);
	registry.register(scratchpadStory);
	registry.register(statusBarStory);
	registry.register(helpBarStory);
	registry.register(tabsStory);
	registry.register(themesStory);
	registry.register(activityRailStory);
	registry.register(inspectorRegionStory);
	registry.register(journalStory);
	registry.register(modalStory);
	registry.register(completionPopupStory);
	registry.register(primitivesStory);
	registry.register(formInputsStory);
	registry.register(emptyStateStory);
}

// Auto-register core stories into the global singleton
registerCoreStories(globalStoryRegistry);

export {
	activityRailStory,
	commandPaletteStory,
	completionPopupStory,
	emptyStateStory,
	formInputsStory,
	helpBarStory,
	inspectorRegionStory,
	journalStory,
	modalStory,
	primitivesStory,
	scratchpadStory,
	statusBarStory,
	tabsStory,
	themesStory,
};
