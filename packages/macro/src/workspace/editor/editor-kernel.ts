import { CursorBuffer, type CursorPosition } from "./cursor-buffer";
import {
	findFirstNonBlank,
	findNextWord,
	findPrevWord,
	findWordEnd,
	findWordRangeAt,
} from "./vim-motions";

export type EditorMode = "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";

export interface KeyInput {
	readonly name?: string;
	readonly char?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	readonly shift?: boolean;
}

export class EditorKernel {
	public readonly buffer: CursorBuffer;
	private mode: EditorMode = "NORMAL";
	private commandText = "";
	private submittedCommand: string | null = null;
	private yankBuffer = "";
	private lastPendingKey = "";
	private readonly listeners = new Set<() => void>();

	constructor(initialText = "") {
		this.buffer = new CursorBuffer(initialText);
		this.buffer.subscribe(() => this.notify());
	}

	getMode(): EditorMode {
		return this.mode;
	}

	setMode(mode: EditorMode): void {
		if (this.mode !== mode) {
			this.mode = mode;
			if (mode === "NORMAL") {
				this.buffer.setSelection(null);
				this.commandText = "";
				this.lastPendingKey = "";
			} else if (mode === "VISUAL") {
				if (!this.buffer.getSelection()) {
					const cur = this.buffer.getCursor();
					this.buffer.setSelection({ start: cur, end: cur });
				}
			} else if (mode === "COMMAND") {
				this.commandText = "";
			}
			this.notify();
		}
	}

	getCommandText(): string {
		return this.commandText;
	}

	consumeSubmittedCommand(): string | null {
		const command = this.submittedCommand;
		this.submittedCommand = null;
		return command;
	}

	setCommandText(text: string): void {
		this.commandText = text;
		this.notify();
	}

	getYankBuffer(): string {
		return this.yankBuffer;
	}

	// Modeless mouse / direct-manipulation methods
	clickAt(line: number, col: number): void {
		this.buffer.setCursor(line, col);
		this.buffer.setSelection(null);
	}

	dragSelection(start: CursorPosition, end: CursorPosition): void {
		this.buffer.setCursor(end.line, end.col);
		this.buffer.setSelection({ start, end });
		if (this.mode === "NORMAL") {
			this.setMode("VISUAL");
		}
	}

	selectWordAt(line: number, col: number): void {
		const lineText = this.buffer.getLine(line);
		const range = findWordRangeAt(lineText, col);
		if (range) {
			this.buffer.setCursor(line, range.end);
			this.buffer.setSelection({
				start: { line, col: range.start },
				end: { line, col: range.end },
			});
			this.setMode("VISUAL");
		}
	}

	selectLineAt(line: number): void {
		const lineText = this.buffer.getLine(line);
		this.buffer.setCursor(line, lineText.length);
		this.buffer.setSelection({
			start: { line, col: 0 },
			end: { line, col: lineText.length },
		});
		this.setMode("VISUAL");
	}

	/**
	 * Dispatches a key input according to current editor mode.
	 */
	handleKey(input: KeyInput): boolean {
		const char = input.char ?? "";
		const name = input.name ?? "";

		// Global Escape
		if (name === "escape") {
			this.setMode("NORMAL");
			return true;
		}

		if (this.mode === "INSERT") {
			return this.handleInsertKey(input);
		}

		if (this.mode === "VISUAL") {
			return this.handleVisualKey(input);
		}

		if (this.mode === "COMMAND") {
			return this.handleCommandModeKey(input);
		}

		// NORMAL Mode
		return this.handleNormalKey(input);
	}

	private handleInsertKey(input: KeyInput): boolean {
		const { name, char } = input;

		if (name === "return" || name === "enter") {
			this.buffer.splitLine();
			return true;
		}

		if (name === "backspace") {
			this.buffer.deleteChar(-1);
			return true;
		}

		if (name === "delete") {
			this.buffer.deleteChar(1);
			return true;
		}

		if (name === "left") {
			this.buffer.moveCursor(0, -1);
			return true;
		}
		if (name === "right") {
			this.buffer.moveCursor(0, 1);
			return true;
		}
		if (name === "up") {
			this.buffer.moveCursor(-1, 0);
			return true;
		}
		if (name === "down") {
			this.buffer.moveCursor(1, 0);
			return true;
		}

		if (char && char.length > 0 && !input.ctrl && !input.meta) {
			this.buffer.insertText(char);
			return true;
		}

		return false;
	}

