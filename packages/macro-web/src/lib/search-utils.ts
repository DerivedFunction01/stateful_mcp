export function insertAtCaret(
	target: HTMLTextAreaElement | HTMLInputElement,
	insertion: string,
	onChange: (value: string) => void,
): void {
	const start = target.selectionStart ?? target.value.length;
	const end = target.selectionEnd ?? start;
	onChange(
		`${target.value.slice(0, start)}${insertion}${target.value.slice(end)}`,
	);
	const caret = start + insertion.length;
	requestAnimationFrame(() => {
		target.focus();
		target.setSelectionRange(caret, caret);
	});
}

export function unescapeSearchPattern(raw: string, isRegex: boolean): string {
	if (isRegex) return raw;
	return raw.replace(/\\([nt])/g, (_, escapedCharacter: string) =>
		escapedCharacter === "n" ? "\n" : "\t",
	);
}

export function unescapeReplacementString(raw: string): string {
	return raw.replace(/\\([nt])/g, (_, escapedCharacter: string) =>
		escapedCharacter === "n" ? "\n" : "\t",
	);
}
