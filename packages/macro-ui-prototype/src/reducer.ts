import { createFixture } from "./fixtures";
import type { PrototypeAction, PrototypeWorkspaceState } from "./model";

export function reducePrototypeState(state: PrototypeWorkspaceState, action: PrototypeAction): PrototypeWorkspaceState {
	switch (action.type) {
		case "fixture": return createFixture(action.fixture);
		case "tab": return { ...state, activeTabId: action.id };
		case "view": return { ...state, activeViewId: action.id, sidepanelOpen: true };
		case "toggle-panel": return { ...state, sidepanelOpen: !state.sidepanelOpen };
		case "palette-open": return { ...state, paletteOpen: true, paletteQuery: "", paletteSelection: 0 };
		case "palette-close": return { ...state, paletteOpen: false, paletteQuery: "", paletteSelection: 0 };
		case "palette-query": return { ...state, paletteQuery: action.query, paletteSelection: 0 };
		case "palette-move": {
			const count = filteredCommands(state).length;
			if (!count) return state;
			return { ...state, paletteSelection: (state.paletteSelection + action.delta + count) % count };
		}
		case "dropdown-toggle": return { ...state, dropdownOpen: !state.dropdownOpen };
		case "dropdown-select": return { ...state, dropdownOpen: false, selectedDropdownValue: action.value, focusedInteractionId: "retail.category" };
		case "focus": return { ...state, focusedInteractionId: action.id };
		case "diagram-node": return { ...state, diagramNode: action.node, focusedInteractionId: `diagram.${action.node}` };
	}
}

export function filteredCommands(state: PrototypeWorkspaceState) {
	const query = state.paletteQuery.trim().toLowerCase();
	if (!query) return state.commands;
	return state.commands.filter((command) => `${command.category} ${command.title}`.toLowerCase().includes(query));
}
