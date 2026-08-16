/**
 * Layered Configuration Resolver: Deep merges shipped immutable defaults with workspace overrides.
 */

export function deepMergeConfigs<T extends Record<string, unknown>>(
	defaults: T,
	overrides?: Record<string, unknown> | null,
): T {
	if (!overrides || typeof overrides !== "object") {
		return { ...defaults };
	}

	const result: Record<string, unknown> = { ...defaults };

	for (const key of Object.keys(overrides)) {
		const defaultVal = defaults[key];
		const overrideVal = overrides[key];

		if (
			defaultVal &&
			typeof defaultVal === "object" &&
			!Array.isArray(defaultVal) &&
			overrideVal &&
			typeof overrideVal === "object" &&
			!Array.isArray(overrideVal)
		) {
			result[key] = deepMergeConfigs(
				defaultVal as Record<string, unknown>,
				overrideVal as Record<string, unknown>,
			);
		} else if (overrideVal !== undefined) {
			result[key] = overrideVal;
		}
	}

	return result as T;
}

export interface ExtensionConfigResolverOptions {
	readonly extensionId: string;
	readonly shippedDefaults: Record<string, unknown>;
	readonly readWorkspaceConfig?: () =>
		| Promise<Record<string, unknown> | null>
		| Record<string, unknown>
		| null;
}

export class ExtensionConfigResolver {
	constructor(private readonly options: ExtensionConfigResolverOptions) {}

	async resolveEffectiveConfig<
		T extends Record<string, unknown>,
	>(): Promise<T> {
		const workspaceOverrides = this.options.readWorkspaceConfig
			? await this.options.readWorkspaceConfig()
			: null;

		return deepMergeConfigs(
			this.options.shippedDefaults,
			workspaceOverrides,
		) as T;
	}
}
