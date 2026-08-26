import type { ExpressionBackend } from "../contracts/backends";
import type { MacroDefinitionAdapter } from "../contracts/composition";
import type { MacroRegistry, MacroSpec } from "../contracts/macro";
import type { ActiveExtension, MacroExtensionManifest } from "./contracts";

export interface RegisteredMacro extends MacroSpec {
	ownerExtensionId: string;
	canonicalId: string;
	aliases?: readonly string[];
}

export interface MacroResolutionResult {
	macro: RegisteredMacro;
	resolvedVia:
		| "canonicalId"
		| "primaryName"
		| "projectAlias"
		| "extensionAlias"
		| "qualifiedPrefix";
	collisionWarning?: string;
}

export interface MacroResolveOptions {
	projectAliases?: Readonly<Record<string, string>>;
	activeExtensionIds?: readonly string[];
}

export class MacroRegistryStore implements MacroRegistry {
	private readonly macros = new Map<string, RegisteredMacro>();
	private readonly macrosById = new Map<string, RegisteredMacro>();
	private readonly macrosByName = new Map<string, RegisteredMacro[]>();
	private readonly aliases = new Map<string, string>();
	private readonly backends = new Map<string, ExpressionBackend>();
	private readonly ownerBackends = new Map<
		string,
		Map<string, ExpressionBackend>
	>();

	register(
		spec: MacroSpec,
		ownerExtensionId: string,
		backends: Readonly<Record<string, ExpressionBackend>> = {},
		aliases: readonly string[] = [],
	): void {
		const canonicalId = spec.id || `@${ownerExtensionId}:${spec.name}`;
		const registered: RegisteredMacro = {
			...spec,
			id: spec.id || canonicalId,
			canonicalId,
			ownerExtensionId,
			aliases: [
				...((spec.metadata?.aliases as readonly string[]) ?? []),
				...aliases,
			],
		};

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

		this.macrosById.set(registered.id, registered);
		if (canonicalId !== registered.id) {
			this.macrosById.set(canonicalId, registered);
		}
		const qualifiedId = `@${ownerExtensionId}:${spec.name}`;
		if (qualifiedId !== registered.id && qualifiedId !== canonicalId) {
			this.macrosById.set(qualifiedId, registered);
		}
		this.macros.set(registered.id, registered);
		this.macros.set(spec.name, registered);

		const nameList = this.macrosByName.get(spec.name) ?? [];
		if (!nameList.some((m) => m.id === registered.id)) {
			nameList.push(registered);
			this.macrosByName.set(spec.name, nameList);
		}

		for (const alias of registered.aliases ?? []) {
			this.aliases.set(alias, registered.id);
			this.macros.set(alias, registered);
		}
	}

	resolve(
		triggerName: string,
		options: MacroResolveOptions = {},
	): MacroResolutionResult | undefined {
		// 1. Direct canonical match
		const byId = this.macrosById.get(triggerName);
		if (byId) {
			return { macro: byId, resolvedVia: "canonicalId" };
		}

		// 2. Qualified prefix match (e.g. "clinical:vitals" or "@clinical:vitals")
		if (triggerName.includes(":")) {
			const parts = triggerName.split(":");
			const prefix = parts[0]!.replace(/^@/, "");
			const targetName = parts[1]!;
			for (const m of this.macrosById.values()) {
				if (
					(m.ownerExtensionId === prefix ||
						m.ownerExtensionId.endsWith(prefix)) &&
					(m.name === targetName || m.aliases?.includes(targetName))
				) {
					return { macro: m, resolvedVia: "qualifiedPrefix" };
				}
			}
		}

		// 3. Project alias match (from .macro/project.json)
		if (options.projectAliases && options.projectAliases[triggerName]) {
			const target = options.projectAliases[triggerName]!;
			const targetMacro =
				this.macrosById.get(target) ?? this.macros.get(target);
			if (targetMacro) {
				return { macro: targetMacro, resolvedVia: "projectAlias" };
			}
		}

		// 4. Extension alias match
		const aliasTargetId = this.aliases.get(triggerName);
		if (aliasTargetId) {
			const targetMacro = this.macrosById.get(aliasTargetId);
			if (targetMacro) {
				return { macro: targetMacro, resolvedVia: "extensionAlias" };
			}
		}

		// 5. Name match with collision detection
		const byName = this.macrosByName.get(triggerName);
		if (byName && byName.length > 0) {
			if (byName.length === 1) {
				return { macro: byName[0]!, resolvedVia: "primaryName" };
			}

			// Multiple macros share this name (cross-extension collision)
			if (options.activeExtensionIds && options.activeExtensionIds.length > 0) {
				const activeMatch = byName.find((m) =>
					options.activeExtensionIds!.includes(m.ownerExtensionId),
				);
				if (activeMatch) {
					return {
						macro: activeMatch,
						resolvedVia: "primaryName",
						collisionWarning: `Multiple extensions define macro '${triggerName}'. Resolved to active extension '${activeMatch.ownerExtensionId}'.`,
					};
				}
			}

			return {
				macro: byName[0]!,
				resolvedVia: "primaryName",
				collisionWarning: `Ambiguous macro '${triggerName}' provided by multiple extensions (${byName.map((m) => m.ownerExtensionId).join(", ")}). Use qualified prefix or project alias.`,
			};
		}

		return undefined;
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
		for (const [id, macro] of this.macrosById) {
			if (macro.ownerExtensionId === ownerExtensionId)
				this.macrosById.delete(id);
		}
		for (const [name, list] of this.macrosByName) {
			const filtered = list.filter(
				(m) => m.ownerExtensionId !== ownerExtensionId,
			);
			if (filtered.length === 0) {
				this.macrosByName.delete(name);
			} else {
				this.macrosByName.set(name, filtered);
			}
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
		// Unique by canonical ID
		const seen = new Set<string>();
		const result: MacroSpec[] = [];
		for (const macro of this.macrosById.values()) {
			if (!seen.has(macro.id)) {
				seen.add(macro.id);
				result.push(macro);
			}
		}
		return result.sort((left, right) => left.name.localeCompare(right.name));
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
	return [];
}

export type { MacroExtensionManifest };
