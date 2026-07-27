import type { ParsedItem } from "../../../../parser/schema-parsers.v2";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenObject(
	obj: Record<string, unknown>,
	prefix = "",
	result: Record<string, unknown> = {},
): Record<string, unknown> {
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		const path = prefix ? `${prefix}.${key}` : key;

		if (isPlainObject(value)) {
			flattenObject(value, path, result);
		} else if (value !== undefined && value !== null) {
			result[path] = value;
		}
	}

	return result;
}

export function flattenParsedItem(parsedItem: ParsedItem): Record<string, any> {
	const flat: Record<string, any> = {};

	const firstConcept = parsedItem.concept[0];
	if (firstConcept) {
		flat.conceptId = firstConcept.conceptId;
		flat.conceptDisplay = firstConcept.display;
	}

	const data = parsedItem.extractedData as Record<string, unknown> | undefined;
	if (data) {
		const flattenedData = flattenObject(data);
		Object.assign(flat, flattenedData);
	}

	return flat;
}
