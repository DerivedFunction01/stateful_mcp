import type { ExpressionBackend } from "../contracts/backends";
import type { ParseListener } from "../contracts/listeners";
import type { MacroSpec } from "../contracts/macro";
import type { ExtensionConfig } from "../extensions/config";
import type { ExtensionSeedServices } from "../extensions/seed";
import type { DictionaryResourceFactory } from "../resources/contracts";
import type { ResourceScope } from "../resources/resource-scope";
import type { RecipeOutputBuilder, TerminalParser } from "../values/recipes";
import type { ExtensionDependencyResolver } from "./dependency-resolver";

export interface MacroRegistryWriter {
	register(spec: MacroSpec): void;
	define(spec: MacroSpec): void;
}

export interface ListenerRegistryWriter {
	register(listener: ParseListener): void;
	list(): readonly ParseListener[];
}

export interface ValueRegistryWriter {
	registerTerminal(id: string, parser: TerminalParser): void;
	registerOutputBuilder(id: string, builder: RecipeOutputBuilder): void;
	listTerminals(): Readonly<Record<string, TerminalParser>>;
	listOutputBuilders(): Readonly<Record<string, RecipeOutputBuilder>>;
}

export interface ExtensionStorageServices {
	readonly extensionId?: string;
	resolvePath(
		scope: "project" | "global" | "content" | "cache",
		path: string,
	): string;
	requestScope(scope: "project" | "global" | "content" | "cache"): void;
}

export interface ExtensionLogger {
	debug(message: string, details?: unknown): void;
	info(message: string, details?: unknown): void;
	warn(message: string, details?: unknown): void;
	error(message: string, details?: unknown): void;
}

import type {
	CompiledDomainGrammar,
	ExtensionDomainConfig,
	UserMacroProfile,
} from "../contracts/extension-config";

export interface ExtensionI18nWriter {
	registerTranslations(
		languageId: string,
		dictionary: Record<string, string>,
	): void;
	t(key: string, params?: Record<string, unknown>): string;
	getActiveLocale(): string;
}

export interface ExtensionContext {
	extension: {
		id: string;
		version: string;
		rootDirectory: string;
	};
	config: ExtensionConfig;
	profile?: UserMacroProfile;
	domainConfig?: ExtensionDomainConfig;
	compiledDomainGrammar?: CompiledDomainGrammar;
	dictionaries: DictionaryResourceFactory;
	macros: MacroRegistryWriter;
	listeners: ListenerRegistryWriter;
	values: ValueRegistryWriter;
	dependencies: ExtensionDependencyResolver;
	storage: ExtensionStorageServices;
	logger: ExtensionLogger;
	seed: ExtensionSeedServices;
	i18n?: ExtensionI18nWriter;
}

export interface ContextInternals {
	readonly scope: ResourceScope;
	readonly backends: Readonly<Record<string, ExpressionBackend>>;
	readonly listeners: readonly ParseListener[];
}
