import type { EditorMode } from "@stateful-mcp/macro-protocol";
import { findWordRangeAt } from "./vim-motions";

export type { EditorMode };

export interface CursorPosition {
	readonly line: number;
	readonly col: number;
}

/** A logical scratchpad line (one macro cell). Its text may contain newlines. */
export interface EditorLine {
	readonly lineId: string;
	readonly text: string;
}

export interface SelectionRange {
	readonly start: CursorPosition;
	readonly end: CursorPosition;
}

export function normalizeSelection(sel: SelectionRange): {
	start: CursorPosition;
	end: CursorPosition;
} {
	if (
		sel.start.line < sel.end.line ||
		(sel.start.line === sel.end.line && sel.start.col <= sel.end.col)
	) {
		return { start: sel.start, end: sel.end };
	}
	return { start: sel.end, end: sel.start };
}

/**
 * Headless, high-performance document editor kernel.
 * Manages document text lines, cursor position, selection range, modal state,
 * and yank buffers with zero redundant indirection.
 */
export class EditorKernel {
	private lines: string[];
	private cursor: CursorPosition = { line: 0, col: 0 };
	private selection: SelectionRange | null = null;
	private mode: EditorMode = "NORMAL";
	private commandText = "";
	private submittedCommand: string | null = null;
	private yankBuffer = "";
	private readonly listeners = new Set<() => void>();

	constructor(initialText = "", initialLines?: readonly EditorLine[]) {
		this.lines =
			initialLines?.map((line) => line.text) ?? initialText.split("\n");
		if (this.lines.length === 0) this.lines = [""];
	}

	// ─── Modal State Management ──────────────────────────────────────────

	getMode(): EditorMode {
		return this.mode;
	}

