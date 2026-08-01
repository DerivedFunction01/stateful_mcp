import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	createRepo,
	DictionaryStore,
	EventStore,
	InMemoryConceptResolver,
	loadJsonConfigCandidates,
	MemoryKvBackend,
	ObjectStore,
	readJsonConfigFile,
	resolveConfigDir,
} from "@stateful-mcp/core";
import * as path from "path";
import { initializeClinicalRuntime } from "../init/orchestrator";
import { CommandAutocompleteSuggester } from "../parser/command-autocomplete-suggester";
import { DEFAULT_CLINICAL_STORE_CONFIG } from "../seed/clinical-config-seed";
import { CellCommandRegistry } from "../session/cell-command-registry";
import { CellProcessor } from "../session/cell-processor";
import { WorkspaceCellService } from "../session/workspace-cell-service";
import { resolveCellStore } from "../store/cell/cell-backend-resolver";
import type {
	ClinicalStoreBackendConfig,
	ClinicalStoreConfig,
} from "../store/clinical-config";
import type { ClinicalRuntime } from "../store/clinical-runtime";
import { createClinicalRuntime } from "../store/clinical-runtime";
import type { CellStore } from "../store/interfaces";
import { resolveNotebookStore } from "../store/notebook/notebook-backend-resolver";
import type { NotebookStore } from "../store/notebook/notebook-store";
import { DefaultParserProfileComposer } from "../store/parser/parser-composer";
import { KvSignedSoapNoteStore } from "../store/signed-note/kv-signed-note-store";
import type { ClinicalEngineConfig } from "./clinical-engine";
import { ClinicalEngine } from "./clinical-engine";
import { WorkspaceReadModelImpl } from "./workspace-read-model";
import { WorkspaceStore } from "./workspace-store";

// ── Public result type ────────────────────────────────────────────

export interface EngineBuilderResult {
	runtime: ClinicalRuntime;
	engine: ClinicalEngine;
	processor: CellProcessor;
	notebook: NotebookStore;
	cellStore: CellStore;
}

export interface EngineBuilderOptions {
	personnelId?: string;
	profileId?: string;
	/** For sqlite/jsonl backends — db/file path prefix. Defaults to "./clinical". */
	dbPath?: string;
}

// ── Adapter factory helpers ───────────────────────────────────────

const MEMORY_ADAPTER: ClinicalStoreBackendConfig = {
	group: "memory" as any,
	capabilities: ["read", "write"],
	primary: { _type: "adapter", name: "memory", options: {} },
	implemented: true,
};

function sqliteAdapter(
	path: string,
	group: string,
): ClinicalStoreBackendConfig {
	return {
		group: group as any,
		capabilities: ["read", "write", "query"],
		primary: { _type: "adapter", name: "sqlite", options: { path } },
		implemented: true,
	};
}

function jsonlAdapter(path: string, group: string): ClinicalStoreBackendConfig {
	return {
		group: group as any,
		capabilities: ["read", "write"],
		primary: { _type: "adapter", name: "jsonl", options: { path } },
		implemented: true,
	};
}

function allMemoryConfig(initEnabled: boolean): ClinicalStoreConfig {
	return {
		...DEFAULT_CLINICAL_STORE_CONFIG,
		init: initEnabled
			? {
					enabled: true,
					mode: "bootstrap",
					seedPolicy: "if_empty",
					seedSource: "starter",
				}
			: {
					enabled: false,
					mode: "bootstrap",
					seedPolicy: "never",
					seedSource: "none",
				},
		domains: Object.fromEntries(
			Object.entries(DEFAULT_CLINICAL_STORE_CONFIG.domains).map(
				([key, domain]) => [
					key,
					{ ...domain, defaultAdapters: [MEMORY_ADAPTER] },
				],
			),
		) as Record<string, any>,
	};
}

function allSqliteConfig(
	dbPath: string,
	initEnabled: boolean,
): ClinicalStoreConfig {
	const adapter = (group: string) => sqliteAdapter(dbPath, group);
	return {
		...DEFAULT_CLINICAL_STORE_CONFIG,
		init: initEnabled
			? {
					enabled: true,
					mode: "bootstrap",
					seedPolicy: "if_empty",
					seedSource: "starter",
				}
			: {
					enabled: false,
					mode: "bootstrap",
					seedPolicy: "never",
					seedSource: "none",
				},
		domains: Object.fromEntries(
			Object.entries(DEFAULT_CLINICAL_STORE_CONFIG.domains).map(
				([key, domain]) => [
					key,
					{ ...domain, defaultAdapters: [adapter(key)] },
				],
			),
		) as Record<string, any>,
	};
}

