import type { UserMacroProfile } from "../../contracts/extension-config";
import type { SettingsStorageDriver } from "./storage-driver";

/**
 * Deeply merges two records by key, unioning array values if both are arrays.
 */
function mergeRecords<T extends Record<string, any>>(
	base?: Readonly<T>,
	override?: Readonly<T>,
): T | undefined {
	if (!base && !override) return undefined;
	if (!base) return override ? { ...override } : undefined;
	if (!override) return { ...base };

	const result: Record<string, any> = { ...base };

	for (const [key, val] of Object.entries(override)) {
		if (val === undefined) continue;

		const baseVal = result[key];
		if (Array.isArray(baseVal) && Array.isArray(val)) {
			// Union arrays deduplicating elements
			result[key] = Array.from(new Set([...baseVal, ...val]));
		} else if (
			baseVal &&
			typeof baseVal === "object" &&
			!Array.isArray(baseVal) &&
			val &&
			typeof val === "object" &&
			!Array.isArray(val)
		) {
			result[key] = mergeRecords(baseVal, val);
		} else {
			result[key] = val;
		}
	}

	return result as T;
}

/**
 * Merges a derived partial profile onto a parent base profile according to the taxonomy:
 * - Arrays & Maps are unioned/appended (additive vocabulary).
 * - Scalars & Policies are overridden.
 */
export function mergeProfile(
	base: UserMacroProfile,
	derived: Partial<UserMacroProfile>,
): UserMacroProfile {
	const result: Record<string, any> = { ...base };

	for (const [key, val] of Object.entries(derived)) {
		if (val === undefined) continue;

		const baseVal = result[key];

		if (key === "unitAliases" || key === "operatorAliases" || key === "statisticalAliases") {
			result[key] = mergeRecords(baseVal, val as Record<string, readonly string[]>);
		} else if (key === "rangeDelimiters" || key === "excludePrefixes") {
			const bArr = Array.isArray(baseVal) ? baseVal : [];
			const dArr = Array.isArray(val) ? val : [];
			result[key] = Array.from(new Set([...bArr, ...dArr]));
		} else if (key === "localization" || key === "numberWords" || key === "date" || key === "dateTime" || key === "relativeTemporal" || key === "currency" || key === "syntax") {
			result[key] = mergeRecords(baseVal, val as Record<string, any>);
		} else {
			result[key] = val;
		}
	}

	return Object.freeze(result as UserMacroProfile);
}

/**
 * Resolves a profile by ID traversing the `extends` chain using the provided storage driver.
 */
export async function resolveProfile(
	targetId: string,
	driver: SettingsStorageDriver,
	fallbackBase?: UserMacroProfile,
	visited: Set<string> = new Set(),
): Promise<UserMacroProfile> {
	if (visited.has(targetId)) {
		throw new Error(`Circular profile inheritance detected for profile "${targetId}"`);
	}
	visited.add(targetId);

	const loaded = await driver.loadProfile(targetId);

	if (!loaded) {
		if (targetId === "base" && fallbackBase) {
			return fallbackBase;
		}
		if (fallbackBase) {
			return fallbackBase;
		}
		throw new Error(`Profile "${targetId}" not found in storage driver`);
	}

	const extendsId = (loaded as any).extends;
	if (!extendsId || extendsId === targetId) {
		return Object.freeze(loaded);
	}

	const parentProfile = await resolveProfile(
		extendsId,
		driver,
		fallbackBase,
		visited,
	);

	return mergeProfile(parentProfile, loaded);
}

/**
 * Computes a sparse delta of `derived` compared against `base`.
 * Only properties that differ from base are included in the returned delta.
 */
export function computeSparseDelta(
	derived: UserMacroProfile,
	base: UserMacroProfile,
): Partial<UserMacroProfile> {
	const delta: Record<string, any> = {};

	for (const [key, val] of Object.entries(derived)) {
		if (key === "id") continue;
		const baseVal = (base as Record<string, any>)[key];

		if (baseVal === undefined) {
			delta[key] = val;
			continue;
		}

		if (JSON.stringify(val) !== JSON.stringify(baseVal)) {
			delta[key] = val;
		}
	}

	return delta as Partial<UserMacroProfile>;
}
