import type { ParsedItem } from "../../../../parser/schema-parsers";

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

		if (Array.isArray(value)) {
			if (value.length === 0) continue;

			const first = value[0];
			if (isPlainObject(first) && value.every((item) => isPlainObject(item))) {
				const keySets = value
					.map((item) =>
						Object.keys(item as Record<string, unknown>)
							.sort()
							.join(","),
					)
					.filter((kset) => kset.length > 0);

				if (
					keySets.length > 0 &&
					keySets.every((kset) => kset === keySets[0])
				) {
					const subObj: Record<string, unknown[]> = {};
					for (const item of value) {
						if (item && typeof item === "object") {
							const record = item as Record<string, unknown>;

							for (const subKey of Object.keys(record)) {
								if (!subObj[subKey]) {
									subObj[subKey] = [];
								}
								const targetArray = subObj[subKey];
								targetArray.push(record[subKey]);
							}
						}
					}
					for (const [subKey, subValue] of Object.entries(subObj)) {
						const subPath = `${path}.${subKey}`;
						if (isPlainObject(subValue)) {
							flattenObject(
								subValue as Record<string, unknown>,
								subPath,
								result,
							);
						} else if (subValue !== undefined && subValue !== null) {
							result[subPath] = subValue;
						}
					}
					continue;
				}
			}

			result[path] = value;
		} else if (isPlainObject(value)) {
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