function allJsonlConfig(
	dbPath: string,
	initEnabled: boolean,
): ClinicalStoreConfig {
	const adapter = (group: string) => jsonlAdapter(dbPath, group);
	return {
		...DEFAULT_CLINICAL_STORE_CONFIG,
		init: initEnabled
			? {
					enabled: true,
					mode: "bootstrap",
					seedPolicy: "if_empty",
					seedSource: "starter",
				}
			: {
					enabled: false,
					mode: "bootstrap",
					seedPolicy: "never",
					seedSource: "none",
				},
		domains: Object.fromEntries(
			Object.entries(DEFAULT_CLINICAL_STORE_CONFIG.domains).map(
				([key, domain]) => [
					key,
					{ ...domain, defaultAdapters: [adapter(key)] },
				],
			),
		) as Record<string, any>,
	};
}

// ── Engine-level store creation ───────────────────────────────────

async function createEngineStores(
	backend: "memory" | "sqlite" | "jsonl",
	dbPath: string,
) {
	switch (backend) {
		case "memory": {
			const repo = await createRepo({
				object: { session: { type: "memory" }, persistent: { type: "memory" } },
				event: { session: { type: "memory" }, persistent: { type: "memory" } },
			});
			return {
				objectStore: new ObjectStore(
					repo.sessionObject!,
					repo.persistentObject!,
					new Map(),
				),
				eventStore: new EventStore({
					session: repo.sessionEvent!,
					persistent: repo.persistentEvent!,
					schemas: new Map(),
				}),
				dictionaryStore: new DictionaryStore(
					new InMemoryConceptResolver(),
					createMemoryConceptStore(),
					createMemoryExpressionStore(),
				),
				signedNoteStore: new KvSignedSoapNoteStore(new MemoryKvBackend()),
			};
		}
		case "sqlite":
		case "jsonl":
			return createRepoBasedEngineStores(backend, dbPath);
	}
}

async function createRepoBasedEngineStores(
	backend: "sqlite" | "jsonl",
	dbPath: string,
) {
	const type = backend;
	const target = dbPath;
	const repo = await createRepo({
		object: { session: { type }, persistent: { type, target } },
		event: { session: { type }, persistent: { type, target } },
		concept: { type, target: `${dbPath}-concept` },
		expression: { type, target: `${dbPath}-expression` },
	});
	return {
		objectStore: new ObjectStore(
			repo.sessionObject!,
			repo.persistentObject!,
			new Map(),
		),
		eventStore: new EventStore({
			session: repo.sessionEvent!,
			persistent: repo.persistentEvent!,
			schemas: new Map(),
		}),
		dictionaryStore: new DictionaryStore(
			new InMemoryConceptResolver(),
			repo.conceptStore!,
			repo.persistentExpressionStore!,
		),
		signedNoteStore: new KvSignedSoapNoteStore(new MemoryKvBackend()),
	};
}

// ── Shared engine wiring (same for all backends) ──────────────────

async function wireEngine(
	runtime: ClinicalRuntime,
	engineStores: Awaited<ReturnType<typeof createEngineStores>>,
	options?: EngineBuilderOptions,
): Promise<{
	engine: ClinicalEngine;
	processor: CellProcessor;
	notebook: NotebookStore;
	cellStore: CellStore;
}> {
	const personnelId = options?.personnelId ?? "system";
	const dbPath = options?.dbPath ?? "./clinical";
	const stores = runtime.parserStores;

	const composer = new DefaultParserProfileComposer(
		stores.profiles,
		stores.profileTags,
		stores.tags,
		stores.attributeRules,
		stores.evaluatorRules,
		stores.attributeBindings,
		stores.evaluatorBindings,
	);

	const profileId = options?.profileId ?? "starter.default";
	const composedProfile = await composer.getFullProfile(profileId);
	if (!composedProfile)
		throw new Error(`parser profile not found: ${profileId}`);

	const commandSuggester = new CommandAutocompleteSuggester(
		stores.tags,
		stores.profileTags,
		composedProfile,
		runtime.autocompleteTransitionStore,
		undefined,
		stores.macros,
		stores.dictionaryStore,
	);

	const workspaceStore = new WorkspaceStore(
		engineStores.objectStore,
		engineStores.eventStore,
		undefined,
		personnelId,
	);

	const cellStore = await resolveCellStore(runtime.config);
	const workspaceReadModel = new WorkspaceReadModelImpl(
		workspaceStore,
		cellStore,
	);

	const engineConfig: ClinicalEngineConfig = {
		...engineStores,
		workspaceStore,
		workspaceReadModel,
		profile: composedProfile,
		parsedCellStore: runtime.learningStores[0] as any,
		orderAwareStore: runtime.orderedLearningStores[0],
		autocompleteTransitionStore: runtime.autocompleteTransitionStore,
		conceptFieldStore: stores.conceptFields,
		proseTemplateStore: stores.proseTemplates,
		proseParserTemplateStore: stores.proseParserTemplates,
		sharedFieldAnchorStore: stores.sharedFieldAnchors,
		commandSuggester,
		ngramStore: runtime.ngramStore,
		personnelId,
		calibrationStore: stores.calibration,
	};

	const engine = new ClinicalEngine(engineConfig);
	const parser = engine.getParser();
	workspaceStore.setParser(parser);
	const notebook = await resolveNotebookStore(runtime.config);
	const processor = new CellProcessor(
		engine,
		workspaceStore,
		parser,
		undefined,
		cellStore,
		CellCommandRegistry.createDefault(),
	);
	const workspaceCellService = new WorkspaceCellService(
		workspaceStore,
		processor,
		cellStore,
	);
	engine.setWorkspaceCellService(workspaceCellService);

	return { engine, processor, notebook, cellStore };
}

