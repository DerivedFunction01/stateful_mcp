import { normalizeUnicodeDigits } from "../localization";

export function tokenizeNumericInput(rawText: string): string {
	return normalizeUnicodeDigits(rawText).replace(/[\u2044\u2215]/g, "/");
}
