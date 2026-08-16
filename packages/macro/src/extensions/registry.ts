import type { ExpressionBackend } from "../contracts/backends";
import type { MacroDefinitionAdapter } from "../contracts/composition";
import type { MacroRegistry, MacroSpec } from "../contracts/macro";
import type { ActiveExtension, MacroExtensionManifest } from "./contracts";

export interface RegisteredMacro extends MacroSpec {
	ownerExtensionId: string;
}

export class MacroRegistryStore implements MacroRegistry {
	private readonly macros = new Map<string, RegisteredMacro>();
	private readonly backends = new Map<string, ExpressionBackend>();
	private readonly ownerBackends = new Map<
		string,
		Map<string, ExpressionBackend>
	>();

	register(
		spec: MacroSpec,
		ownerExtensionId: string,
		backends: Readonly<Record<string, ExpressionBackend>> = {},
	): void {
		if (this.macros.has(spec.name))
			throw new Error(`Macro '${spec.name}' is already registered`);
		for (const backendId of referencedBackends(spec)) {
			if (!backends[backendId] && !this.backends.has(backendId)) {
				throw new Error(`Expression backend '${backendId}' is not available`);
			}
		}
		let ownerMap = this.ownerBackends.get(ownerExtensionId);
		if (!ownerMap) {
			ownerMap = new Map();
			this.ownerBackends.set(ownerExtensionId, ownerMap);
		}
		for (const [id, backend] of Object.entries(backends)) {
			if (!backend.ownerExtensionId) {
				backend.ownerExtensionId = ownerExtensionId;
			}
			if (!backend.resourceId) {
				backend.resourceId = id;
			}
			this.backends.set(id, backend);
			ownerMap.set(id, backend);
		}
		this.macros.set(spec.name, { ...spec, ownerExtensionId });
	}

	registerBackend(
		id: string,
		backend: ExpressionBackend,
		ownerExtensionId: string,
	): void {
		let ownerMap = this.ownerBackends.get(ownerExtensionId);
		if (!ownerMap) {
			ownerMap = new Map();
			this.ownerBackends.set(ownerExtensionId, ownerMap);
		}
		if (!backend.ownerExtensionId) {
			backend.ownerExtensionId = ownerExtensionId;
		}
		if (!backend.resourceId) {
			backend.resourceId = id;
		}
		this.backends.set(id, backend);
		ownerMap.set(id, backend);
	}

	unregisterOwner(ownerExtensionId: string): void {
		for (const [name, macro] of this.macros) {
			if (macro.ownerExtensionId === ownerExtensionId) this.macros.delete(name);
		}
		this.ownerBackends.delete(ownerExtensionId);
		this.backends.clear();
		for (const ownerMap of this.ownerBackends.values()) {
			for (const [id, backend] of ownerMap) {
				this.backends.set(id, backend);
			}
		}
	}

	get(name: string): MacroSpec | undefined {
		return this.macros.get(name);
	}

	getRegistered(name: string): RegisteredMacro | undefined {
		return this.macros.get(name);
	}

	list(): readonly MacroSpec[] {
		return [...this.macros.values()].sort((left, right) =>
			left.name.localeCompare(right.name),
		);
	}

	getBackend(id: string): ExpressionBackend | undefined {
		return this.backends.get(id);
	}

	backendsRecord(): Readonly<Record<string, ExpressionBackend>> {
		return Object.fromEntries(this.backends);
	}

	getBackendsForOwner(
		ownerExtensionId: string,
		dependencyIds: readonly string[] = [],
	): Readonly<Record<string, ExpressionBackend>> {
		const result: Record<string, ExpressionBackend> = {};
		const allowed = new Set([ownerExtensionId, ...dependencyIds]);
		for (const id of allowed) {
			const ownerMap = this.ownerBackends.get(id);
			if (ownerMap) {
				for (const [backendId, backend] of ownerMap) {
					result[backendId] = backend;
				}
			}
		}
		return result;
	}
}

export interface RegisteredAdapter {
	adapter: MacroDefinitionAdapter;
	ownerExtensionId: string;
}

export class AdapterRegistry {
	private readonly adapters = new Map<string, RegisteredAdapter>();

	register(adapter: MacroDefinitionAdapter, ownerExtensionId: string): void {
		const id = adapter.definition.id;
		if (!id) throw new Error("An adapter requires a definition ID");
		if (this.adapters.has(id))
			throw new Error(`Adapter '${id}' is already registered`);
		this.adapters.set(id, { adapter, ownerExtensionId });
	}

	get(id: string): RegisteredAdapter | undefined {
		return this.adapters.get(id);
	}

	list(): readonly RegisteredAdapter[] {
		return [...this.adapters.values()].sort((left, right) =>
			left.adapter.definition.id.localeCompare(right.adapter.definition.id),
		);
	}

	unregisterOwner(ownerExtensionId: string): void {
		for (const [id, registered] of this.adapters) {
			if (registered.ownerExtensionId === ownerExtensionId)
				this.adapters.delete(id);
		}
	}
}

export class ExtensionRegistry {
	private readonly active = new Map<string, ActiveExtension>();

	get(id: string): ActiveExtension | undefined {
		return this.active.get(id);
	}

	list(): readonly ActiveExtension[] {
		return [...this.active.values()].sort((left, right) =>
			left.manifest.id.localeCompare(right.manifest.id),
		);
	}

	set(extension: ActiveExtension): void {
		this.active.set(extension.manifest.id, extension);
	}

	delete(id: string): void {
		this.active.delete(id);
	}

	clear(): void {
		this.active.clear();
	}
}

function referencedBackends(spec: MacroSpec): string[] {
	return spec.arguments.flatMap((argument) => {
		const matchers = argument.matcher
			? Array.isArray(argument.matcher)
				? argument.matcher
				: [argument.matcher]
			: [];
		return matchers.flatMap((matcher) =>
			matcher.kind === "expression" ? [matcher.backendId] : [],
		);
	});
}

export type { MacroExtensionManifest };
