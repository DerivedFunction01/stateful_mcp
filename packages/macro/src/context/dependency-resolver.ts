import type { ActiveExtension } from "../extensions/contracts";

export interface ExtensionDependencyResolver {
	require(id: string): ActiveExtension;
	get(id: string): ActiveExtension | undefined;
}

export function createDependencyResolver(
	ownerExtensionId: string,
	dependencies: ReadonlyMap<string, ActiveExtension>,
	declared: readonly string[],
): ExtensionDependencyResolver {
	return {
		require(id: string): ActiveExtension {
			if (!declared.includes(id)) {
				throw new Error(
					`Extension '${ownerExtensionId}' has not declared dependency '${id}'`,
				);
			}
			const extension = dependencies.get(id);
			if (!extension) throw new Error(`Dependency '${id}' is not active`);
			return extension;
		},
		get(id: string): ActiveExtension | undefined {
			return declared.includes(id) ? dependencies.get(id) : undefined;
		},
	};
}
