import type {
	EditorMode,
	EffectiveKeymapDto,
	InsertPosition,
	KeymapBindingDto,
	SearchDirection,
} from "@stateful-mcp/macro-protocol";
import { matchEffectiveBindings } from "@stateful-mcp/macro-protocol";
import {
	getBrowserShortcutPlatform,
	normalizeBrowserChord,
	type ShortcutPlatform,
} from "./bindings";
import { createScratchpadEditorStore } from "./scratchpad-editor-state";

export interface BrowserVimKeyboardEvent {
	readonly key: string;
	readonly ctrlKey?: boolean;
	readonly metaKey?: boolean;
	readonly shiftKey?: boolean;
	readonly altKey?: boolean;
	preventDefault(): void;
	stopPropagation(): void;
}

export interface CellRange {
	readonly start: number;
	readonly end: number;
}

export interface EditorSearchMatch {
	readonly logicalLineIndex: number;
	readonly startOffset: number;
	readonly endOffset: number;
}

export interface EditorSearchResult {
	readonly documentId: string;
	readonly textRevision: number;
	readonly matches: readonly EditorSearchMatch[];
	readonly activeMatchIndex: number;
}

export interface BrowserEditorSurfaceAdapter {
	// Cell-aware operations (Scratchpad variant)
	getActiveCellIndex?(): number;
	setActiveCellIndex?(index: number): void;
	getCellCount?(): number;
	setCellCaret?(index: number, column: number): void;
	getSelectedCellRange?(): CellRange | null;
	setSelectedCellRange?(range: CellRange | null): void;
	moveCell?(delta: -1 | 1): void;
	extendCellSelection?(delta: -1 | 1): void;
	swapSelectionAnchor?(): void;
	executeCell?(index?: number): void;
	executeCellRange?(start: number, end: number): void;
	deleteCell?(index?: number): string; // returns deleted text for yank
	deleteCellRange?(start: number, end: number): string; // returns deleted text for yank
	yankCell?(index?: number): string;
	yankCellRange?(start: number, end: number): string;
	insertCell?(position: InsertPosition, text?: string): void;
	splitCellAtCaret?(): void;
	insertTextAtCaret?(text: string): void;
	findText?(
		query: string,
		direction: SearchDirection,
		navigate?: boolean,
	): boolean;
	searchText?(
		query: string,
		direction: SearchDirection,
		navigate?: boolean,
	): EditorSearchResult;
	jumpToMatch?(
		logicalLineIndex: number,
		startOffset: number,
		length?: number,
	): void;
	clearSearchHighlights?(): void;
	repeatFind?(direction: SearchDirection): boolean;
	replaceCurrentMatch?(
		query: string,
		replacement: string,
		lineIndex?: number,
		startOffset?: number,
	): boolean;
	replaceAllMatches?(query: string, replacement: string): number;
	pasteCell?(text: string, position: InsertPosition): void;
	pasteCellRangeReplace?(start: number, end: number, text: string): void;
	focusCellForEdit?(index?: number, column?: number): void;
	blurCellEdit?(): void;

	// Underlying text operations (Generic text buffer variant)
	getText(): string;
	getCellText?(index: number): string;
	getSelection(): { start: number; end: number };
	setSelection(selection: { start: number; end: number }): void;
	replaceSelection(text: string): void;
	focus(): void;
	moveLine?(delta: -1 | 1): void;
	moveToLineBoundary?(boundary: "start" | "end"): void;
	moveWord?(direction: -1 | 1): void;
	deleteCurrentLine?(): void;
	insertLine?(position: InsertPosition): void;
	deleteCharUnderCaret?(): void;
	undo?(): void;
	redo?(): void;
}

export interface BrowserVimState {
	readonly enabled: boolean;
	readonly mode: EditorMode;
	readonly activeCellIndex: number;
	readonly caretColumn: number;
	readonly visualRange: CellRange | null;
	readonly commandText: string;
}

