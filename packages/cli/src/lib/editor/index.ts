export type { AutocompleteSuggestion } from "./autocomplete";
export {
	dedupeCanonicalSuggestions,
	knownVerbs,
	MAX_SUGGESTIONS,
} from "./command-autocomplete";
export type { CommandDescriptor } from "./command-descriptor";
export { buildCommandDescriptors } from "./command-descriptors";
export type {
	CellSubmissionPlan,
	CellSubmissionSegment,
	CommandCatalog,
	EditorContext,
	SubmissionPort,
} from "./contracts";
export type {
	DocumentAction,
	DocumentPort,
	DocumentView,
} from "./document";
export type {
	CommandResult,
	DomainAction,
	DomainPort,
} from "./domain";
export type {
	EditorKeymapNormalBindings,
	EditorKeymapProfile,
	EditorKeymapSequenceBindings,
	EditorKeymapVisualBindings,
} from "./editor-keymap-profile";
export {
	chordMatches,
	isSpecialChord,
	SpecialKeys,
} from "./editor-keymap-profile";
export type { CellEditorMode, EditorAction, EditorKernelState } from "./kernel";
export {
	createEditorKernelState,
	currentCommandLine,
	reduceEditorKernel,
	replaceCurrentLine,
} from "./kernel";
export type { MacroLockState, MacroSlotProjection } from "./macro-slots";
export {
	activeMacroSlot,
	applyMacroLocks,
	lockMacroSlot,
	nextMacroSlot,
	projectMacroSlots,
} from "./macro-slots";
export type { InspectorAction, KeymapPolicy, KeyResolution } from "./keymap";
export { resolveInspectorKey, resolveKey } from "./keymap";

export type {
	WindowOverlay,
	WindowOverlayAction,
	WindowOverlayRoute,
} from "./overlay";
export type {
	WindowDefinition,
	WindowRegion,
	WindowSlot,
} from "./window";
