import {
	type DictionaryStore,
	type EventStore,
	type VariableService,
	VariableServiceStore,
} from "@stateful-mcp/core";
import type { CellCompileContext } from "../cells/cell-compiler";
import type { CellStore } from "../cells/cell-service-types";
import { StructuredCellService } from "../cells/structured-cell-service";
import { VariableCellService } from "../cells/variable-cell-service";
import { ClinicalDocumentService } from "../clinical/clinical-document-service";
import type {
	ClinicalDocumentProjectionStore,
	SignedDocumentArchive,
} from "../clinical/clinical-document-types";
import {
	InMemoryClinicalDocumentProjectionStore,
	InMemorySignedDocumentArchive,
} from "../clinical/clinical-document-types";
import { ClinicalOperationCompiler } from "../clinical/clinical-operation-compiler";
import { ClinicalTransactionParticipant } from "../clinical/clinical-transaction-participant";
import { CoreClinicalEventStore } from "../clinical/core-clinical-event-store";
import { registerClinicalSchemaAdapters } from "../clinical/register-clinical-schema-adapters";
import {
	type CommandSyntaxProfile,
	createCommandSyntaxProfile,
} from "../commands/command-syntax-profile";
import { VariableCommandService } from "../commands/variable-command-service";
import type { MacroLearningService } from "../learning/macro-learning-service";
import { MacroAuthoringService } from "../macros/macro-authoring-service";
import type { MacroStore } from "../macros/macro-definition";
import type { MacroExecutionPlan } from "../macros/macro-plan";
import { createSyntaxProfile } from "../macros/macro-profile";
import {
	createClinicalProjection,
	createSyncProjection,
	createWorkspaceProjection,
} from "../projections/projection-handlers";
import { ProjectionRegistry } from "../projections/projection-registry";
import type { SchemaRegistry } from "../schemas/schema-registry";
import { SyncApplicationService } from "../sync/sync-application-service";
import { SyncEngine } from "../sync/sync-engine";
import type { SyncConfig } from "../sync/sync-rule-config";
import {
	InMemoryTransactionJournal,
	TransactionCoordinator,
} from "../transactions/transaction-coordinator";
import type {
	TransactionJournal,
	TransactionParticipant,
} from "../transactions/transaction-types";
import { CoreWorkspaceEventStore } from "../workspaces/core-workspace-event-store";
import { WorkspaceService } from "../workspaces/workspace-service";
import type { WorkspaceStore } from "../workspaces/workspace-store";
import { WorkspaceTransactionParticipant } from "../workspaces/workspace-transaction-participant";
import type { WorkspaceViewStateStore } from "../workspaces/workspace-view-state";
import {
	InMemoryWorkspaceViewStateStore,
	WorkspaceViewService,
} from "../workspaces/workspace-view-state";
import { CellTransactionParticipant } from "./cell-transaction-participant";
import { ClinicalEngine } from "./clinical-engine-v2";
import type { ClinicalRuntime } from "./clinical-runtime-v2";

export class ClinicalEngineBuilder {
	private eventStore?: EventStore;
	private schemaRegistry?: SchemaRegistry;
	private macroStore?: MacroStore;
	private dictionaryStore?: DictionaryStore;
	private cellCompiler?: (
		rawText: string,
		context?: CellCompileContext,
	) => Promise<{
		plan?: MacroExecutionPlan;
		diagnostics: string[];
		fingerprint: string;
		learningTrace?: import("../learning/macro-learning-types").MacroLearningTrace;
	}>;
	private syncConfig?: SyncConfig;
	private cellStore?: CellStore;
	private workspaceStore?: WorkspaceStore;
	private projectionStore?: ClinicalDocumentProjectionStore;
	private archiveStore?: SignedDocumentArchive;
	private viewStore?: WorkspaceViewStateStore;
	private journal?: TransactionJournal;
	private extraParticipants: TransactionParticipant[] = [];
	private syntaxProfile?: CommandSyntaxProfile;
	private variableService?: VariableService;
	private macroLearningService?: MacroLearningService;

	withEventStore(store: EventStore): this {
		this.eventStore = store;
		return this;
	}

	withJournal(journal: TransactionJournal): this {
		this.journal = journal;
		return this;
	}

	withSchemaRegistry(registry: SchemaRegistry): this {
		this.schemaRegistry = registry;
		return this;
	}

	withMacroStore(store: MacroStore): this {
		this.macroStore = store;
		return this;
	}

	withDictionary(store: DictionaryStore): this {
		this.dictionaryStore = store;
		return this;
	}

	withCellCompiler(
		compile: (
			rawText: string,
			context?: CellCompileContext,
		) => Promise<{
			plan?: MacroExecutionPlan;
			diagnostics: string[];
			fingerprint: string;
			learningTrace?: import("../learning/macro-learning-types").MacroLearningTrace;
		}>,
	): this {
		this.cellCompiler = compile;
		return this;
	}

	withWorkspaceStore(store: WorkspaceStore): this {
		this.workspaceStore = store;
		return this;
	}

	withCellStore(store: CellStore): this {
		this.cellStore = store;
		return this;
	}

	withProjectionStore(store: ClinicalDocumentProjectionStore): this {
		this.projectionStore = store;
		return this;
	}

	withArchiveStore(store: SignedDocumentArchive): this {
		this.archiveStore = store;
		return this;
	}

	withViewStore(store: WorkspaceViewStateStore): this {
		this.viewStore = store;
		return this;
	}

