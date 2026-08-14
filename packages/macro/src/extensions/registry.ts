import type { ExpressionBackend } from "../contracts/backends";
import type { MacroRegistry, MacroSpec } from "../contracts/macro";
import type { ActiveExtension, MacroExtensionManifest } from "./contracts";

export interface RegisteredMacro extends MacroSpec {
	ownerExtensionId: string;
}

export class MacroRegistryStore implements MacroRegistry {
	private readonly macros = new Map<string, RegisteredMacro>();
	private readonly backends = new Map<string, ExpressionBackend>();

	register(spec: MacroSpec, ownerExtensionId: string, backends: Readonly<Record<string, ExpressionBackend>> = {}): void {
		if (this.macros.has(spec.name)) throw new Error(`Macro '${spec.name}' is already registered`);
		for (const backendId of referencedBackends(spec)) {
			if (!backends[backendId] && !this.backends.has(backendId)) {
				throw new Error(`Expression backend '${backendId}' is not available`);
			}
		}
		for (const [id, backend] of Object.entries(backends)) this.backends.set(id, backend);
		this.macros.set(spec.name, { ...spec, ownerExtensionId });
	}

	unregisterOwner(ownerExtensionId: string): void {
		for (const [name, macro] of this.macros) {
			if (macro.ownerExtensionId === ownerExtensionId) this.macros.delete(name);
		}
		const ownedBackendIds = new Set<string>();
		for (const macro of this.macros.values()) {
			for (const id of referencedBackends(macro)) ownedBackendIds.add(id);
		}
		for (const id of this.backends.keys()) if (!ownedBackendIds.has(id)) this.backends.delete(id);
	}

	get(name: string): MacroSpec | undefined {
		return this.macros.get(name);
	}

	list(): readonly MacroSpec[] {
		return [...this.macros.values()].sort((left, right) => left.name.localeCompare(right.name));
	}

	getBackend(id: string): ExpressionBackend | undefined {
		return this.backends.get(id);
	}

	backendsRecord(): Readonly<Record<string, ExpressionBackend>> {
		return Object.fromEntries(this.backends);
	}
}

export class ExtensionRegistry {
	private readonly active = new Map<string, ActiveExtension>();

	get(id: string): ActiveExtension | undefined {
		return this.active.get(id);
	}

	list(): readonly ActiveExtension[] {
		return [...this.active.values()].sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
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
		const matchers = argument.matcher ? (Array.isArray(argument.matcher) ? argument.matcher : [argument.matcher]) : [];
		return matchers.flatMap((matcher) => matcher.kind === "expression" ? [matcher.backendId] : []);
	});
}

export type { MacroExtensionManifest };
