import { dirname, join, resolve } from "node:path";
import type { ExpressionBackend } from "../contracts/backends";
import type { ParseListener } from "../contracts/listeners";
import type { MacroParseOptions, MacroSpec } from "../contracts/macro";
import { parseMacroLine, type ParseMacroLineResult } from "../parser/macro-parser";
import { createDependencyResolver } from "../context/dependency-resolver";
import type {
	ExtensionContext,
	ExtensionLogger,
	ExtensionStorageServices,
	ListenerRegistryWriter,
	MacroRegistryWriter,
	MatcherFactory,
} from "../context/extension-context";
import { createDictionaryResourceFactory } from "../resources/dictionary-resource";
import { ResourceScope } from "../resources/resource-scope";
import { ExtensionLoader } from "./loader";
import { extensionDiagnostic, ExtensionError, type ExtensionDiagnostic } from "./errors";
import type { ActiveExtension, LoadedExtension, MacroExtension } from "./contracts";
import { ExtensionRegistry, MacroRegistryStore } from "./registry";

export interface ExtensionRuntimeOptions {
	rootDirectory?: string;
	logger?: ExtensionLogger;
}

export interface ActivationResult {
	active: readonly ActiveExtension[];
	diagnostics: readonly ExtensionDiagnostic[];
}

export class ExtensionRuntime {
	readonly extensions = new ExtensionRegistry();
	readonly macros = new MacroRegistryStore();
	private readonly contexts = new Map<string, ExtensionContext>();
	private readonly listeners = new Map<string, ParseListener[]>();
	readonly options: Required<Pick<ExtensionRuntimeOptions, "rootDirectory">> & { logger: ExtensionLogger };
	private loaded: LoadedExtension[] = [];

	constructor(options: ExtensionRuntimeOptions = {}) {
		this.options = {
			rootDirectory: options.rootDirectory ?? process.cwd(),
			logger: options.logger ?? consoleLogger,
		};
	}

	async load(directory: string): Promise<readonly LoadedExtension[]> {
		this.loaded = await new ExtensionLoader({ directory }).importFiles();
		validateManifests(this.loaded);
		return this.loaded;
	}

	async activate(loaded: readonly LoadedExtension[] = this.loaded): Promise<ActivationResult> {
		validateManifests(loaded);
		const diagnostics: ExtensionDiagnostic[] = [];
		const byId = new Map(loaded.map((item) => [item.extension.manifest.id, item]));
		for (const item of loaded) {
			if (this.extensions.get(item.extension.manifest.id)) await this.dispose(item.extension.manifest.id);
		}
		const order = topologicalOrder(loaded);
		for (const id of order) {
			const item = byId.get(id)!;
			const manifest = item.extension.manifest;
			const missing = (manifest.requires ?? []).filter((dependency) => !this.extensions.get(dependency));
			if (missing.length) {
				const diagnostic = {
					code: "EXTENSION_DEPENDENCY_UNAVAILABLE",
					message: `Extension '${id}' cannot activate because dependencies are unavailable: ${missing.join(", ")}`,
					extensionId: id,
					sourceFile: item.sourceFile,
				};
				diagnostics.push(diagnostic);
				continue;
			}
			try {
				await this.activateOne(item);
			} catch (error) {
				const diagnostic = extensionDiagnostic(error, { extensionId: id, sourceFile: item.sourceFile });
				diagnostics.push(diagnostic);
				this.options.logger.error(diagnostic.message, diagnostic);
			}
		}
		return { active: this.extensions.list(), diagnostics };
	}

	async activateOne(item: LoadedExtension): Promise<ActiveExtension> {
		const { extension, sourceFile } = item;
		const manifest = extension.manifest;
		const scope = new ResourceScope(manifest.id);
		const registeredMacros: string[] = [];
		const localListeners: ParseListener[] = [];
		const backendRecord = (): Readonly<Record<string, ExpressionBackend>> => scope.listBackends();
		const macroWriter: MacroRegistryWriter = {
			register: (spec: MacroSpec) => {
				this.macros.register(spec, manifest.id, backendRecord());
				registeredMacros.push(spec.name);
			},
			define: (spec: MacroSpec) => macroWriter.register(spec),
		};
		const listenerWriter: ListenerRegistryWriter = {
			register: (listener: ParseListener) => {
				if (localListeners.some((item) => item.id === listener.id)) throw new Error(`Listener '${listener.id}' is already registered`);
				localListeners.push(listener);
			},
			list: () => [...localListeners],
		};
		const matcherFactory: MatcherFactory = {
			expression: (resource) => {
				const backendId = resource.id;
				scope.registerBackend(backendId, resource.expressionBackend());
				return { kind: "expression", backendId };
			},
			literal: (text, value) => ({ kind: "literal", text, ...(value === undefined ? {} : { value }) }),
			pattern: (pattern, flags) => ({ kind: "pattern", pattern, ...(flags === undefined ? {} : { flags }) }),
		};
		const context = createContext(
			manifest,
			sourceFile,
			scope,
			macroWriter,
			listenerWriter,
			matcherFactory,
			this.extensions,
			this.options,
		);
		try {
			const activation = await extension.activate(context);
			const active: ActiveExtension = {
				manifest,
				sourceFile,
				exports: activation?.exports ?? {},
				dispose: async () => {
					try {
						await activation?.dispose?.();
					} finally {
						this.macros.unregisterOwner(manifest.id);
						this.listeners.delete(manifest.id);
						this.contexts.delete(manifest.id);
						await scope.close();
					}
				},
			};
			this.listeners.set(manifest.id, localListeners);
			this.contexts.set(manifest.id, context);
			this.extensions.set(active);
			return active;
		} catch (error) {
			this.macros.unregisterOwner(manifest.id);
			this.listeners.delete(manifest.id);
			await scope.close();
			throw new ExtensionError(
				`Activation failed for extension '${manifest.id}' from '${sourceFile}': ${error instanceof Error ? error.message : String(error)}`,
				"EXTENSION_ACTIVATION_FAILED",
				manifest.id,
				sourceFile,
				error,
			);
		}
	}

