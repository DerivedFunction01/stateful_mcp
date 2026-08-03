import { describe, expect, test } from "bun:test";
import {
	INITIAL_NOTEBOOK_STATE,
	notebookReducer,
} from "@stateful-mcp/clinical/notebook/notebook-state";

describe("command history regression", () => {
	test("submitting a command adds it to history and resets history index", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		expect(state.commandHistory).toEqual([]);
		expect(state.commandHistoryIndex).toBe(-1);

		state = notebookReducer(state, {
			type: "COMMAND_SUBMIT",
			line: ":help",
		});
		expect(state.commandHistory).toEqual([":help"]);
		expect(state.commandHistoryIndex).toBe(-1);

		state = notebookReducer(state, {
			type: "COMMAND_SUBMIT",
			line: ":workspace",
		});
		expect(state.commandHistory).toEqual([":workspace", ":help"]);
	});

	test("cycling history via PREV and NEXT actions", () => {
		let state = INITIAL_NOTEBOOK_STATE;
		state = notebookReducer(state, {
			type: "COMMAND_SUBMIT",
			line: ":cmd1",
		});
		state = notebookReducer(state, {
			type: "COMMAND_SUBMIT",
			line: ":cmd2",
		});

		// Start command mode
		state = notebookReducer(state, { type: "ENTER_COMMAND_MODE" });
		expect(state.commandLine).toBe(":");

		// Prev goes to cmd2 (most recent)
		state = notebookReducer(state, { type: "COMMAND_HISTORY_PREV" });
		expect(state.commandLine).toBe(":cmd2");
		expect(state.commandHistoryIndex).toBe(0);

		// Prev again goes to cmd1
		state = notebookReducer(state, { type: "COMMAND_HISTORY_PREV" });
		expect(state.commandLine).toBe(":cmd1");
		expect(state.commandHistoryIndex).toBe(1);

		// Next goes back to cmd2
		state = notebookReducer(state, { type: "COMMAND_HISTORY_NEXT" });
		expect(state.commandLine).toBe(":cmd2");
		expect(state.commandHistoryIndex).toBe(0);

		// Next again resets to empty command prompt ":"
		state = notebookReducer(state, { type: "COMMAND_HISTORY_NEXT" });
		expect(state.commandLine).toBe(":");
		expect(state.commandHistoryIndex).toBe(-1);
	});
});
