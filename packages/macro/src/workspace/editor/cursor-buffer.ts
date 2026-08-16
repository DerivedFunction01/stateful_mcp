export interface CursorPosition {
	readonly line: number;
	readonly col: number;
}

export interface SelectionRange {
	readonly start: CursorPosition;
	readonly end: CursorPosition;
}

export class CursorBuffer {
	private lines: string[];
	private cursor: CursorPosition = { line: 0, col: 0 };
	private selection: SelectionRange | null = null;
	private readonly listeners = new Set<() => void>();

	constructor(initialText = "") {
		this.lines = initialText.split("\n");
		if (this.lines.length === 0) this.lines = [""];
	}

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

	insertText(text: string): void {
		if (this.selection) {
			this.deleteSelection();
		}

		const current = this.lines[this.cursor.line] ?? "";
		const prefix = current.slice(0, this.cursor.col);
		const suffix = current.slice(this.cursor.col);

		if (!text.includes("\n")) {
			this.lines[this.cursor.line] = prefix + text + suffix;
			this.cursor = {
				line: this.cursor.line,
				col: this.cursor.col + text.length,
			};
		} else {
			const insertedLines = text.split("\n");
			const firstLine = prefix + insertedLines[0];
			const lastLine = (insertedLines[insertedLines.length - 1] ?? "") + suffix;
			const middleLines = insertedLines.slice(1, -1);

			this.lines.splice(
				this.cursor.line,
				1,
				firstLine,
				...middleLines,
				lastLine,
			);
			this.cursor = {
				line: this.cursor.line + insertedLines.length - 1,
				col: (insertedLines[insertedLines.length - 1] ?? "").length,
			};
		}
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
			// Backspace
			if (col > 0) {
				this.lines[line] =
					currentLine.slice(0, col - 1) + currentLine.slice(col);
				this.cursor = { line, col: col - 1 };
				this.notify();
			} else if (line > 0) {
				// Join with previous line
				const prevLine = this.lines[line - 1] ?? "";
				const newCol = prevLine.length;
				this.lines[line - 1] = prevLine + currentLine;
				this.lines.splice(line, 1);
				this.cursor = { line: line - 1, col: newCol };
				this.notify();
			}
		} else {
			// Delete forward
			if (col < currentLine.length) {
				this.lines[line] =
					currentLine.slice(0, col) + currentLine.slice(col + 1);
				this.notify();
			} else if (line < this.lines.length - 1) {
				// Join with next line
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
				console.error("Error in CursorBuffer listener:", e);
			}
		}
	}
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