	async dispose(id?: string): Promise<void> {
		if (id) {
			const active = this.extensions.get(id);
			if (active) {
				await active.dispose();
				this.extensions.delete(id);
			}
			return;
		}
		for (const active of [...this.extensions.list()].reverse()) await this.dispose(active.manifest.id);
	}

	async reload(item: LoadedExtension): Promise<ActivationResult> {
		await this.dispose(item.extension.manifest.id);
		return this.activate([item]);
	}

	getListeners(): readonly ParseListener[] {
		return [...this.listeners.values()].flat();
	}

	parse(raw: string, macroName?: string, options: Omit<MacroParseOptions, "backends"> = {}): ParseMacroLineResult | null {
		const spec = macroName ? this.macros.get(macroName) : this.macros.list().find((candidate) => raw.includes(candidate.name));
		if (!spec) return null;
		return parseMacroLine(raw, spec, { ...options, backends: this.macros.backendsRecord() });
	}
}

export async function loadAndActivateExtensions(
	directory: string,
	options: ExtensionRuntimeOptions = {},
): Promise<{ runtime: ExtensionRuntime; result: ActivationResult }> {
	const runtime = new ExtensionRuntime(options);
	await runtime.load(directory);
	return { runtime, result: await runtime.activate() };
}

function createContext(
	manifest: MacroExtension["manifest"],
	sourceFile: string,
	scope: ResourceScope,
	macros: MacroRegistryWriter,
	listeners: ListenerRegistryWriter,
	matchers: MatcherFactory,
	registry: ExtensionRegistry,
	options: ExtensionRuntime["options"],
): ExtensionContext {
	const rootDirectory = options.rootDirectory;
	const extensionRoot = dirname(resolve(sourceFile));
	return {
		extension: { id: manifest.id, version: manifest.version, rootDirectory: extensionRoot },
			dictionaries: {
			open: async (resourceOptions = {}) => scope.trackResource(await createDictionaryResourceFactory(manifest.id).open(resourceOptions)),
			memory: async (resourceOptions = {}) => scope.trackResource(await createDictionaryResourceFactory(manifest.id).memory(resourceOptions)),
			jsonl: async (path, resourceOptions = {}) => scope.trackResource(await createDictionaryResourceFactory(manifest.id).jsonl(resolvePath(rootDirectory, sourceFile, path), resourceOptions)),
		},
		matchers,
		macros,
		listeners,
		dependencies: createDependencyResolver(manifest.id, new Map(registry.list().map((item) => [item.manifest.id, item])), manifest.requires ?? []),
		storage: { resolvePath: (path) => resolvePath(rootDirectory, sourceFile, path) },
		logger: options.logger,
	};
}

function resolvePath(rootDirectory: string, sourceFile: string, path: string): string {
	if (path.startsWith("/")) return resolve(path);
	return resolve(join(dirname(resolve(sourceFile)), path || rootDirectory));
}

function validateManifests(loaded: readonly LoadedExtension[]): void {
	const ids = new Set<string>();
	for (const item of loaded) {
		const id = item.extension.manifest.id;
		if (ids.has(id)) throw new ExtensionError(`Duplicate extension ID '${id}'`, "DUPLICATE_EXTENSION_ID", id, item.sourceFile);
		ids.add(id);
	}
	for (const item of loaded) {
		for (const dependency of item.extension.manifest.requires ?? []) {
			if (!ids.has(dependency)) throw new ExtensionError(`Extension '${item.extension.manifest.id}' requires missing dependency '${dependency}'`, "MISSING_EXTENSION_DEPENDENCY", item.extension.manifest.id, item.sourceFile);
		}
	}
	topologicalOrder(loaded);
}

function topologicalOrder(loaded: readonly LoadedExtension[]): string[] {
	const byId = new Map(loaded.map((item) => [item.extension.manifest.id, item.extension]));
	const state = new Map<string, "visiting" | "visited">();
	const result: string[] = [];
	const visit = (id: string): void => {
		if (state.get(id) === "visited") return;
		if (state.get(id) === "visiting") throw new ExtensionError(`Extension dependency cycle includes '${id}'`, "EXTENSION_DEPENDENCY_CYCLE", id);
		state.set(id, "visiting");
		for (const dependency of [...(byId.get(id)?.manifest.requires ?? [])].sort()) visit(dependency);
		state.set(id, "visited");
		result.push(id);
	};
	for (const id of [...byId.keys()].sort()) visit(id);
	return result;
}

const consoleLogger: ExtensionLogger = {
	debug: (message, details) => console.debug(message, details),
	info: (message, details) => console.info(message, details),
	warn: (message, details) => console.warn(message, details),
	error: (message, details) => console.error(message, details),
};