// ── Public builder ────────────────────────────────────────────────

export class ClinicalEngineBuilder {
	private constructor() {}

	/**
	 * Create a wired runtime, engine, and processor from a config object.
	 * Runs bootstrap init if config.init.enabled is true.
	 */
	static async fromConfig(
		config: ClinicalStoreConfig,
		options?: EngineBuilderOptions,
	): Promise<EngineBuilderResult> {
		const runtime = await createClinicalRuntime(config);
		if (config.init?.enabled) {
			await initializeClinicalRuntime(runtime, config);
		}
		const backend = detectBackend(config);
		const engineStores = await createEngineStores(
			backend,
			options?.dbPath ?? "./clinical",
		);
		const { engine, processor, notebook, cellStore } = await wireEngine(
			runtime,
			engineStores,
			options,
		);
		return { runtime, engine, processor, notebook, cellStore };
	}

	/**
	 * Load a config from a JSON file, then create a wired runtime, engine, and processor.
	 * Runs bootstrap init if the loaded config has init.enabled.
	 */
	static async fromConfigFile(
		filePath: string,
		options?: EngineBuilderOptions,
	): Promise<EngineBuilderResult> {
		const config = await readJsonConfigFile<ClinicalStoreConfig>(filePath);
		return ClinicalEngineBuilder.fromConfig(config, options);
	}

	/**
	 * Create a config search from a directory and return a wired result.
	 * Searches `config/clinical.config.json` and `clinical.config.json` under the directory.
	 * Falls back to the DEFAULT_CLINICAL_STORE_CONFIG if neither exists.
	 */
	static async fromConfigDir(
		dir?: string,
		options?: EngineBuilderOptions,
	): Promise<EngineBuilderResult> {
		const resolvedRoot = dir ?? resolveConfigDir();
		const candidates = [
			{
				path: path.join(resolvedRoot, "config", "clinical.config.json"),
				optional: true,
			},
			{ path: path.join(resolvedRoot, "clinical.config.json"), optional: true },
		];
		const loaded =
			await loadJsonConfigCandidates<ClinicalStoreConfig>(candidates);
		if (loaded) return ClinicalEngineBuilder.fromConfig(loaded, options);
		return ClinicalEngineBuilder.withDefaultBackend("memory", options);
	}

	/**
	 * Generate a config where every domain uses the same backend type.
	 *
	 * - `"memory"` — all stores use MemoryKvBackend. Zero file I/O.
	 *   Engine-level stores (ObjectStore, EventStore, DictionaryStore) also use memory.
	 *
	 * - `"sqlite"` — all stores share one SQLite database at `dbPath`.
	 *   Engine-level stores use the same repo-backed SQLite connection.
	 *
	 * - `"jsonl"` — all stores use JSONL files at `dbPath`.
	 *   Engine-level stores share JSONL files.
	 */
	static async withDefaultBackend(
		backend: "memory" | "sqlite" | "jsonl",
		options?: EngineBuilderOptions,
	): Promise<EngineBuilderResult> {
		const dbPath = options?.dbPath ?? "./clinical";
		const initEnabled = true;

		let config: ClinicalStoreConfig;
		switch (backend) {
			case "memory":
				config = allMemoryConfig(initEnabled);
				break;
			case "sqlite":
				config = allSqliteConfig(`${dbPath}.sqlite`, initEnabled);
				break;
			case "jsonl":
				config = allJsonlConfig(`${dbPath}.jsonl`, initEnabled);
				break;
		}

		const runtime = await createClinicalRuntime(config);
		await initializeClinicalRuntime(runtime, config);
		const engineStores = await createEngineStores(backend, dbPath);
		const { engine, processor, notebook, cellStore } = await wireEngine(
			runtime,
			engineStores,
			options,
		);
		return { runtime, engine, processor, notebook, cellStore };
	}
}

// ── Helpers ───────────────────────────────────────────────────────

function detectBackend(
	config: ClinicalStoreConfig,
): "memory" | "sqlite" | "jsonl" {
	for (const domain of Object.values(config.domains)) {
		const adapter = domain?.defaultAdapters?.[0]?.primary;
		if (!adapter || adapter._type !== "adapter") continue;
		if (
			adapter.name === "sqlite" ||
			adapter.name === "postgres" ||
			adapter.name === "duckdb"
		)
			return "sqlite";
		if (adapter.name === "jsonl") return "jsonl";
	}
	return "memory";
}
