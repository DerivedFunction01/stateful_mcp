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

export interface BrowserEditorSurfaceAdapter {
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
		getAdapter?: () => BrowserEditorSurfaceAdapter | undefined;
		getKeymap?: () => KeymapSource;
		onExecuteLine?: () => void;
		onPreviewLine?: () => void;
	},
): BrowserVimController {
	let state: BrowserVimState = { enabled: initialEnabled, mode: "NORMAL" };
	let sequenceBuffer = "";
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

			// Escape always returns to NORMAL mode
			if (rawKey === "Escape" || chord === "escape" || chord === "ctrl+[") {
				clearSequence();
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

			// Handle sequence buffering (e.g. "dd", "yy", "[e", "]e")
			if (state.mode === "NORMAL" && sequenceMap) {
				const currentSeq = sequenceBuffer + rawKey;

				// Check if any defined sequence starts with or matches currentSeq
				const matchingSequenceKey = Object.entries(sequenceMap).find(
					([, seqChord]) => (seqChord as string) === currentSeq,
				);
				const hasPartialMatch = Object.values(sequenceMap).some(
					(seqChord) =>
						typeof seqChord === "string" &&
						seqChord.startsWith(currentSeq) &&
						seqChord.length > currentSeq.length,
				);

				if (matchingSequenceKey) {
					clearSequence();
					const [action] = matchingSequenceKey;
					if (action === "deleteCell") {
						if (adapter?.deleteCurrentLine) {
							adapter.deleteCurrentLine();
						} else if (adapter) {
							const text = adapter.getText();
							const sel = adapter.getSelection();
							const lines = text.split("\n");
							const currentLineIdx = text.slice(0, sel.end).split("\n").length - 1;
							lines.splice(currentLineIdx, 1);
							adapter.replaceSelection("");
							// Recompute text
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
				// Check normal map actions directly (Strict Zero Fallback)
				if (normalMap) {
					if (normalMap.enterInsert && rawKey === normalMap.enterInsert) {
						setMode("INSERT");
						event.preventDefault();
						return true;
					}
					if (normalMap.insertBelow && rawKey === normalMap.insertBelow) {
						if (adapter?.insertLine) {
							adapter.insertLine("below");
						}
						setMode("INSERT");
						event.preventDefault();
						return true;
					}
					if (normalMap.insertAbove && rawKey === normalMap.insertAbove) {
						if (adapter?.insertLine) {
							adapter.insertLine("above");
						}
						setMode("INSERT");
						event.preventDefault();
						return true;
					}
					if (normalMap.enterVisual && rawKey === normalMap.enterVisual) {
						setMode("VISUAL");
						event.preventDefault();
						return true;
					}
					if (normalMap.moveDown && rawKey === normalMap.moveDown) {
						adapter?.moveLine?.(1);
						event.preventDefault();
						return true;
					}
					if (normalMap.moveUp && rawKey === normalMap.moveUp) {
						adapter?.moveLine?.(-1);
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
						options?.onExecuteLine?.();
						event.preventDefault();
						return true;
					}
					if (normalMap.previewCell && rawKey === normalMap.previewCell) {
						options?.onPreviewLine?.();
						event.preventDefault();
						return true;
					}
					if (normalMap.command && rawKey === normalMap.command) {
						options?.onCommandModeUnsupported?.();
						event.preventDefault();
						return true;
					}
				}

				// Check standard EffectiveKeymap bindings
				if (bindings && bindings.length > 0) {
					const matched = matchEffectiveBindings(
						bindings,
						chord,
						state.mode,
						{
							editorMode: state.mode,
						},
					);
					if (matched) {
						if (matched.command === "editor.enterInsert") {
							setMode("INSERT");
						} else if (matched.command === "editor.moveDown") {
							adapter?.moveLine?.(1);
						} else if (matched.command === "editor.moveUp") {
							adapter?.moveLine?.(-1);
						} else if (matched.command === "editor.moveLeft") {
							if (adapter) {
								const sel = adapter.getSelection();
								const next = Math.max(0, sel.end - 1);
								adapter.setSelection({ start: next, end: next });
							}
						} else if (matched.command === "editor.moveRight") {
							if (adapter) {
								const sel = adapter.getSelection();
								const next = Math.min(adapter.getText().length, sel.end + 1);
								adapter.setSelection({ start: next, end: next });
							}
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
						adapter?.replaceSelection("");
						setMode("NORMAL");
						event.preventDefault();
						return true;
					}
					if (visualMap.extendDown && rawKey === visualMap.extendDown) {
						adapter?.moveLine?.(1);
						event.preventDefault();
						return true;
					}
					if (visualMap.extendUp && rawKey === visualMap.extendUp) {
						adapter?.moveLine?.(-1);
						event.preventDefault();
						return true;
					}
					if (visualMap.extendLeft && rawKey === visualMap.extendLeft) {
						if (adapter) {
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
						if (adapter) {
							const sel = adapter.getSelection();
							adapter.setSelection({
								start: sel.start,
								end: Math.min(adapter.getText().length, sel.end + 1),
							});
						}
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
