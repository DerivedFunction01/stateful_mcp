import type {
	EditorMode,
	EffectiveKeymapDto,
	KeymapBindingDto,
} from "@stateful-mcp/macro-protocol";
import { matchEffectiveBindings } from "@stateful-mcp/macro-protocol";
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
	insertCell?(position: "above" | "below", text?: string): void;
	splitCellAtCaret?(): void;
	insertTextAtCaret?(text: string): void;
	pasteCell?(text: string, position: "above" | "below"): void;
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
	insertLine?(position: "above" | "below"): void;
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

export interface EditorKeymapProfileShape {
	readonly vim?: {
		readonly normal?: Readonly<Record<string, string>>;
		readonly visual?: Readonly<Record<string, string>>;
		readonly sequences?: Readonly<Record<string, string>>;
	};
	readonly workbench?: Readonly<Record<string, string>>;
	readonly normal?: Readonly<Record<string, string>>;
	readonly visual?: Readonly<Record<string, string>>;
	readonly sequences?: Readonly<Record<string, string>>;
	readonly window?: Readonly<Record<string, string>>;
	readonly bindings?: readonly KeymapBindingDto[];
}

export type KeymapSource =
	| EffectiveKeymapDto
	| EditorKeymapProfileShape
	| undefined;

export function normalizeChordFromEvent(
	event: BrowserVimKeyboardEvent,
): string {
	const parts: string[] = [];
	if (event.ctrlKey) parts.push("ctrl");
	if (event.metaKey) parts.push("meta");
	if (event.altKey) parts.push("alt");
	if (event.shiftKey && event.key.length > 1) parts.push("shift");

	const key = event.key;
	if (key === "Escape") parts.push("escape");
	else if (key === "Enter") parts.push("enter");
	else if (key === "Tab") parts.push("tab");
	else if (key === "Backspace") parts.push("backspace");
	else if (key === " ") parts.push("space");
	else if (parts.length > 0) parts.push(key.toLowerCase());
	else parts.push(key);

	return parts.join("+");
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
	readonly getAdapter?: () => BrowserEditorSurfaceAdapter | undefined;
	readonly getKeymap?: () => KeymapSource;
	readonly onExecuteLine?: (lineNumber?: number) => void;
	readonly onExecuteRange?: (startLine: number, endLine: number) => void;
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
		mode: "NORMAL",
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
			if (!state.enabled) return false;

			const chord = normalizeChordFromEvent(event);
			const rawKey = event.key;
			const keymap = options?.getKeymap?.();
			const adapter = options?.getAdapter?.();

			// Mode-aware Escape handling
			if (rawKey === "Escape" || chord === "escape") {
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
				// In NORMAL mode, Escape is a focus-preserving no-op
				event.preventDefault();
				event.stopPropagation?.();
				return true;
			}

			// Determine if active adapter is cell-oriented (Scratchpad variant)
			const isScratchpad =
				options?.variant === "scratchpad" ||
				Boolean(adapter?.getCellCount || adapter?.setActiveCellIndex);

			// Retrieve configured keymap definitions directly with ZERO runtime fallbacks
			const normalMap = keymap?.vim?.normal ?? keymap?.normal;
			const visualMap = keymap?.vim?.visual ?? keymap?.visual;
			const sequenceMap = keymap?.vim?.sequences ?? keymap?.sequences;
			const bindings = keymap?.bindings;

			// INSERT-mode structural editing is keymap-driven. Unmapped structural
			// keys are suppressed rather than falling through to browser behavior.
			if (state.mode === "INSERT") {
				const matched = bindings
					? matchEffectiveBindings(bindings, chord, state.mode, {
							editorMode: state.mode,
						})
					: undefined;
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
				if (rawKey === "Enter" || rawKey === "Tab") {
					event.preventDefault();
					return true;
				}
				return false;
			}

			// ── Sequence Buffering (e.g. "dd", "yy", "gp") ─────────────────────────
			if (state.mode === "NORMAL" && sequenceMap) {
				const currentSeq = sequenceBuffer() + rawKey;
				let hasExactMatch = false;
				let hasPartialMatch = false;
				let matchedAction: string | null = null;

				for (const [action, seq] of Object.entries(sequenceMap)) {
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
				if (normalMap) {
					if (normalMap.enterInsert && rawKey === normalMap.enterInsert) {
						setMode("INSERT");
						if (isScratchpad && adapter?.focusCellForEdit) {
							adapter.focusCellForEdit(cellIndex(), editorState().caretColumn);
						} else {
							adapter?.focus?.();
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.insertBelow && rawKey === normalMap.insertBelow) {
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
						event.preventDefault();
						return true;
					}
					if (normalMap.insertAbove && rawKey === normalMap.insertAbove) {
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
						event.preventDefault();
						return true;
					}
					if (normalMap.enterVisual && rawKey === normalMap.enterVisual) {
						editorStore.dispatch({ type: "beginVisual" });
						setMode("VISUAL");
						adapter?.setSelectedCellRange?.(cellRange());
						event.preventDefault();
						return true;
					}
					if (normalMap.moveDown && rawKey === normalMap.moveDown) {
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
							adapter.setCellCaret?.(cellIndex(), editorState().caretColumn) ??
								adapter.setActiveCellIndex?.(cellIndex());
						} else {
							adapter?.moveLine?.(1);
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.moveUp && rawKey === normalMap.moveUp) {
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
							adapter.setCellCaret?.(cellIndex(), editorState().caretColumn) ??
								adapter.setActiveCellIndex?.(cellIndex());
						} else {
							adapter?.moveLine?.(-1);
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.moveLeft && rawKey === normalMap.moveLeft) {
						if (adapter) {
							if (isScratchpad) {
								const line = getCellText(adapter, cellIndex());
								editorStore.dispatch({
									type: "moveCharacter",
									delta: -1,
									lineLength: line.length,
								});
								adapter.setCellCaret?.(cellIndex(), editorState().caretColumn);
							} else {
								const sel = adapter.getSelection();
								const next = Math.max(0, sel.end - 1);
								adapter.setSelection({ start: next, end: next });
							}
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.moveRight && rawKey === normalMap.moveRight) {
						if (adapter) {
							if (isScratchpad) {
								const line = getCellText(adapter, cellIndex());
								editorStore.dispatch({
									type: "moveCharacter",
									delta: 1,
									lineLength: line.length,
								});
								adapter.setCellCaret?.(cellIndex(), editorState().caretColumn);
							} else {
								const sel = adapter.getSelection();
								const next = Math.min(adapter.getText().length, sel.end + 1);
								adapter.setSelection({ start: next, end: next });
							}
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.pasteBelow && rawKey === normalMap.pasteBelow) {
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
						event.preventDefault();
						return true;
					}
					if (normalMap.undo && chord === normalMap.undo) {
						adapter?.undo?.();
						event.preventDefault();
						return true;
					}
					if (normalMap.redo && chord === normalMap.redo) {
						adapter?.redo?.();
						event.preventDefault();
						return true;
					}
					if (normalMap.runCell && rawKey === normalMap.runCell) {
						if (options?.onExecuteLine) {
							options.onExecuteLine(cellIndex() + 1);
						} else {
							adapter?.executeCell?.(cellIndex());
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.previewCell && rawKey === normalMap.previewCell) {
						options?.onPreviewLine?.();
						event.preventDefault();
						return true;
					}
					if (normalMap.command && rawKey === normalMap.command) {
						editorStore.dispatch({
							type: "setCommandText",
							value: normalMap.command,
						});
						setMode("COMMAND");
						if (options?.onOpenCommandMode) {
							options.onOpenCommandMode(
								normalMap.command,
								true,
								normalMap.command,
							);
						} else {
							options?.onCommandModeUnsupported?.();
						}
						event.preventDefault();
						return true;
					}
					if (
						(normalMap.search && rawKey === normalMap.search) ||
						(normalMap.searchAlt && rawKey === normalMap.searchAlt)
					) {
						options?.onOpenCommandMode?.("", false, "");
						event.preventDefault();
						return true;
					}
				}

				// Check standard EffectiveKeymap bindings
				if (bindings && bindings.length > 0) {
					const matched = matchEffectiveBindings(bindings, chord, state.mode, {
						editorMode: state.mode,
					});
					if (matched) {
						if (matched.command === "editor.enterInsert") {
							setMode("INSERT");
							adapter?.focusCellForEdit?.(
								cellIndex(),
								editorState().caretColumn,
							) ?? adapter?.focus?.();
						} else if (matched.command === "editor.moveDown") {
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
						} else if (matched.command === "editor.moveUp") {
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
						} else if (matched.command === "editor.executeLine") {
							options?.onExecuteLine?.(cellIndex() + 1);
						}
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
				if (visualMap) {
					if (
						visualMap.deleteSelection &&
						rawKey === visualMap.deleteSelection
					) {
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
							adapter.setCellCaret?.(cellIndex(), editorState().caretColumn) ??
								adapter.setActiveCellIndex?.(cellIndex());
						} else {
							adapter?.replaceSelection("");
						}
						editorStore.dispatch({ type: "clearVisual" });
						adapter?.setSelectedCellRange?.(null);
						setMode("NORMAL");
						event.preventDefault();
						return true;
					}
					if (visualMap.yankSelection && rawKey === visualMap.yankSelection) {
						const range = cellRange();
						if (isScratchpad && range && adapter?.yankCellRange) {
							const yanked = adapter.yankCellRange(range.start, range.end);
							if (yanked)
								editorStore.dispatch({ type: "setYank", value: yanked });
						}
						editorStore.dispatch({ type: "clearVisual" });
						adapter?.setSelectedCellRange?.(null);
						setMode("NORMAL");
						event.preventDefault();
						return true;
					}
					if (visualMap.pasteSelection && rawKey === visualMap.pasteSelection) {
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
						event.preventDefault();
						return true;
					}
					if (visualMap.extendDown && rawKey === visualMap.extendDown) {
						if (isScratchpad && adapter) {
							const total = adapter.getCellCount?.() ?? 1;
							editorStore.dispatch({
								type: "extendVisual",
								delta: 1,
								count: total,
							});
							adapter.setCellCaret?.(cellIndex(), editorState().caretColumn) ??
								adapter.setActiveCellIndex?.(cellIndex());
							adapter.setSelectedCellRange?.(cellRange());
						} else {
							adapter?.moveLine?.(1);
						}
						event.preventDefault();
						return true;
					}
					if (visualMap.extendUp && rawKey === visualMap.extendUp) {
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
						event.preventDefault();
						return true;
					}
					if (visualMap.extendLeft && rawKey === visualMap.extendLeft) {
						if (!isScratchpad && adapter) {
							const sel = adapter.getSelection();
							adapter.setSelection({
								start: sel.start,
								end: Math.max(0, sel.end - 1),
							});
						}
						event.preventDefault();
						return true;
					}
					if (visualMap.extendRight && rawKey === visualMap.extendRight) {
						if (!isScratchpad && adapter) {
							const sel = adapter.getSelection();
							adapter.setSelection({
								start: sel.start,
								end: Math.min(adapter.getText().length, sel.end + 1),
							});
						}
						event.preventDefault();
						return true;
					}
					if (visualMap.swapAnchor && rawKey === visualMap.swapAnchor) {
						if (isScratchpad && cellRange()) {
							editorStore.dispatch({ type: "swapVisualAnchor" });
							adapter?.setCellCaret?.(cellIndex(), editorState().caretColumn) ??
								adapter?.setActiveCellIndex?.(cellIndex());
							adapter?.setSelectedCellRange?.(cellRange());
						} else {
							adapter?.swapSelectionAnchor?.();
						}
						event.preventDefault();
						return true;
					}
					if (normalMap?.runCell && rawKey === normalMap.runCell) {
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