	private handleNormalKey(input: KeyInput): boolean {
		const char = input.char ?? "";
		const name = input.name ?? "";
		const cur = this.buffer.getCursor();
		const currentLine = this.buffer.getLine(cur.line);

		// Handle multi-key prefixes (e.g. 'dd', 'yy', 'gg')
		if (this.lastPendingKey) {
			const pending = this.lastPendingKey;
			this.lastPendingKey = "";

			if (pending === "d" && char === "d") {
				this.yankBuffer = this.buffer.deleteLine(cur.line);
				return true;
			}
			if (pending === "y" && char === "y") {
				this.yankBuffer = currentLine;
				return true;
			}
			if (pending === "g" && char === "g") {
				this.buffer.setCursor(0, 0);
				return true;
			}
			if (pending === "c" && char === "w") {
				const range = findWordRangeAt(currentLine, cur.col);
				if (range) {
					this.buffer.setSelection({
						start: { line: cur.line, col: cur.col },
						end: { line: cur.line, col: range.end },
					});
					this.buffer.deleteSelection();
				}
				this.setMode("INSERT");
				return true;
			}
		}

		// Motions
		if (char === "h" || name === "left") {
			this.buffer.moveCursor(0, -1);
			return true;
		}
		if (char === "l" || name === "right") {
			this.buffer.moveCursor(0, 1);
			return true;
		}
		if (char === "j" || name === "down") {
			this.buffer.moveCursor(1, 0);
			return true;
		}
		if (char === "k" || name === "up") {
			this.buffer.moveCursor(-1, 0);
			return true;
		}
		if (char === "w") {
			const nextCol = findNextWord(currentLine, cur.col);
			this.buffer.setCursor(cur.line, nextCol);
			return true;
		}
		if (char === "b") {
			const prevCol = findPrevWord(currentLine, cur.col);
			this.buffer.setCursor(cur.line, prevCol);
			return true;
		}
		if (char === "e") {
			const endCol = findWordEnd(currentLine, cur.col);
			this.buffer.setCursor(cur.line, endCol);
			return true;
		}
		if (char === "0") {
			this.buffer.setCursor(cur.line, 0);
			return true;
		}
		if (char === "^") {
			this.buffer.setCursor(cur.line, findFirstNonBlank(currentLine));
			return true;
		}
		if (char === "$") {
			this.buffer.setCursor(cur.line, currentLine.length);
			return true;
		}
		if (char === "G") {
			this.buffer.setCursor(this.buffer.getLineCount() - 1, 0);
			return true;
		}

		// Edit triggers
		if (char === "i") {
			this.setMode("INSERT");
			return true;
		}
		if (char === "a") {
			this.buffer.moveCursor(0, 1);
			this.setMode("INSERT");
			return true;
		}
		if (char === "A") {
			this.buffer.setCursor(cur.line, currentLine.length);
			this.setMode("INSERT");
			return true;
		}
		if (char === "I") {
			this.buffer.setCursor(cur.line, findFirstNonBlank(currentLine));
			this.setMode("INSERT");
			return true;
		}
		if (char === "o") {
			this.buffer.insertLine(cur.line + 1, "");
			this.buffer.setCursor(cur.line + 1, 0);
			this.setMode("INSERT");
			return true;
		}
		if (char === "O") {
			this.buffer.insertLine(cur.line, "");
			this.buffer.setCursor(cur.line, 0);
			this.setMode("INSERT");
			return true;
		}
		if (char === "x") {
			this.buffer.deleteChar(1);
			return true;
		}
		if (char === "v") {
			this.setMode("VISUAL");
			return true;
		}
		if (char === "p") {
			if (this.yankBuffer) {
				this.buffer.insertLine(cur.line + 1, this.yankBuffer);
				this.buffer.setCursor(cur.line + 1, 0);
			}
			return true;
		}
		if (char === ":") {
			this.setMode("COMMAND");
			return true;
		}

		// Check for pending keys (d, y, g, c)
		if (char === "d" || char === "y" || char === "g" || char === "c") {
			this.lastPendingKey = char;
			return true;
		}

		return false;
	}

	private handleVisualKey(input: KeyInput): boolean {
		const char = input.char ?? "";
		const name = input.name ?? "";
		const sel = this.buffer.getSelection();
		const start = sel?.start ?? this.buffer.getCursor();

		if (char === "d" || char === "x") {
			this.buffer.deleteSelection();
			this.setMode("NORMAL");
			return true;
		}
		if (char === "y") {
			// Yank selection
			this.setMode("NORMAL");
			return true;
		}

		// Move cursor and expand selection
		if (char === "h" || name === "left") this.buffer.moveCursor(0, -1);
		if (char === "l" || name === "right") this.buffer.moveCursor(0, 1);
		if (char === "j" || name === "down") this.buffer.moveCursor(1, 0);
		if (char === "k" || name === "up") this.buffer.moveCursor(-1, 0);

		this.buffer.setSelection({
			start,
			end: this.buffer.getCursor(),
		});
		return true;
	}

	private handleCommandModeKey(input: KeyInput): boolean {
		const { name, char } = input;

		if (name === "return" || name === "enter") {
			const cmd = this.commandText.trim();
			this.submittedCommand = cmd;
			this.setMode("NORMAL");
			return true;
		}
		if (name === "backspace") {
			if (this.commandText.length > 0) {
				this.commandText = this.commandText.slice(0, -1);
				this.notify();
			} else {
				this.setMode("NORMAL");
			}
			return true;
		}
		if (char && char.length > 0 && !input.ctrl && !input.meta) {
			this.commandText += char;
			this.notify();
			return true;
		}
		return false;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error("Error in EditorKernel listener:", e);
			}
		}
	}
}