export interface BrowserVimController {
	getState(): BrowserVimState;
	setEnabled(enabled: boolean): void;
	setActiveCell(index: number, count: number, column?: number): void;
	setPointerTarget(
		index: number,
		count: number,
		column: number,
		dragging?: boolean,
	): void;
	exitCommandMode(): void;
	handleKeyDown(event: BrowserVimKeyboardEvent): boolean;
	subscribe(listener: () => void): () => void;
}

export type KeyChordValueShape = string | readonly string[];

export interface EditorKeymapProfileShape {
	readonly vim?: {
		readonly normal?: Readonly<Record<string, KeyChordValueShape>>;
		readonly visual?: Readonly<Record<string, KeyChordValueShape>>;
		readonly sequences?: Readonly<Record<string, KeyChordValueShape>>;
	};
	readonly workbench?: Readonly<Record<string, KeyChordValueShape>>;
	readonly normal?: Readonly<Record<string, KeyChordValueShape>>;
	readonly visual?: Readonly<Record<string, KeyChordValueShape>>;
	readonly sequences?: Readonly<Record<string, KeyChordValueShape>>;
	readonly window?: Readonly<Record<string, KeyChordValueShape>>;
	readonly bindings?: readonly KeymapBindingDto[];
}

export type KeymapSource =
	| EffectiveKeymapDto
	| EditorKeymapProfileShape
	| undefined;

export function normalizeChordFromEvent(
	event: BrowserVimKeyboardEvent,
	platform: ShortcutPlatform = getBrowserShortcutPlatform(),
): string {
	return normalizeBrowserChord(
		{
			key: event.key,
			code: event.key,
			ctrlKey: Boolean(event.ctrlKey),
			metaKey: Boolean(event.metaKey),
			altKey: Boolean(event.altKey),
			shiftKey: Boolean(event.shiftKey),
		},
		platform,
	);
}

export type VimVariant = "scratchpad" | "generic";

export interface BrowserVimControllerOptions {
	readonly variant?: VimVariant;
	readonly onCommandModeUnsupported?: () => void;
	readonly onOpenCommandMode?: (
		initialQuery?: string,
		commandMode?: boolean,
		commandToken?: string,
	) => void;
	readonly onOpenSearch?: (direction: SearchDirection) => void;
	readonly getAdapter?: () => BrowserEditorSurfaceAdapter | undefined;
	readonly getKeymap?: () => KeymapSource;
	readonly onExecuteLine?: (lineNumber?: number) => void;
	readonly onExecuteRange?: (startLine: number, endLine: number) => void;
	readonly onExecuteValidLines?: () => void;
	readonly onPreviewLine?: () => void;
}

function getCellText(
	adapter: BrowserEditorSurfaceAdapter,
	index: number,
): string {
	return (
		adapter.getCellText?.(index) ?? adapter.getText().split("\n")[index] ?? ""
	);
}

