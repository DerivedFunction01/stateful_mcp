export type { ShortcutPlatform } from "./chords";

export { normalizeChordFromEvent } from "./chords";
export {
	createBrowserVimController,
	createGenericVimController,
} from "./controller";
export { createBrowserVimGroupManager } from "./group-manager";
export type {
	BrowserEditorSurfaceAdapter,
	BrowserVimController,
	BrowserVimControllerOptions,
	BrowserVimGroupController,
	BrowserVimGroupManager,
	BrowserVimGroupManagerOptions,
	BrowserVimKeyboardEvent,
	BrowserVimState,
	CellRange,
	EditorKeymapProfileShape,
	EditorSearchMatch,
	EditorSearchResult,
	KeyChordValueShape,
	KeymapSource,
	VimVariant,
} from "./types";
