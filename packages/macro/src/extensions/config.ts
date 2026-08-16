export type ExtensionConfig = Readonly<Record<string, unknown>>;

export function resolveExtensionConfig(
	defaults: Readonly<Record<string, unknown>> | undefined,
	overrides: Readonly<Record<string, unknown>> | undefined,
): ExtensionConfig {
	return deepFreeze(
		mergeRecords(defaults ?? {}, overrides ?? {}),
	) as ExtensionConfig;
}

function mergeRecords(
	defaults: Readonly<Record<string, unknown>>,
	overrides: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(defaults)) {
		result[key] = cloneValue(value);
	}
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) continue;
		const defaultValue = defaults[key];
		if (isRecord(defaultValue) && isRecord(value)) {
			result[key] = mergeRecords(defaultValue, value);
		} else {
			result[key] = cloneValue(value);
		}
	}
	return result;
}

function cloneValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(cloneValue);
	if (isRecord(value)) return mergeRecords(value, {});
	return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return Boolean(
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype,
	);
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object") return value;
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) {
		if (child && typeof child === "object" && !Object.isFrozen(child)) {
			deepFreeze(child);
		}
	}
	return value;
}