	withSync(config: SyncConfig): this {
		this.syncConfig = config;
		return this;
	}

	withSyntaxProfile(profile: CommandSyntaxProfile): this {
		this.syntaxProfile = profile;
		return this;
	}

	withVariableService(service: VariableService): this {
		this.variableService = service;
		return this;
	}

	withMacroLearningService(service: MacroLearningService): this {
		this.macroLearningService = service;
		return this;
	}

	addParticipant(participant: TransactionParticipant): this {
		this.extraParticipants.push(participant);
		return this;
	}

	build(): ClinicalEngine {
		const eventStore = this.requireStore(this.eventStore, "EventStore");
		const schemaRegistry = this.requireStore(
			this.schemaRegistry,
			"SchemaRegistry",
		);
		const macroStore = this.macroStore;
		const dictionaryStore = this.dictionaryStore;
		if (!macroStore)
			throw new Error(
				"ClinicalEngineBuilder: 'MacroStore' is required. Call .withMacroStore(store) before .build()",
			);
		if (!dictionaryStore)
			throw new Error(
				"ClinicalEngineBuilder: 'DictionaryStore' is required. Call .withDictionary(store) before .build()",
			);
		if (!this.cellCompiler)
			throw new Error(
				"ClinicalEngineBuilder: 'CellCompiler' is required. Call .withCellCompiler(compile) before .build()",
			);

		const adapters = registerClinicalSchemaAdapters(schemaRegistry);

		const coreClinicalEvents = new CoreClinicalEventStore(eventStore);
		const clinicalCompiler = new ClinicalOperationCompiler(adapters);
		const clinicalProjectionStore =
			this.projectionStore ?? new InMemoryClinicalDocumentProjectionStore();
		const archiveStore =
			this.archiveStore ?? new InMemorySignedDocumentArchive();
		const clinicalService = new ClinicalDocumentService(
			coreClinicalEvents,
			clinicalCompiler,
			clinicalProjectionStore,
			archiveStore,
		);

		const coreWorkspaceEvents = new CoreWorkspaceEventStore(eventStore);
		const workspaceStore = this.requireStore(
			this.workspaceStore,
			"WorkspaceStore",
		);
		const workspaceService = new WorkspaceService(
			workspaceStore,
			coreWorkspaceEvents,
		);

		const cellStore = this.requireStore(this.cellStore, "CellStore");
		const cellService = new StructuredCellService({
			store: cellStore,
			compile: this.cellCompiler,
			learningService: this.macroLearningService,
		});

		const viewStore = this.viewStore ?? new InMemoryWorkspaceViewStateStore();
		const viewService = new WorkspaceViewService(workspaceService, viewStore);

		const journal = this.journal ?? new InMemoryTransactionJournal();
		const coordinator = new TransactionCoordinator({ journal });

		const clinicalParticipant = new ClinicalTransactionParticipant(
			clinicalService,
		);
		const workspaceParticipant = new WorkspaceTransactionParticipant(
			workspaceService,
		);
		const cellParticipant = new CellTransactionParticipant(cellStore);
		const participants: TransactionParticipant[] = [
			clinicalParticipant,
			workspaceParticipant,
			cellParticipant,
			...this.extraParticipants,
		];

		const syncEngine = new SyncEngine({ syncConfig: this.syncConfig });
		const syncApplication = this.syncConfig
			? new SyncApplicationService(workspaceService)
			: undefined;
		const variables = this.variableService ?? new VariableServiceStore();
		const syntaxProfile =
			this.syntaxProfile ??
			createCommandSyntaxProfile({
				profileId: "v2-default",
				default: true,
				active: true,
			});
		const macroAuthoring = new MacroAuthoringService({
			macros: macroStore,
			registry: schemaRegistry,
			dictionary: dictionaryStore,
			profile: createSyntaxProfile({
				...syntaxProfile,
				profileId: syntaxProfile.profileId,
			}),
		});

		const registry = new ProjectionRegistry();
		registry.register(createClinicalProjection(clinicalService));
		registry.register(createWorkspaceProjection(workspaceService));
		if (this.syncConfig) {
			registry.register(createSyncProjection(syncEngine, clinicalService));
		}

		const runtime: ClinicalRuntime = {
			stores: {
				eventStore,
				transactionJournal: journal,
				workspaceStore,
				cellStore,
				clinicalProjectionStore,
				signedDocumentArchive: archiveStore,
				viewStateStore: viewStore,
				syncConfig: this.syncConfig,
			},
			macros: {
				schemaRegistry,
				defs: macroStore,
				dictionary: dictionaryStore,
				authoring: macroAuthoring,
			},
			syntaxProfile,
			variables,
			variableCells: new VariableCellService(
				cellStore,
				new VariableCommandService(variables),
				syntaxProfile,
			),
			learning: this.macroLearningService
				? { macro: this.macroLearningService }
				: undefined,
		};

		const engine = new ClinicalEngine(
			runtime,
			coordinator,
			participants,
			registry,
			workspaceService,
			clinicalService,
			cellService,
			viewService,
			syncEngine,
			syncApplication,
		);
		cellService.setPlanExecutor((plan) => engine.executePlan(plan));
		return engine;
	}

	private requireStore<T>(store: T | undefined, name: string): T {
		if (!store)
			throw new Error(
				`ClinicalEngineBuilder: '${name}' is required. Call .with${name}(store) before .build()`,
			);
		return store;
	}
}
