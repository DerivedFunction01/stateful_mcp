export interface DefaultResolutionContext {
	rawText?: string;
	parsedPartial?: Record<string, any>;
	profile?: {
		schemaDefaults?: Record<string, Record<string, any>>;
		defaultsStrategy?: string;
	};
}

export interface DefaultResolutionStrategy {
	resolveDefault<T>(
		schemaName: string,
		fieldName: string,
		context?: DefaultResolutionContext,
	): T | undefined;
}

export class StaticSchemaDefaultsStrategy implements DefaultResolutionStrategy {
	resolveDefault<T>(
		schemaName: string,
		fieldName: string,
		context?: DefaultResolutionContext,
	): T | undefined {
		const profile = (context as any)?.profile;
		const schemaDefaults = profile?.schemaDefaults?.[schemaName];
		if (!schemaDefaults) return undefined;
		return schemaDefaults[fieldName] as T | undefined;
	}
}

export class DefaultResolutionRegistry {
	private static strategies = new Map<string, DefaultResolutionStrategy>();

	static register(name: string, strategy: DefaultResolutionStrategy): void {
		DefaultResolutionRegistry.strategies.set(name, strategy);
	}

	static get(name?: string): DefaultResolutionStrategy | undefined {
		if (!name) return undefined;
		return DefaultResolutionRegistry.strategies.get(name);
	}
}

export function registerDefaultResolutionStrategy(
	name: string,
	strategy: DefaultResolutionStrategy,
): void {
	DefaultResolutionRegistry.register(name, strategy);
}

export function resolveSchemaDefault<T>(
	schemaName: string,
	fieldName: string,
	profile:
		| {
				schemaDefaults?: Record<string, Record<string, any>>;
				defaultsStrategy?: string;
		  }
		| undefined,
	context?: DefaultResolutionContext,
): T | undefined {
	const strategyName = profile?.defaultsStrategy;
	const dynamicStrategy = strategyName
		? DefaultResolutionRegistry.get(strategyName)
		: undefined;
	if (dynamicStrategy) {
		const resolved = dynamicStrategy.resolveDefault<T>(schemaName, fieldName, {
			...context,
			profile,
			parsedPartial: {
				...(context?.parsedPartial || {}),
				profile,
			},
		});
		if (resolved !== undefined) return resolved;
	}

	const staticStrategy = new StaticSchemaDefaultsStrategy();
	const profileDefault = staticStrategy.resolveDefault<T>(
		schemaName,
		fieldName,
		{
			...context,
			profile,
			parsedPartial: {
				...(context?.parsedPartial || {}),
				profile,
			},
		},
	);
	if (profileDefault !== undefined) return profileDefault;

	return undefined;
}

registerDefaultResolutionStrategy(
	"StaticSchemaDefaults",
	new StaticSchemaDefaultsStrategy(),
);
