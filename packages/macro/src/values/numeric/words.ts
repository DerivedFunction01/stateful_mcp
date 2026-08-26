export function isNegativeNumericPrefix(text: string): boolean {
	return text.startsWith("-") || text.startsWith("−") || text.startsWith("–");
}
