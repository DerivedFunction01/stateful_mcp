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
import { MacroLearningService } from "../learning/macro-learning-service";
import { createSyntaxProfile } from "../macros/macro-profile";
import type { NumericalSyntaxProfile } from "../values/numerical-syntax-profile";
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
	numericalProfile?: NumericalSyntaxProfile;
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
	learningService: MacroLearningService;
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
	await seedMacroLearningWeights(stores.systemWeightStore);
	const learningService = new MacroLearningService({
		transitionStore: stores.macroTransitionStore,
		weightStore: stores.systemWeightStore,
		parseStore: stores.macroParseLearningStore,
	});
	const cellCompiler = new CellCompiler(
		stores.macroStore,
		coldStart.schemaRegistry,
		dictionary,
		createSyntaxProfile({
			...commandProfile,
			profileId: commandProfile.profileId,
		}),
		stores.macroParseLearningStore,
	);

	const engine = new ClinicalEngineBuilder()
		.withEventStore(stores.eventStore)
		.withSchemaRegistry(coldStart.schemaRegistry)
		.withMacroStore(stores.macroStore)
		.withDictionary(dictionary)
		.withWorkspaceStore(stores.workspaceStore)
		.withCellStore(stores.cellStore)
		.withCellCompiler(cellCompiler.compile.bind(cellCompiler))
		.withMacroLearningService(learningService)
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
		learningService,
	};
}

async function seedMacroLearningWeights(
	store: StoreBuilderResult["systemWeightStore"],
): Promise<void> {
	const weights: ReadonlyArray<[string, string, string, number]> = [
		["macro.transition", "scope", "personal", 0.7],
		["macro.transition", "scope", "global", 0.3],
		["macro.transition", "mode", "live", 0.25],
		["macro.transition", "mode", "preview", 0.5],
		["macro.transition", "mode", "execution", 1],
		["macro.rank", "feature", "transition", 1],
		["macro.rank", "feature", "numericFit", 1],
		["macro.rank", "feature", "parseConfidence", 1],
		["macro.rank", "feature", "recency", 1],
	];
	for (const [category, key, subKey, value] of weights) {
		const current = await store.getWeight(category, key, subKey);
		if (current === 1) await store.setWeight(category, key, value, subKey);
	}
}
