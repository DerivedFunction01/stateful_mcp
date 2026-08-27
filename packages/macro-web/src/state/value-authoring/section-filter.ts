/**
 * Value-grammar settings sections are owned exclusively by Value Studio; the
 * legacy schema renderer must never present them as a fallback editor.
 */
export function isValueAuthoredSection(category: string): boolean {
	return (
		category.endsWith(".values") ||
		category.endsWith(".syntax") ||
		category === "values" ||
		category === "syntax"
	);
}