	setMode(mode: EditorMode): void {
		if (this.mode !== mode) {
			this.mode = mode;
			if (mode === "NORMAL") {
				this.selection = null;
				this.commandText = "";
			} else if (mode === "VISUAL") {
				if (!this.selection) {
					this.selection = { start: this.cursor, end: this.cursor };
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

	setCommandText(text: string): void {
		this.commandText = text;
		this.notify();
	}

	submitCommand(command?: string): void {
		this.submittedCommand = command ?? this.commandText;
		this.commandText = "";
		this.setMode("NORMAL");
	}

	consumeSubmittedCommand(): string | null {
		const command = this.submittedCommand;
		this.submittedCommand = null;
		return command;
	}

	getYankBuffer(): string {
		return this.yankBuffer;
	}

	setYankBuffer(text: string): void {
		this.yankBuffer = text;
		this.notify();
	}

	// ─── Document Text Manipulation ──────────────────────────────────────

	getText(): string {
		return this.lines.join("\n");
	}

	setText(text: string): void {
		this.lines = text.split("\n");
		if (this.lines.length === 0) this.lines = [""];
		this.clampCursor();
		this.selection = null;
		this.notify();
	}

	/** Replace the logical scratchpad lines. Embedded newlines stay in a line. */
	setLines(lines: readonly string[]): void {
		this.lines = lines.length > 0 ? [...lines] : [""];
		this.clampCursor();
		this.selection = null;
		this.notify();
	}

	getLines(): readonly string[] {
		return this.lines;
	}

	getLineCount(): number {
		return this.lines.length;
	}

	getLine(lineIndex: number): string {
		return this.lines[lineIndex] ?? "";
	}

	setLine(lineIndex: number, text: string): void {
		if (lineIndex >= 0 && lineIndex < this.lines.length) {
			this.lines[lineIndex] = text;
			this.clampCursor();
			this.notify();
		}
	}

	insertText(text: string): void {
		if (this.selection) {
			this.deleteSelection();
		}

		const current = this.lines[this.cursor.line] ?? "";
		const prefix = current.slice(0, this.cursor.col);
		const suffix = current.slice(this.cursor.col);

		this.lines[this.cursor.line] = prefix + text + suffix;
		this.cursor = {
			line: this.cursor.line,
			col: this.cursor.col + text.length,
		};
		this.notify();
	}

	deleteChar(direction: -1 | 1): void {
		if (this.selection) {
			this.deleteSelection();
			return;
		}

		const { line, col } = this.cursor;
		const currentLine = this.lines[line] ?? "";

		if (direction === -1) {
			if (col > 0) {
				this.lines[line] =
					currentLine.slice(0, col - 1) + currentLine.slice(col);
				this.cursor = { line, col: col - 1 };
				this.notify();
			} else if (line > 0) {
				const prevLine = this.lines[line - 1] ?? "";
				const newCol = prevLine.length;
				this.lines[line - 1] = prevLine + currentLine;
				this.lines.splice(line, 1);
				this.cursor = { line: line - 1, col: newCol };
				this.notify();
			}
		} else {
			if (col < currentLine.length) {
				this.lines[line] =
					currentLine.slice(0, col) + currentLine.slice(col + 1);
				this.notify();
			} else if (line < this.lines.length - 1) {
				const nextLine = this.lines[line + 1] ?? "";
				this.lines[line] = currentLine + nextLine;
				this.lines.splice(line + 1, 1);
				this.notify();
			}
		}
	}

	deleteLine(lineIndex: number): string {
		if (lineIndex < 0 || lineIndex >= this.lines.length) return "";
		const deleted = this.lines[lineIndex] ?? "";
		if (this.lines.length === 1) {
			this.lines = [""];
			this.cursor = { line: 0, col: 0 };
		} else {
			this.lines.splice(lineIndex, 1);
			this.clampCursor();
		}
		this.notify();
		return deleted;
	}

	insertLine(lineIndex: number, text = ""): void {
		const targetIndex = Math.max(0, Math.min(this.lines.length, lineIndex));
		this.lines.splice(targetIndex, 0, text);
		this.notify();
	}

	splitLine(): void {
		if (this.selection) {
			this.deleteSelection();
		}
		const { line, col } = this.cursor;
		const current = this.lines[line] ?? "";
		const prefix = current.slice(0, col);
		const suffix = current.slice(col);

		this.lines[line] = prefix;
		this.lines.splice(line + 1, 0, suffix);
		this.cursor = { line: line + 1, col: 0 };
		this.notify();
	}

	deleteSelection(): void {
		if (!this.selection) return;
		const { start, end } = normalizeSelection(this.selection);

		if (start.line === end.line) {
			const current = this.lines[start.line] ?? "";
			this.lines[start.line] =
				current.slice(0, start.col) + current.slice(end.col);
		} else {
			const firstLine = (this.lines[start.line] ?? "").slice(0, start.col);
			const lastLine = (this.lines[end.line] ?? "").slice(end.col);
			this.lines.splice(
				start.line,
				end.line - start.line + 1,
				firstLine + lastLine,
			);
		}

		this.cursor = { line: start.line, col: start.col };
		this.selection = null;
		this.notify();
	}

	getSelectedText(): string {
		if (!this.selection) return "";
		const { start, end } = normalizeSelection(this.selection);
		if (start.line === end.line) {
			const line = this.getLine(start.line);
			return line.slice(start.col, end.col);
		}
		const lines: string[] = [];
		for (let i = start.line; i <= end.line; i++) {
			const line = this.getLine(i);
			if (i === start.line) {
				lines.push(line.slice(start.col));
			} else if (i === end.line) {
				lines.push(line.slice(0, end.col));
			} else {
				lines.push(line);
			}
		}
		return lines.join("\n");
	}

	yankSelection(): void {
		const selected = this.getSelectedText();
		if (selected) {
			this.setYankBuffer(selected);
		}
	}

	pasteYank(): void {
		if (this.yankBuffer) {
			this.insertText(this.yankBuffer);
		}
	}

	// ─── Caret & Direct Manipulation ─────────────────────────────────────

	getCursor(): CursorPosition {
		return this.cursor;
	}

	setCursor(line: number, col: number): void {
		const targetLine = Math.max(0, Math.min(this.lines.length - 1, line));
		const currentLineText = this.lines[targetLine] ?? "";
		const targetCol = Math.max(0, Math.min(currentLineText.length, col));

		if (this.cursor.line !== targetLine || this.cursor.col !== targetCol) {
			this.cursor = { line: targetLine, col: targetCol };
			this.notify();
		}
	}

	moveCursor(deltaLine: number, deltaCol: number): void {
		const targetLine = Math.max(
			0,
			Math.min(this.lines.length - 1, this.cursor.line + deltaLine),
		);
		const currentLineText = this.lines[targetLine] ?? "";
		const targetCol = Math.max(
			0,
			Math.min(currentLineText.length, this.cursor.col + deltaCol),
		);
		this.setCursor(targetLine, targetCol);
	}

	getSelection(): SelectionRange | null {
		return this.selection;
	}

	setSelection(selection: SelectionRange | null): void {
		this.selection = selection;
		this.notify();
	}

	clickAt(line: number, col: number): void {
		this.setCursor(line, col);
		this.selection = null;
		this.notify();
	}

	dragSelection(start: CursorPosition, end: CursorPosition): void {
		this.setCursor(end.line, end.col);
		this.selection = { start, end };
		if (this.mode === "NORMAL") {
			this.setMode("VISUAL");
		}
		this.notify();
	}

	selectWordAt(line: number, col: number): void {
		const lineText = this.getLine(line);
		const range = findWordRangeAt(lineText, col);
		if (range) {
			this.setCursor(line, range.end);
			this.selection = {
				start: { line, col: range.start },
				end: { line, col: range.end },
			};
			this.setMode("VISUAL");
			this.notify();
		}
	}

	selectLineAt(line: number): void {
		const lineText = this.getLine(line);
		this.setCursor(line, lineText.length);
		this.selection = {
			start: { line, col: 0 },
			end: { line, col: lineText.length },
		};
		this.setMode("VISUAL");
		this.notify();
	}

	// ─── Subscriptions & Event Propagation ───────────────────────────────

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private clampCursor(): void {
		const maxLine = Math.max(0, this.lines.length - 1);
		const line = Math.max(0, Math.min(maxLine, this.cursor.line));
		const currentLineText = this.lines[line] ?? "";
		const col = Math.max(0, Math.min(currentLineText.length, this.cursor.col));
		this.cursor = { line, col };
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
