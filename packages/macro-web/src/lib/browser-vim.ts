import type { KeyboardEvent } from "react";

export type BrowserVimMode = "NORMAL" | "INSERT" | "VISUAL";

export interface BrowserVimState {
	readonly enabled: boolean;
	readonly mode: BrowserVimMode;
}

export interface BrowserVimController {
	getState(): BrowserVimState;
	setEnabled(enabled: boolean): void;
	handleKeyDown(event: KeyboardEvent): boolean;
	subscribe(listener: () => void): () => void;
}

/**
 * Browser-native Vim context. It only owns mode transitions and command
 * context. Text insertion, selection, and DOM caret behavior stay with the
 * focused editor element rather than being routed through the terminal
 * EditorKernel.
 */
export function createBrowserVimController(
	initialEnabled = false,
): BrowserVimController {
	let state: BrowserVimState = { enabled: initialEnabled, mode: "NORMAL" };
	const listeners = new Set<() => void>();
	const notify = () => listeners.forEach((listener) => listener());
	const setMode = (mode: BrowserVimMode) => {
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
				setMode("INSERT");
				return true;
			}
			if (event.key === "v") {
				setMode("VISUAL");
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
