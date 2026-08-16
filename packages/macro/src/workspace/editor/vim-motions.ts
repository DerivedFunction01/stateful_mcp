/**
 * Pure Vim motion calculations and word boundary algorithms.
 */

const WORD_CHAR_REGEX = /[\p{L}\p{N}_]/u;
const WHITESPACE_REGEX = /\s/;

export function isWordChar(char: string): boolean {
	return WORD_CHAR_REGEX.test(char);
}

export function isWhitespace(char: string): boolean {
	return WHITESPACE_REGEX.test(char);
}

/**
 * Finds the start column of the next word ('w' in Vim).
 */
export function findNextWord(lineText: string, currentCol: number): number {
	const len = lineText.length;
	if (currentCol >= len - 1) return len;

	let i = currentCol;
	const startIsWord = isWordChar(lineText[i] ?? "");
	const startIsPunct = !startIsWord && !isWhitespace(lineText[i] ?? "");

	if (startIsWord) {
		while (i < len && isWordChar(lineText[i] ?? "")) i++;
	} else if (startIsPunct) {
		while (
			i < len &&
			!isWordChar(lineText[i] ?? "") &&
			!isWhitespace(lineText[i] ?? "")
		)
			i++;
	}

	while (i < len && isWhitespace(lineText[i] ?? "")) i++;
	return Math.min(len, i);
}

/**
 * Finds the start column of the previous word ('b' in Vim).
 */
export function findPrevWord(lineText: string, currentCol: number): number {
	if (currentCol <= 0) return 0;

	let i = currentCol - 1;
	while (i > 0 && isWhitespace(lineText[i] ?? "")) i--;

	const endIsWord = isWordChar(lineText[i] ?? "");
	const endIsPunct = !endIsWord && !isWhitespace(lineText[i] ?? "");

	if (endIsWord) {
		while (i > 0 && isWordChar(lineText[i - 1] ?? "")) i--;
	} else if (endIsPunct) {
		while (
			i > 0 &&
			!isWordChar(lineText[i - 1] ?? "") &&
			!isWhitespace(lineText[i - 1] ?? "")
		)
			i--;
	}

	return Math.max(0, i);
}

/**
 * Finds the end column of the current/next word ('e' in Vim).
 */
export function findWordEnd(lineText: string, currentCol: number): number {
	const len = lineText.length;
	if (currentCol >= len - 1) return len;

	let i = currentCol + 1;
	while (i < len && isWhitespace(lineText[i] ?? "")) i++;

	const isWord = isWordChar(lineText[i] ?? "");
	if (isWord) {
		while (i < len - 1 && isWordChar(lineText[i + 1] ?? "")) i++;
	} else {
		while (
			i < len - 1 &&
			!isWordChar(lineText[i + 1] ?? "") &&
			!isWhitespace(lineText[i + 1] ?? "")
		)
			i++;
	}

	return Math.min(len, i);
}

/**
 * Finds first non-blank character ('^' in Vim).
 */
export function findFirstNonBlank(lineText: string): number {
	for (let i = 0; i < lineText.length; i++) {
		if (!isWhitespace(lineText[i] ?? "")) return i;
	}
	return 0;
}

/**
 * Finds the boundaries of the word under cursor ('ciw' / 'diw' in Vim).
 */
export function findWordRangeAt(
	lineText: string,
	currentCol: number,
): { start: number; end: number } | null {
	const len = lineText.length;
	if (len === 0) return null;

	const col = Math.max(0, Math.min(len - 1, currentCol));
	const charAt = lineText[col] ?? "";

	if (isWhitespace(charAt)) {
		let start = col;
		while (start > 0 && isWhitespace(lineText[start - 1] ?? "")) start--;
		let end = col;
		while (end < len && isWhitespace(lineText[end] ?? "")) end++;
		return { start, end };
	}

	const isWord = isWordChar(charAt);
	let start = col;
	while (start > 0 && isWordChar(lineText[start - 1] ?? "") === isWord) start--;

	let end = col;
	while (end < len && isWordChar(lineText[end] ?? "") === isWord) end++;

	return { start, end };
}
