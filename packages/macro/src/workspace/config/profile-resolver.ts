import type { UserMacroProfile } from "../../contracts/extension-config";
import type {
	FundamentalPattern,
	RangeComponent,
} from "../../values/fundamentals";
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

		if (
			key === "unitAliases" ||
			key === "operatorAliases" ||
			key === "statisticalAliases"
		) {
			result[key] = mergeRecords(
				baseVal,
				val as Record<string, readonly string[]>,
			);
		} else if (key === "excludePrefixes") {
			const bArr = Array.isArray(baseVal) ? baseVal : [];
			const dArr = Array.isArray(val) ? val : [];
			result[key] = Array.from(new Set([...bArr, ...dArr]));
		} else if (key === "values") {
			result[key] = mergeProfileValues(baseVal, val);
		} else if (
			key === "localization" ||
			key === "numberWords" ||
			key === "date" ||
			key === "dateTime" ||
			key === "relativeTemporal" ||
			key === "currency" ||
			key === "syntax"
		) {
			result[key] = mergeRecords(baseVal, val as Record<string, any>);
		} else {
			result[key] = val;
		}
	}

	return Object.freeze(result as UserMacroProfile);
}

function mergeProfileValues(
	base: unknown,
	override: unknown,
): Record<string, any> {
	const result =
		mergeRecords(
			base as Record<string, any> | undefined,
			override as Record<string, any> | undefined,
		) ?? {};
	for (const domain of ["quantity", "frequency"]) {
		const baseConfig = (base as Record<string, any> | undefined)?.[domain];
		const overrideConfig = (override as Record<string, any> | undefined)?.[
			domain
		];
		const components = mergeRangeComponents(
			baseConfig?.rangeComponents,
			overrideConfig?.rangeComponents,
		);
		if (components !== undefined) {
			result[domain] = {
				...(result[domain] ?? {}),
				rangeComponents: components,
			};
		}
	}
	return result;
}

function mergeRangeComponents(
	...sources: readonly (readonly RangeComponent[] | undefined)[]
): readonly RangeComponent[] | undefined {
	if (!sources.some((source) => source !== undefined)) return undefined;
	const components = new Map<string, RangeComponent>();
	for (const source of sources) {
		for (const component of source ?? []) {
			const existing = components.get(component.id);
			components.set(
				component.id,
				existing
					? {
							...existing,
							...(component.prefix !== undefined
								? { prefix: mergePatterns(existing.prefix, component.prefix) }
								: {}),
							connector: mergePatterns(existing.connector, component.connector),
							...(component.suffix !== undefined
								? { suffix: mergePatterns(existing.suffix, component.suffix) }
								: {}),
						}
					: component,
			);
		}
	}
	return [...components.values()];
}

function mergePatterns(
	base: readonly FundamentalPattern[] | undefined,
	override: readonly FundamentalPattern[],
): readonly FundamentalPattern[] {
	const patterns = new Map<string, FundamentalPattern>();
	for (const pattern of base ?? []) patterns.set(pattern.id, pattern);
	for (const pattern of override) patterns.set(pattern.id, pattern);
	return [...patterns.values()];
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
		throw new Error(
			`Circular profile inheritance detected for profile "${targetId}"`,
		);
	}
	visited.add(targetId);

	const loaded = await driver.loadProfile(targetId);

	if (!loaded) {
		if (targetId === "base") {
			return fallbackBase ?? { id: "base" };
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