export function createBrowserVimController(
	initialEnabled = false,
	options?: BrowserVimControllerOptions,
): BrowserVimController {
	let state: BrowserVimState = {
		enabled: initialEnabled,
		mode: initialEnabled ? "NORMAL" : "INSERT",
		activeCellIndex: 0,
		caretColumn: 0,
		visualRange: null,
		commandText: "",
	};
	let sequenceTimer: ReturnType<typeof setTimeout> | null = null;
	const listeners = new Set<() => void>();
	const notify = () => listeners.forEach((listener) => listener());
	const editorStore = createScratchpadEditorStore(initialEnabled);
	const editorState = () => editorStore.getState();
	const cellIndex = () => editorState().activeCellIndex;
	const cellRange = () => editorState().visualRange;
	const yankBuffer = () => editorState().yankBuffer;
	const sequenceBuffer = () => editorState().sequenceBuffer;
	editorStore.subscribe(() => {
		const next = editorState();
		state = {
			...state,
			enabled: next.enabled,
			mode: next.mode,
			activeCellIndex: next.activeCellIndex,
			caretColumn: next.caretColumn,
			visualRange: next.visualRange,
			commandText: next.commandText,
		};
		notify();
	});

	const setMode = (mode: EditorMode) => {
		if (sequenceTimer) {
			clearTimeout(sequenceTimer);
			sequenceTimer = null;
		}
		if (state.mode !== mode) {
			state = { ...state, mode };
			editorStore.dispatch({ type: "setMode", mode });
		}
	};

	const clearSequence = () => {
		editorStore.dispatch({ type: "clearSequence" });
		if (sequenceTimer) {
			clearTimeout(sequenceTimer);
			sequenceTimer = null;
		}
	};

	return {
		getState: () => state,
		setActiveCell: (index, count, column) => {
			editorStore.dispatch({ type: "setActiveCell", index, count, column });
		},
		setPointerTarget: (index, count, column, dragging = false) => {
			if (!state.enabled) return;
			if (state.mode === "VISUAL") {
				editorStore.dispatch({ type: "setVisualFocus", index, count });
			} else if (dragging && state.mode !== "INSERT") {
				editorStore.dispatch({ type: "beginVisual" });
				editorStore.dispatch({ type: "setVisualFocus", index, count });
				setMode("VISUAL");
			} else {
				editorStore.dispatch({ type: "setActiveCell", index, count, column });
			}
			if (state.mode === "VISUAL" || dragging)
				editorStore.dispatch({ type: "setActiveCell", index, count, column });
			options?.getAdapter?.()?.setCellCaret?.(index, column);
		},
		setEnabled: (enabled) => {
			if (state.enabled !== enabled) {
				state = { ...state, enabled, mode: enabled ? "NORMAL" : "INSERT" };
				editorStore.dispatch({ type: "setEnabled", enabled });
				clearSequence();
				notify();
			}
		},
		exitCommandMode: () => {
			if (state.mode === "COMMAND") {
				clearSequence();
				setMode("NORMAL");
			}
		},
		handleKeyDown: (event) => {
			const chord = normalizeChordFromEvent(event);
			const rawKey = event.key;
			const keymap = options?.getKeymap?.();
			const adapter = options?.getAdapter?.();
			const isScratchpad =
				options?.variant === "scratchpad" ||
				Boolean(adapter?.getCellCount || adapter?.setActiveCellIndex);
			const currentMode = state.enabled ? state.mode : "INSERT";

			// Mode-aware Escape handling (only active when Vim is enabled)
			if (state.enabled && (rawKey === "Escape" || chord === "escape")) {
				clearSequence();
				if (state.mode === "INSERT") {
					setMode("NORMAL");
				} else if (state.mode === "VISUAL") {
					editorStore.dispatch({ type: "clearVisual" });
					adapter?.setSelectedCellRange?.(null);
					setMode("NORMAL");
				} else if (state.mode === "COMMAND") {
					editorStore.dispatch({ type: "clearVisual" });
					setMode("NORMAL");
				}
				event.preventDefault();
				event.stopPropagation?.();
				return true;
			}

			const normalMap = keymap?.vim?.normal ?? keymap?.normal;
			const visualMap = keymap?.vim?.visual ?? keymap?.visual;
			const sequenceMap = keymap?.vim?.sequences ?? keymap?.sequences;
			const bindings = keymap?.bindings;

			// INSERT-mode structural editing is keymap-driven (shared between Standard & Vim Insert).
			if (currentMode === "INSERT") {
				const matched = bindings
					? matchEffectiveBindings(bindings, chord, "INSERT", {
							editorMode: "INSERT",
						})
					: undefined;

				if (matched?.command === "editor.executeValidLines") {
					options?.onExecuteValidLines?.();
					event.preventDefault();
					return true;
				}
				if (matched?.command === "editor.executeLine") {
					if (options?.onExecuteLine) {
						options.onExecuteLine(cellIndex() + 1);
					} else {
						adapter?.executeCell?.(cellIndex());
					}
					event.preventDefault();
					return true;
				}
				if (matched?.command === "editor.splitLine") {
					adapter?.splitCellAtCaret?.();
					event.preventDefault();
					return true;
				}
				if (matched?.command === "editor.insertLineBreak") {
					adapter?.insertTextAtCaret?.("\n");
					event.preventDefault();
					return true;
				}
				if (matched?.command === "editor.insertTab") {
					adapter?.insertTextAtCaret?.("\t");
					event.preventDefault();
					return true;
				}
				if (state.enabled && (rawKey === "Enter" || rawKey === "Tab")) {
					event.preventDefault();
					return true;
				}
				return false;
			}

			if (!state.enabled) return false;

			function matchesKeyOrChord(
				bindingValue: string | readonly string[] | undefined,
				rawKey: string,
				chord: string,
			): boolean {
				if (!bindingValue) return false;
				const candidates = Array.isArray(bindingValue)
					? bindingValue
					: [bindingValue];
				return candidates.some((candidate) => {
					if (!candidate) return false;
					if (candidate === rawKey || candidate === chord) return true;
					const norm = candidate.toLowerCase();
					return (
						norm === rawKey.toLowerCase() ||
						norm === chord.toLowerCase() ||
						(rawKey === "ArrowDown" && norm === "down") ||
						(rawKey === "ArrowUp" && norm === "up") ||
						(rawKey === "ArrowLeft" && norm === "left") ||
						(rawKey === "ArrowRight" && norm === "right")
					);
				});
			}

			// ── Sequence Buffering (e.g. "dd", "yy", "gp") ─────────────────────────
			if (state.mode === "NORMAL" && sequenceMap) {
				const currentSeq = sequenceBuffer() + rawKey;
				const allSequences: Array<{ action: string; seq: string }> = [];
				for (const [action, val] of Object.entries(sequenceMap)) {
					if (!val) continue;
					const seqs = Array.isArray(val) ? val : [val];
					for (const s of seqs) {
						if (s) allSequences.push({ action, seq: s });
					}
				}

				let hasExactMatch = false;
				let hasPartialMatch = false;
				let matchedAction: string | null = null;

				for (const { action, seq } of allSequences) {
					if (seq === currentSeq) {
						hasExactMatch = true;
						matchedAction = action;
						break;
					}
					if (seq.startsWith(currentSeq)) {
						hasPartialMatch = true;
					}
				}

				if (hasExactMatch && matchedAction) {
					clearSequence();
					if (matchedAction === "deleteCell") {
						if (isScratchpad && adapter?.deleteCell) {
							const deleted = adapter.deleteCell(cellIndex());
							if (deleted)
								editorStore.dispatch({ type: "setYank", value: deleted });
						} else {
							const deleted =
								adapter?.deleteCurrentLine?.() ?? adapter?.deleteCell?.() ?? "";
							if (deleted)
								editorStore.dispatch({ type: "setYank", value: deleted });
						}
					} else if (matchedAction === "yankCell") {
						if (isScratchpad && adapter?.yankCell) {
							const yanked = adapter.yankCell(cellIndex());
							if (yanked)
								editorStore.dispatch({ type: "setYank", value: yanked });
						} else {
							const yanked = adapter?.yankCell?.();
							if (yanked)
								editorStore.dispatch({ type: "setYank", value: yanked });
						}
					} else if (matchedAction === "pasteAbove") {
						if (yankBuffer()) {
							adapter?.pasteCell?.(yankBuffer(), "above");
						}
					}
					event.preventDefault();
					return true;
				}

				if (hasPartialMatch) {
					editorStore.dispatch({ type: "setSequence", value: currentSeq });
					if (sequenceTimer) clearTimeout(sequenceTimer);
					sequenceTimer = setTimeout(clearSequence, 1000);
					event.preventDefault();
					return true;
				}

				clearSequence();
			}

			// ── NORMAL Mode Keymap Dispatch ──────────────────────────────────────
			if (state.mode === "NORMAL") {
				const executeNormalAction = (action: string): boolean => {
					switch (action) {
						case "enterInsert":
						case "editor.enterInsert":
							setMode("INSERT");
							if (isScratchpad && adapter?.focusCellForEdit) {
								adapter.focusCellForEdit(
									cellIndex(),
									editorState().caretColumn,
								);
							} else {
								adapter?.focus?.();
							}
							return true;
						case "insertBelow":
						case "editor.insertBelow":
							if (isScratchpad && adapter?.insertCell) {
								adapter.insertCell("below");
								const count = adapter.getCellCount?.() ?? 1;
								editorStore.dispatch({
									type: "setActiveCell",
									index: cellIndex() + 1,
									count,
								});
								adapter.focusCellForEdit?.(
									cellIndex(),
									editorState().caretColumn,
								);
							} else {
								adapter?.insertLine?.("below");
							}
							setMode("INSERT");
							return true;
						case "insertAbove":
						case "editor.insertAbove":
							if (isScratchpad && adapter?.insertCell) {
								adapter.insertCell("above");
								const count = adapter.getCellCount?.() ?? 1;
								editorStore.dispatch({
									type: "setActiveCell",
									index: cellIndex(),
									count,
								});
								adapter.focusCellForEdit?.(
									cellIndex(),
									editorState().caretColumn,
								);
							} else {
								adapter?.insertLine?.("above");
							}
							setMode("INSERT");
							return true;
						case "enterVisual":
						case "editor.enterVisual":
							editorStore.dispatch({ type: "beginVisual" });
							setMode("VISUAL");
							adapter?.setSelectedCellRange?.(cellRange());
							return true;
						case "moveDown":
						case "editor.moveDown":
							if (isScratchpad && adapter) {
								const total = adapter.getCellCount?.() ?? 1;
								const nextIndex = Math.min(total - 1, cellIndex() + 1);
								const lineLength = getCellText(adapter, nextIndex).length;
								editorStore.dispatch({
									type: "moveCell",
									delta: 1,
									count: total,
									lineLength,
								});
								adapter.setCellCaret?.(
									cellIndex(),
									editorState().caretColumn,
								) ?? adapter.setActiveCellIndex?.(cellIndex());
							} else {
								adapter?.moveLine?.(1);
							}
							return true;
						case "moveUp":
						case "editor.moveUp":
							if (isScratchpad && adapter) {
								const total = adapter.getCellCount?.() ?? 1;
								const nextIndex = Math.max(0, cellIndex() - 1);
								const lineLength = getCellText(adapter, nextIndex).length;
								editorStore.dispatch({
									type: "moveCell",
									delta: -1,
									count: total,
									lineLength,
								});
								adapter.setCellCaret?.(
									cellIndex(),
									editorState().caretColumn,
								) ?? adapter.setActiveCellIndex?.(cellIndex());
							} else {
								adapter?.moveLine?.(-1);
							}
							return true;
						case "moveLeft":
						case "editor.moveLeft":
							if (adapter) {
								if (isScratchpad) {
									const line = getCellText(adapter, cellIndex());
									editorStore.dispatch({
										type: "moveCharacter",
										delta: -1,
										lineLength: line.length,
									});
									adapter.setCellCaret?.(
										cellIndex(),
										editorState().caretColumn,
									);
								} else {
									const sel = adapter.getSelection();
									const next = Math.max(0, sel.end - 1);
									adapter.setSelection({ start: next, end: next });
								}
							}
							return true;
						case "moveRight":
						case "editor.moveRight":
							if (adapter) {
								if (isScratchpad) {
									const line = getCellText(adapter, cellIndex());
									editorStore.dispatch({
										type: "moveCharacter",
										delta: 1,
										lineLength: line.length,
									});
									adapter.setCellCaret?.(
										cellIndex(),
										editorState().caretColumn,
									);
								} else {
									const sel = adapter.getSelection();
									const next = Math.min(adapter.getText().length, sel.end + 1);
									adapter.setSelection({ start: next, end: next });
								}
							}
							return true;
						case "pasteBelow":
						case "editor.pasteBelow":
							if (yankBuffer()) {
								adapter?.pasteCell?.(yankBuffer(), "below");
								if (isScratchpad) {
									const count = adapter?.getCellCount?.() ?? 1;
									editorStore.dispatch({
										type: "setActiveCell",
										index: cellIndex() + 1,
										count,
									});
								}
							}
							return true;
						case "undo":
						case "editor.undo":
							adapter?.undo?.();
							return true;
						case "redo":
						case "editor.redo":
							adapter?.redo?.();
							return true;
						case "runCell":
						case "editor.executeLine":
							if (options?.onExecuteLine) {
								options.onExecuteLine(cellIndex() + 1);
							} else {
								adapter?.executeCell?.(cellIndex());
							}
							return true;
						case "executeValidLines":
						case "editor.executeValidLines":
							options?.onExecuteValidLines?.();
							return true;
						case "previewCell":
						case "editor.previewCell":
							options?.onPreviewLine?.();
							return true;
						case "nextMatch":
							adapter?.repeatFind?.("forward");
							return true;
						case "previousMatch":
							adapter?.repeatFind?.("backward");
							return true;
						case "command": {
							const cmdText = Array.isArray(normalMap?.command)
								? (normalMap.command[0] ?? ":")
								: (normalMap?.command ?? ":");
							editorStore.dispatch({
								type: "setCommandText",
								value: cmdText,
							});
							setMode("COMMAND");
							if (options?.onOpenCommandMode) {
								options.onOpenCommandMode(cmdText, true, cmdText);
							} else {
								options?.onCommandModeUnsupported?.();
							}
							return true;
						}
						case "search":
						case "searchAlt": {
							const backward =
								action === "searchAlt" ||
								(normalMap?.searchAlt &&
									matchesKeyOrChord(normalMap.searchAlt, rawKey, chord));
							options?.onOpenSearch?.(backward ? "backward" : "forward");
							return true;
						}
						default:
							return false;
					}
				};

				if (normalMap) {
					for (const [action, binding] of Object.entries(normalMap)) {
						if (matchesKeyOrChord(binding, rawKey, chord)) {
							if (executeNormalAction(action)) {
								event.preventDefault();
								return true;
							}
						}
					}
				}

				// Check standard EffectiveKeymap bindings
				if (bindings && bindings.length > 0) {
					const matched = matchEffectiveBindings(bindings, chord, state.mode, {
						editorMode: state.mode,
					});
					if (matched && executeNormalAction(matched.command)) {
						event.preventDefault();
						return true;
					}
				}

				// Key is unmapped in NORMAL mode -> Suppress text insertion, NO FALLBACK
				event.preventDefault();
				return true;
			}

			// ── VISUAL Mode Keymap Dispatch ──────────────────────────────────────
			if (state.mode === "VISUAL") {
				const executeVisualAction = (action: string): boolean => {
					switch (action) {
						case "deleteSelection":
						case "editor.deleteSelection": {
							const range = cellRange();
							if (isScratchpad && range && adapter?.deleteCellRange) {
								const deleted = adapter.deleteCellRange(range.start, range.end);
								if (deleted)
									editorStore.dispatch({ type: "setYank", value: deleted });
								editorStore.dispatch({
									type: "setActiveCell",
									index: Math.min(range.start, range.end),
									count: adapter.getCellCount?.() ?? 1,
								});
								adapter.setCellCaret?.(
									cellIndex(),
									editorState().caretColumn,
								) ?? adapter.setActiveCellIndex?.(cellIndex());
							} else {
								adapter?.replaceSelection("");
							}
							editorStore.dispatch({ type: "clearVisual" });
							adapter?.setSelectedCellRange?.(null);
							setMode("NORMAL");
							return true;
						}
						case "yankSelection":
						case "editor.yankSelection": {
							const range = cellRange();
							if (isScratchpad && range && adapter?.yankCellRange) {
								const yanked = adapter.yankCellRange(range.start, range.end);
								if (yanked)
									editorStore.dispatch({ type: "setYank", value: yanked });
							}
							editorStore.dispatch({ type: "clearVisual" });
							adapter?.setSelectedCellRange?.(null);
							setMode("NORMAL");
							return true;
						}
						case "pasteSelection":
						case "editor.pasteSelection": {
							const range = cellRange();
							if (isScratchpad && range && yankBuffer()) {
								adapter?.pasteCellRangeReplace?.(
									range.start,
									range.end,
									yankBuffer(),
								);
							}
							editorStore.dispatch({ type: "clearVisual" });
							adapter?.setSelectedCellRange?.(null);
							setMode("NORMAL");
							return true;
						}
						case "extendDown":
						case "editor.extendDown":
							if (isScratchpad && adapter) {
								const total = adapter.getCellCount?.() ?? 1;
								editorStore.dispatch({
									type: "extendVisual",
									delta: 1,
									count: total,
								});
								adapter.setCellCaret?.(
									cellIndex(),
									editorState().caretColumn,
								) ?? adapter.setActiveCellIndex?.(cellIndex());
								adapter.setSelectedCellRange?.(cellRange());
							} else {
								adapter?.moveLine?.(1);
							}
							return true;
						case "extendUp":
						case "editor.extendUp":
							if (isScratchpad && adapter) {
								const total = adapter.getCellCount?.() ?? 1;
								editorStore.dispatch({
									type: "extendVisual",
									delta: -1,
									count: total,
								});
								adapter.setActiveCellIndex?.(cellIndex());
								adapter.setSelectedCellRange?.(cellRange());
							} else {
								adapter?.moveLine?.(-1);
							}
							return true;
						case "extendLeft":
						case "editor.extendLeft":
							if (!isScratchpad && adapter) {
								const sel = adapter.getSelection();
								adapter.setSelection({
									start: sel.start,
									end: Math.max(0, sel.end - 1),
								});
							}
							return true;
						case "extendRight":
						case "editor.extendRight":
							if (!isScratchpad && adapter) {
								const sel = adapter.getSelection();
								adapter.setSelection({
									start: sel.start,
									end: Math.min(adapter.getText().length, sel.end + 1),
								});
							}
							return true;
						case "swapAnchor":
						case "editor.swapAnchor":
							if (isScratchpad && cellRange()) {
								editorStore.dispatch({ type: "swapVisualAnchor" });
								adapter?.setCellCaret?.(
									cellIndex(),
									editorState().caretColumn,
								) ?? adapter?.setActiveCellIndex?.(cellIndex());
								adapter?.setSelectedCellRange?.(cellRange());
							} else {
								adapter?.swapSelectionAnchor?.();
							}
							return true;
						case "runCell":
						case "editor.executeLine": {
							const range = cellRange();
							if (isScratchpad && range) {
								if (options?.onExecuteRange) {
									options.onExecuteRange(range.start + 1, range.end + 1);
								} else {
									adapter?.executeCellRange?.(range.start, range.end);
								}
							}
							editorStore.dispatch({ type: "clearVisual" });
							adapter?.setSelectedCellRange?.(null);
							setMode("NORMAL");
							return true;
						}
						case "executeValidLines":
						case "editor.executeValidLines": {
							options?.onExecuteValidLines?.();
							editorStore.dispatch({ type: "clearVisual" });
							adapter?.setSelectedCellRange?.(null);
							setMode("NORMAL");
							return true;
						}
						default:
							return false;
					}
				};

				if (visualMap) {
					for (const [action, binding] of Object.entries(visualMap)) {
						if (matchesKeyOrChord(binding, rawKey, chord)) {
							if (executeVisualAction(action)) {
								event.preventDefault();
								return true;
							}
						}
					}
					if (
						normalMap?.runCell &&
						matchesKeyOrChord(normalMap.runCell, rawKey, chord)
					) {
						if (executeVisualAction("runCell")) {
							event.preventDefault();
							return true;
						}
					}
				}

				if (bindings && bindings.length > 0) {
					const matched = matchEffectiveBindings(bindings, chord, state.mode, {
						editorMode: state.mode,
					});
					if (matched && executeVisualAction(matched.command)) {
						event.preventDefault();
						return true;
					}
				}

				// Unmapped in VISUAL mode -> Suppress text insertion, NO FALLBACK
				event.preventDefault();
				return true;
			}

			return false;
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
