import { Box } from "ink";
import { CellList } from "./CellList";
import { StatusBar } from "./StatusBar";
import type { NotebookState } from "../hooks/useNotebook";

interface NotebookProps {
	state: NotebookState;
	sessionId: string;
}

export function Notebook({ state, sessionId }: NotebookProps) {
	return (
		<Box flexDirection="column" width="100%" height="100%">
			<CellList
				cells={state.cells}
				activeIndex={state.activeIndex}
				mode={state.mode}
				draftText={state.draftText}
				lastEditCellId={state.lastEditCellId}
			/>
			<StatusBar
				mode={state.mode}
				cellCount={state.cells.length}
				activeIndex={state.activeIndex}
				sessionId={sessionId}
				dirty={state.dirty}
				sessionMode={state.sessionMode}
			/>
		</Box>
	);
}