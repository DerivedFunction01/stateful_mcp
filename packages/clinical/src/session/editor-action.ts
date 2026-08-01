/**
 * Editor action IDs — platform-independent labels for UI actions.
 * Each UI (Ink, web) maps platform key events to these action IDs.
 * This type is not a registry; it defines the canonical action space.
 */
export enum EditorAction {
	MoveUp = "move_up",
	MoveDown = "move_down",
	MoveTop = "move_top",
	MoveBottom = "move_bottom",
	MoveToCell = "move_to_cell",
	EditCell = "edit_cell",
	InsertBelow = "insert_below",
	InsertAbove = "insert_above",
	DeleteCell = "delete_cell",
	YankCell = "yank_cell",
	PasteCell = "paste_cell",
	PreviewCell = "preview_cell",
	RunCell = "run_cell",
	Undo = "undo",
	Redo = "redo",
	NextError = "next_error",
	PrevError = "prev_error",
	Search = "search",
	ClearSearch = "clear_search",
	OpenCommandLine = "open_command_line",
	OpenWorkspace = "open_workspace",
	Quit = "quit",
	AcceptSuggestion = "accept_suggestion",
	NextSuggestion = "next_suggestion",
	PrevSuggestion = "prev_suggestion",
}