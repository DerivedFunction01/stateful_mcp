export function cleanNumericText(
	text: string,
	thousandsSeparator: string | undefined,
	decimalPoint: string,
): string {
	let cleanText = text;
	if (thousandsSeparator) {
		cleanText = cleanText.split(thousandsSeparator).join("");
	} else if (decimalPoint !== ",") {
		cleanText = cleanText.replace(/,/g, "");
	}
	if (decimalPoint !== ".") {
		cleanText = cleanText.replace(decimalPoint, ".");
	}
	return cleanText;
}
