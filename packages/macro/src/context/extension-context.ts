import type { ExpressionBackend } from "../contracts/backends";
import type { ParseListener } from "../contracts/listeners";
import type { MacroSpec } from "../contracts/macro";
import type {
	DictionaryResource,
	DictionaryResourceFactory,
} from "../resources/contracts";
import type { ResourceScope } from "../resources/resource-scope";
import type { ExtensionDependencyResolver } from "./dependency-resolver";
import type { ExtensionConfig } from "../extensions/config";
import type { ExtensionSeedServices } from "../extensions/seed";

export interface MatcherFactory {
	expression(
		resource: DictionaryResource,
	): Extract<
		NonNullable<MacroSpec["arguments"][number]["matcher"]>,
		{ kind: "expression" }
	>;
	literal(
		text: string,
		value?: unknown,
	): { kind: "literal"; text: string; value?: unknown };
	pattern(
		pattern: string | RegExp,
		flags?: string,
	): { kind: "pattern"; pattern: string | RegExp; flags?: string };
}

export interface MacroRegistryWriter {
	register(spec: MacroSpec): void;
	define(spec: MacroSpec): void;
}

export interface ListenerRegistryWriter {
	register(listener: ParseListener): void;
	list(): readonly ParseListener[];
}

export interface ExtensionStorageServices {
	resolvePath(path: string): string;
}

export interface ExtensionLogger {
	debug(message: string, details?: unknown): void;
	info(message: string, details?: unknown): void;
	warn(message: string, details?: unknown): void;
	error(message: string, details?: unknown): void;
}

export interface ExtensionContext {
	extension: {
		id: string;
		version: string;
		rootDirectory: string;
	};
	config: ExtensionConfig;
	dictionaries: DictionaryResourceFactory;
	matchers: MatcherFactory;
	macros: MacroRegistryWriter;
	listeners: ListenerRegistryWriter;
	dependencies: ExtensionDependencyResolver;
	storage: ExtensionStorageServices;
	logger: ExtensionLogger;
	seed: ExtensionSeedServices;
}

export interface ContextInternals {
	readonly scope: ResourceScope;
	readonly backends: Readonly<Record<string, ExpressionBackend>>;
	readonly listeners: readonly ParseListener[];
}
