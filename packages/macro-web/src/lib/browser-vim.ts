import type { EditorMode } from "@stateful-mcp/macro-protocol";

export interface BrowserVimKeyboardEvent {
	readonly key: string;
	preventDefault(): void;
	stopPropagation(): void;
}
export interface BrowserEditorSurfaceAdapter {
	getText(): string;
	getSelection(): { start: number; end: number };
	setSelection(selection: { start: number; end: number }): void;
	replaceSelection(text: string): void;
	focus(): void;
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

/**
 * Browser-native Vim context. It only owns mode transitions and command
 * context. Text insertion, selection, and DOM caret behavior stay with the
 * focused editor element rather than being routed through the terminal
 * EditorKernel.
 *
 * `COMMAND` mode (the `:` command line) is explicitly unsupported in the
 * browser during the pre-Phase-7 preflight. When `:` is entered in a focused,
 * Vim-enabled surface with no command-line surface registered, the controller
 * reports that fact through `onCommandModeUnsupported` but does NOT claim the
 * event, does NOT call `preventDefault()`, does NOT transition to `COMMAND`, and
 * does NOT route the character through NORMAL/INSERT bindings. Native text
 * behavior is preserved. Phase 7 may implement the real command-line path.
 */
export function createBrowserVimController(
	initialEnabled = false,
	options?: {
		onCommandModeUnsupported?: () => void;
		getAdapter?: () => BrowserEditorSurfaceAdapter | undefined;
	},
): BrowserVimController {
	let state: BrowserVimState = { enabled: initialEnabled, mode: "NORMAL" };
	const listeners = new Set<() => void>();
	const notify = () => listeners.forEach((listener) => listener());
	const setMode = (mode: EditorMode) => {
		if (state.mode !== mode) {
			state = { ...state, mode };
			notify();
		}
	};

	return {
		getState: () => state,
		setEnabled: (enabled) => {
			if (state.enabled !== enabled) {
				state = { enabled, mode: "NORMAL" };
				notify();
			}
		},
		handleKeyDown: (event) => {
			if (!state.enabled) return false;
			if (event.key === ":") {
				options?.onCommandModeUnsupported?.();
				return false;
			}
			if (event.key === "Escape") {
				setMode("NORMAL");
				return true;
			}
			if (state.mode === "INSERT") {
				if (event.key === "Escape") setMode("NORMAL");
				return false;
			}
			if (state.mode === "VISUAL") {
				if (event.key === "i") setMode("INSERT");
				return false;
			}
			if (event.key === "i" || event.key === "a" || event.key === "o") {
				const adapter = options?.getAdapter?.();
				if (adapter && event.key === "o") {
					const selection = adapter.getSelection();
					adapter.setSelection({ start: selection.end, end: selection.end });
					adapter.replaceSelection("\n");
				}
				if (adapter && event.key === "a") {
					const selection = adapter.getSelection();
					adapter.setSelection({
						start: Math.min(selection.end + 1, adapter.getText().length),
						end: Math.min(selection.end + 1, adapter.getText().length),
					});
				}
				setMode("INSERT");
				return true;
			}
			if (event.key === "v") {
				const adapter = options?.getAdapter?.();
				if (adapter) {
					const selection = adapter.getSelection();
					adapter.setSelection({ start: selection.start, end: selection.end });
				}
				setMode("VISUAL");
				return true;
			}
			if (event.key === "h" || event.key === "l") {
				const adapter = options?.getAdapter?.();
				if (!adapter) return false;
				const selection = adapter.getSelection();
				const next = Math.max(
					0,
					Math.min(
						adapter.getText().length,
						selection.end + (event.key === "h" ? -1 : 1),
					),
				);
				adapter.setSelection({ start: next, end: next });
				adapter.focus();
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
