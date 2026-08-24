import type { ResourceProvider, ResourceProviderContribution } from "./types";

export interface RegisteredResourceProvider
	extends ResourceProviderContribution {
	readonly extensionId: string;
	readonly provider: ResourceProvider;
}

export class ResourceRegistry {
	private readonly providers = new Map<string, RegisteredResourceProvider>();

	register(
		contribution: ResourceProviderContribution,
		provider: ResourceProvider,
		extensionId: string,
	): void {
		if (this.providers.has(contribution.kind))
			throw new Error(
				`Duplicate resource provider kind '${contribution.kind}'`,
			);
		this.providers.set(contribution.kind, {
			...contribution,
			provider,
			extensionId,
		});
	}

	unregister(kind: string): boolean {
		return this.providers.delete(kind);
	}

	get(kind: string): RegisteredResourceProvider | undefined {
		return this.providers.get(kind);
	}

	list(): readonly RegisteredResourceProvider[] {
		return [...this.providers.values()].sort(
			(a, b) =>
				(a.order ?? 100) - (b.order ?? 100) || a.kind.localeCompare(b.kind),
		);
	}

	project(
		references: readonly import("../../project/contracts").MacroProjectResourceReference[],
	): readonly {
		readonly provider: RegisteredResourceProvider;
		readonly items: readonly {
			readonly resourceId: string;
			readonly label: string;
			readonly metadata?: Readonly<Record<string, unknown>>;
		}[];
	}[] {
		return this.list().flatMap((provider) => {
			const result = provider.provider.listProjectResources?.({ references });
			if (!result || result instanceof Promise) return [];
			return [{ provider, items: result }];
		});
	}
}
