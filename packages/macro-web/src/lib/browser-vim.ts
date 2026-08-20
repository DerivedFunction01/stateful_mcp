import type {
	EditorMode,
	EffectiveKeymapDto,
	KeymapBindingDto,
} from "@stateful-mcp/macro-protocol";
import { matchEffectiveBindings } from "@stateful-mcp/macro-protocol";

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
	// Cell-aware operations
	getActiveCellIndex?(): number;
	setActiveCellIndex?(index: number): void;
	getCellCount?(): number;
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
	pasteCell?(text: string, position: "above" | "below"): void;
	focusCellForEdit?(index?: number): void;
	blurCellEdit?(): void;

	// Underlying text operations (when in insert mode or text fallback)
	getText(): string;
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
}

export interface BrowserVimController {
	getState(): BrowserVimState;
	setEnabled(enabled: boolean): void;
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

export function createBrowserVimController(
	initialEnabled = false,
	options?: {
		onCommandModeUnsupported?: () => void;
		onOpenCommandMode?: (initialQuery?: string) => void;
		getAdapter?: () => BrowserEditorSurfaceAdapter | undefined;
		getKeymap?: () => KeymapSource;
		onExecuteLine?: (lineNumber?: number) => void;
		onExecuteRange?: (startLine: number, endLine: number) => void;
		onPreviewLine?: () => void;
	},
): BrowserVimController {
	let state: BrowserVimState = { enabled: initialEnabled, mode: "NORMAL" };
	let sequenceBuffer = "";
	let yankBuffer = "";
	let sequenceTimer: ReturnType<typeof setTimeout> | null = null;
	const listeners = new Set<() => void>();
	const notify = () => listeners.forEach((listener) => listener());

	const setMode = (mode: EditorMode) => {
		sequenceBuffer = "";
		if (sequenceTimer) {
			clearTimeout(sequenceTimer);
			sequenceTimer = null;
		}
		if (state.mode !== mode) {
			state = { ...state, mode };
			notify();
		}
	};

	const clearSequence = () => {
		sequenceBuffer = "";
		if (sequenceTimer) {
			clearTimeout(sequenceTimer);
			sequenceTimer = null;
		}
	};

	return {
		getState: () => state,
		setEnabled: (enabled) => {
			if (state.enabled !== enabled) {
				state = { enabled, mode: "NORMAL" };
				clearSequence();
				notify();
			}
		},
		handleKeyDown: (event) => {
			if (!state.enabled) return false;

			const chord = normalizeChordFromEvent(event);
			const rawKey = event.key;
			const keymap = options?.getKeymap?.();
			const adapter = options?.getAdapter?.();

			// Escape always resets to clean NORMAL mode
			if (rawKey === "Escape" || chord === "escape" || chord === "ctrl+[") {
				clearSequence();
				adapter?.setSelectedCellRange?.(null);
				adapter?.blurCellEdit?.();
				setMode("NORMAL");
				event.preventDefault();
				return true;
			}

			// In INSERT mode, allow native typing unless Escape is hit
			if (state.mode === "INSERT") {
				return false;
			}

			// Retrieve configured keymap definitions directly with ZERO runtime fallbacks
			const normalMap = keymap?.vim?.normal ?? keymap?.normal;
			const visualMap = keymap?.vim?.visual ?? keymap?.visual;
			const sequenceMap = keymap?.vim?.sequences ?? keymap?.sequences;
			const bindings = keymap?.bindings;

			// Handle sequence buffering (e.g. "dd", "yy", "[e", "]e", "gw", "gp")
			if (state.mode === "NORMAL" && sequenceMap) {
				const currentSeq = sequenceBuffer + rawKey;
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
						const deleted =
							adapter?.deleteCell?.() ??
							adapter?.deleteCurrentLine?.() ??
							"";
						if (typeof deleted === "string" && deleted) {
							yankBuffer = deleted;
						}
					} else if (matchedAction === "yankCell") {
						const yanked = adapter?.yankCell?.();
						if (yanked) yankBuffer = yanked;
					} else if (matchedAction === "pasteAbove") {
						if (yankBuffer) {
							adapter?.pasteCell?.(yankBuffer, "above");
						}
					}
					event.preventDefault();
					return true;
				}

				if (hasPartialMatch) {
					sequenceBuffer = currentSeq;
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
						adapter?.focusCellForEdit?.() ?? adapter?.focus?.();
						event.preventDefault();
						return true;
					}
					if (normalMap.insertBelow && rawKey === normalMap.insertBelow) {
						adapter?.insertCell?.("below") ??
							adapter?.insertLine?.("below");
						setMode("INSERT");
						event.preventDefault();
						return true;
					}
					if (normalMap.insertAbove && rawKey === normalMap.insertAbove) {
						adapter?.insertCell?.("above") ??
							adapter?.insertLine?.("above");
						setMode("INSERT");
						event.preventDefault();
						return true;
					}
					if (normalMap.enterVisual && rawKey === normalMap.enterVisual) {
						setMode("VISUAL");
						const cur = adapter?.getActiveCellIndex?.() ?? 0;
						adapter?.setSelectedCellRange?.({ start: cur, end: cur });
						event.preventDefault();
						return true;
					}
					if (normalMap.moveDown && rawKey === normalMap.moveDown) {
						adapter?.moveCell?.(1) ?? adapter?.moveLine?.(1);
						event.preventDefault();
						return true;
					}
					if (normalMap.moveUp && rawKey === normalMap.moveUp) {
						adapter?.moveCell?.(-1) ?? adapter?.moveLine?.(-1);
						event.preventDefault();
						return true;
					}
					if (normalMap.moveLeft && rawKey === normalMap.moveLeft) {
						if (adapter) {
							const sel = adapter.getSelection();
							const next = Math.max(0, sel.end - 1);
							adapter.setSelection({ start: next, end: next });
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.moveRight && rawKey === normalMap.moveRight) {
						if (adapter) {
							const sel = adapter.getSelection();
							const next = Math.min(adapter.getText().length, sel.end + 1);
							adapter.setSelection({ start: next, end: next });
						}
						event.preventDefault();
						return true;
					}
					if (normalMap.pasteBelow && rawKey === normalMap.pasteBelow) {
						if (yankBuffer) {
							adapter?.pasteCell?.(yankBuffer, "below");
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
						const cellIdx = adapter?.getActiveCellIndex?.();
						if (options?.onExecuteLine) {
							options.onExecuteLine(
								cellIdx !== undefined ? cellIdx + 1 : undefined,
							);
						} else {
							adapter?.executeCell?.(cellIdx);
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
						setMode("COMMAND");
						if (options?.onOpenCommandMode) {
							options.onOpenCommandMode(":");
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
						options?.onOpenCommandMode?.("");
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
							adapter?.focusCellForEdit?.() ?? adapter?.focus?.();
						} else if (matched.command === "editor.moveDown") {
							adapter?.moveCell?.(1) ?? adapter?.moveLine?.(1);
						} else if (matched.command === "editor.moveUp") {
							adapter?.moveCell?.(-1) ?? adapter?.moveLine?.(-1);
						} else if (matched.command === "editor.executeLine") {
							const cellIdx = adapter?.getActiveCellIndex?.();
							options?.onExecuteLine?.(
								cellIdx !== undefined ? cellIdx + 1 : undefined,
							);
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
						const range = adapter?.getSelectedCellRange?.();
						if (range && adapter?.deleteCellRange) {
							const deleted = adapter.deleteCellRange(range.start, range.end);
							if (deleted) yankBuffer = deleted;
						} else {
							adapter?.replaceSelection("");
						}
						adapter?.setSelectedCellRange?.(null);
						setMode("NORMAL");
						event.preventDefault();
						return true;
					}
					if (
						visualMap.yankSelection &&
						rawKey === visualMap.yankSelection
					) {
						const range = adapter?.getSelectedCellRange?.();
						if (range && adapter?.yankCellRange) {
							const yanked = adapter.yankCellRange(range.start, range.end);
							if (yanked) yankBuffer = yanked;
						}
						adapter?.setSelectedCellRange?.(null);
						setMode("NORMAL");
						event.preventDefault();
						return true;
					}
					if (visualMap.extendDown && rawKey === visualMap.extendDown) {
						adapter?.extendCellSelection?.(1) ?? adapter?.moveLine?.(1);
						event.preventDefault();
						return true;
					}
					if (visualMap.extendUp && rawKey === visualMap.extendUp) {
						adapter?.extendCellSelection?.(-1) ?? adapter?.moveLine?.(-1);
						event.preventDefault();
						return true;
					}
					if (visualMap.swapAnchor && rawKey === visualMap.swapAnchor) {
						adapter?.swapSelectionAnchor?.();
						event.preventDefault();
						return true;
					}
					if (normalMap?.runCell && rawKey === normalMap.runCell) {
						const range = adapter?.getSelectedCellRange?.();
						if (range) {
							if (options?.onExecuteRange) {
								options.onExecuteRange(range.start + 1, range.end + 1);
							} else {
								adapter?.executeCellRange?.(range.start, range.end);
							}
						}
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
