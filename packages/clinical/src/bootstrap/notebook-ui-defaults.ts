import type {
	NotebookUiState,
	ScratchpadCell,
} from "../notebook/notebook-session-store";

export function createDefaultNotebookUiState(
	sessionId: string,
): NotebookUiState {
	const createCell = (section: string): ScratchpadCell => ({
		cellId: `${sessionId}:${section}:1`,
		text: "",
		pinnedMacroIds: [],
		explicitPins: false,
	});
	const sections = {
		subjective: createSectionState(createCell("subjective"), "scratchpad"),
		objective: createSectionState(createCell("objective"), "scratchpad"),
		assessment: createSectionState(createCell("assessment"), "default"),
		plan: createSectionState(createCell("plan"), "scratchpad"),
	};

	return {
		workspace: { activeTab: "notebook" },
		console: { focused: false },
		soap: {
			sections,
		},
	};
}

function createSectionState(
	cell: ScratchpadCell,
	activeTab: "default" | "scratchpad" | "editor",
) {
	return {
		activeTab,
		activeCellId: cell.cellId,
		cells: [cell],
	};
}
