export function serializeVariableValue(value: unknown): string {
	if (value === undefined) return "undefined";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean" || value === null)
		return JSON.stringify(value);
	try {
		return JSON.stringify(sortValue(value)) ?? String(value);
	} catch {
		return String(value);
	}
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, sortValue(entry)]),
		);
	}
	return value;
}
