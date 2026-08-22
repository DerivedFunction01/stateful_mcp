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
		if (target instanceof HTMLTextAreaElement) resizeTextareaToContent(target);
	});
}

export function isPrimaryModifier(
	event: KeyboardEvent | React.KeyboardEvent,
): boolean {
	return event.metaKey || event.ctrlKey;
}

export function isLiteralNewlineEvent(
	event: KeyboardEvent | React.KeyboardEvent,
): boolean {
	return event.key === "Enter" && (event.shiftKey || isPrimaryModifier(event));
}

export function resizeTextareaToContent(textarea: HTMLTextAreaElement): void {
	textarea.style.height = "auto";
	const maxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight);
	const height = Number.isFinite(maxHeight)
		? Math.min(textarea.scrollHeight, maxHeight)
		: textarea.scrollHeight;
	textarea.style.height = `${height}px`;
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
