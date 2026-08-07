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
		subjective: createSectionState(createCell("subjective")),
		objective: createSectionState(createCell("objective")),
		assessment: createSectionState(createCell("assessment")),
		plan: createSectionState(createCell("plan")),
	};

	return {
		soap: {
			sections,
		},
	};
}

function createSectionState(cell: ScratchpadCell) {
	return {
		activeTab: "scratchpad" as const,
		activeCellId: cell.cellId,
		cells: [cell],
	};
}
