export function hasScientificNotation(text: string): boolean {
	return /[eE][+-]?\d+$/u.test(text);
}
