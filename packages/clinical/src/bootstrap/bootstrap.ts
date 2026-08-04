import { DictionaryStore, InMemoryConceptResolver, type DictionaryConfig } from "@stateful-mcp/core";
import {
	createCommandSyntaxProfile,
	type CommandSyntaxProfile,
} from "../commands/command-syntax-profile";
import { CellCompiler } from "../cells/cell-compiler";
import type { ClinicalEngine } from "../engine/clinical-engine-v2";
import { ClinicalEngineBuilder } from "../engine/clinical-engine-v2-builder";
import type { ClinicalRuntime } from "../engine/clinical-runtime-v2";
import { createSyntaxProfile } from "../macros/macro-profile";
import {
	initializeColdStart,
	type ColdStartOptions,
	type ColdStartState,
} from "./cold-start";
import { StoreBuilder, type StoreBuilderConfig, type StoreBuilderResult } from "./store-builder";

export interface ClinicalBootstrapConfig {
	backend: StoreBuilderConfig["backend"];
	dbPath?: string;
	syntaxProfile?: CommandSyntaxProfile;
	temporalProfile?: import("../values/temporal-syntax-profile").TemporalSyntaxProfile;
	dictionaryConfig?: DictionaryConfig;
	valueRules?: ColdStartOptions["valueRules"];
}

export interface ClinicalBootstrapResult {
	stores: StoreBuilderResult;
	coldStart: ColdStartState;
	engine: ClinicalEngine;
	runtime: ClinicalRuntime;
	dictionary: DictionaryStore;
	syntaxProfile: CommandSyntaxProfile;
}

export class ClinicalBootstrap {
	static async fromConfig(
		config: ClinicalBootstrapConfig,
	): Promise<ClinicalBootstrapResult> {
		const stores = await StoreBuilder.fromConfig({
			backend: config.backend,
			dbPath: config.dbPath,
		});

		const dictionary = new DictionaryStore(
			new InMemoryConceptResolver(),
		);

		const coldStart = await initializeColdStart({
			dictionary,
			macroStore: stores.macroStore as ColdStartOptions["macroStore"],
			commandProfile: config.syntaxProfile,
			temporalProfile: config.temporalProfile,
			dictionaryConfig: config.dictionaryConfig,
			valueRules: config.valueRules,
		});

		const commandProfile = coldStart.commandProfile;
		const cellCompiler = new CellCompiler(
			stores.macroStore,
			coldStart.schemaRegistry,
			dictionary,
			createSyntaxProfile({
				...commandProfile,
				profileId: commandProfile.profileId,
			}),
		);

		const engine = new ClinicalEngineBuilder()
			.withEventStore(stores.eventStore)
			.withSchemaRegistry(coldStart.schemaRegistry)
			.withMacroStore(stores.macroStore)
			.withDictionary(dictionary)
			.withWorkspaceStore(stores.workspaceStore)
			.withCellStore(stores.cellStore)
			.withCellCompiler(cellCompiler.compile.bind(cellCompiler))
			.withProjectionStore(stores.projectionStore)
			.withArchiveStore(stores.archiveStore)
			.withJournal(stores.journal)
			.withSyntaxProfile(commandProfile)
			.build();

		return {
			stores,
			coldStart,
			engine,
			runtime: engine.getRuntime(),
			dictionary,
			syntaxProfile: commandProfile,
		};
	}

	static async withDefaultBackend(
		backend: StoreBuilderConfig["backend"],
		options: Omit<ClinicalBootstrapConfig, "backend"> & { dbPath?: string } = {},
	): Promise<ClinicalBootstrapResult> {
		return this.fromConfig({
			...options,
			backend,
		});
	}
}
