import {
	type DictionaryConfig,
	DictionaryStore,
	InMemoryConceptResolver,
} from "@stateful-mcp/core";
import { CellCompiler } from "../cells/cell-compiler";
import type { CommandSyntaxProfile } from "../commands/command-syntax-profile";
import type { ClinicalEngine } from "../engine/clinical-engine-v2";
import { ClinicalEngineBuilder } from "../engine/clinical-engine-v2-builder";
import type { ClinicalRuntime } from "../engine/clinical-runtime-v2";
import { createSyntaxProfile } from "../macros/macro-profile";
import {
	type ColdStartOptions,
	type ColdStartState,
	initializeColdStart,
} from "./cold-start";
import {
	StoreBuilder,
	type StoreBuilderConfig,
	type StoreBuilderResult,
} from "./store-builder";

export interface ClinicalBootstrapConfig {
	backend: StoreBuilderConfig["backend"];
	dbPath?: string;
	syntaxProfile?: CommandSyntaxProfile;
	numericalProfile?: import("../values/numerical-syntax-profile").NumericalSyntaxProfile;
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
	static async fromStores(
		stores: StoreBuilderResult,
		options: Omit<ClinicalBootstrapConfig, "backend" | "dbPath"> = {},
	): Promise<ClinicalBootstrapResult> {
		return buildClinicalBootstrap(stores, options);
	}

	static async fromConfig(
		config: ClinicalBootstrapConfig,
	): Promise<ClinicalBootstrapResult> {
		const stores = await StoreBuilder.fromConfig({
			backend: config.backend,
			dbPath: config.dbPath,
		});
		return buildClinicalBootstrap(stores, config);
	}

	static async withDefaultBackend(
		backend: StoreBuilderConfig["backend"],
		options: Omit<ClinicalBootstrapConfig, "backend"> & {
			dbPath?: string;
		} = {},
	): Promise<ClinicalBootstrapResult> {
		return ClinicalBootstrap.fromConfig({
			...options,
			backend,
		});
	}
}

async function buildClinicalBootstrap(
	stores: StoreBuilderResult,
	config: Omit<ClinicalBootstrapConfig, "backend">,
): Promise<ClinicalBootstrapResult> {
	const dictionary = new DictionaryStore(new InMemoryConceptResolver());

	const coldStart = await initializeColdStart({
		dictionary,
		macroStore: stores.macroStore as ColdStartOptions["macroStore"],
		commandProfile: config.syntaxProfile,
		numericalProfile: config.numericalProfile,
		dictionaryConfig: config.dictionaryConfig,
		valueRules: config.valueRules,
	});
	await stores.profileStore.set({
		profileId: coldStart.commandProfile.profileId,
		kind: "command",
		isDefault: coldStart.commandProfile.default,
		active: coldStart.commandProfile.active,
		payload: coldStart.commandProfile,
	});
	await stores.profileStore.set({
		profileId: coldStart.numericalProfile.profileId,
		kind: "numerical",
		isDefault: coldStart.numericalProfile.profileId.endsWith(":numerical"),
		active: true,
		payload: coldStart.numericalProfile,
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
