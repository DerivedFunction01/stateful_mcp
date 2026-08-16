import { createFixture } from "./fixtures";
import type { PrototypeAction, PrototypeWorkspaceState } from "./model";

export function reducePrototypeState(state: PrototypeWorkspaceState, action: PrototypeAction): PrototypeWorkspaceState {
	switch (action.type) {
		case "fixture": return createFixture(action.fixture);
		case "tab": return { ...state, activeTabId: action.id, activeInspectorViewId: state.inspectorMode === "follow" ? (action.id === "pos" ? "domain" : state.activeInspectorViewId) : state.activeInspectorViewId };
		case "view": return { ...state, activeInspectorViewId: action.id, panelRegions: { ...state.panelRegions, inspector: { ...state.panelRegions.inspector, open: true } } };
		case "activity-view": return { ...state, activeActivityViewId: action.id, panelRegions: { ...state.panelRegions, activity: { ...state.panelRegions.activity, open: true } } };
		case "inspector-pin": return state.inspectorMode === "pinned" ? { ...state, inspectorMode: "follow", pinnedInspectorViewId: undefined } : { ...state, inspectorMode: "pinned", pinnedInspectorViewId: state.activeInspectorViewId };
		case "toggle-panel": return { ...state, panelRegions: { ...state.panelRegions, inspector: { ...state.panelRegions.inspector, open: !state.panelRegions.inspector.open } } };
		case "toggle-region": return { ...state, panelRegions: { ...state.panelRegions, [action.region]: { ...state.panelRegions[action.region], open: !state.panelRegions[action.region].open } } };
		case "dock-region": return { ...state, panelRegions: { ...state.panelRegions, [action.region]: { ...state.panelRegions[action.region], dock: action.dock } } };
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
