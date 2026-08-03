import type { EventStore, DictionaryStore } from "@stateful-mcp/core";
import { TransactionCoordinator, InMemoryTransactionJournal } from "../transactions/transaction-coordinator";
import type { TransactionJournal, TransactionParticipant } from "../transactions/transaction-types";
import type { ClinicalDocumentProjectionStore, SignedDocumentArchive } from "../clinical/clinical-document-types";
import { InMemoryClinicalDocumentProjectionStore, InMemorySignedDocumentArchive } from "../clinical/clinical-document-types";
import { CoreClinicalEventStore } from "../clinical/core-clinical-event-store";
import { ClinicalDocumentService } from "../clinical/clinical-document-service";
import { ClinicalOperationCompiler } from "../clinical/clinical-operation-compiler";
import { ClinicalTransactionParticipant } from "../clinical/clinical-transaction-participant";
import { registerClinicalSchemaAdapters } from "../clinical/register-clinical-schema-adapters";
import { InMemoryWorkspaceViewStateStore } from "../workspaces/workspace-view-state";
import type { WorkspaceViewStateStore } from "../workspaces/workspace-view-state";
import { CoreWorkspaceEventStore } from "../workspaces/core-workspace-event-store";
import type { WorkspaceStore } from "../workspaces/workspace-store";
import { WorkspaceService } from "../workspaces/workspace-service";
import { WorkspaceTransactionParticipant } from "../workspaces/workspace-transaction-participant";
import { StructuredCellService } from "../cells/structured-cell-service";
import type { CellStore } from "../cells/cell-service-types";
import { CellTransactionParticipant } from "./cell-transaction-participant";
import { ClinicalEngineV2 } from "./clinical-engine-v2";
import { ProjectionRegistry } from "../projections/projection-registry";
import { createClinicalProjection, createWorkspaceProjection, createSyncProjection } from "../projections/projection-handlers";
import { SyncEngine } from "../sync/sync-engine";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type { MacroStore } from "../macros/macro-definition";
import type { SyncConfig } from "../sync/sync-rule-config";
import { WorkspaceViewService } from "../workspaces/workspace-view-state";
import type { ClinicalRuntimeV2 } from "./clinical-runtime-v2";

export class ClinicalEngineV2Builder {
	private eventStore?: EventStore;
	private schemaRegistry?: SchemaRegistry;
	private macroStore?: MacroStore;
	private dictionaryStore?: DictionaryStore;
	private syncConfig?: SyncConfig;
	private cellStore?: CellStore;
	private workspaceStore?: WorkspaceStore;
	private projectionStore?: ClinicalDocumentProjectionStore;
	private archiveStore?: SignedDocumentArchive;
	private viewStore?: WorkspaceViewStateStore;
	private journal?: TransactionJournal;
	private extraParticipants: TransactionParticipant[] = [];

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

	addParticipant(participant: TransactionParticipant): this {
		this.extraParticipants.push(participant);
		return this;
	}

	build(): ClinicalEngineV2 {
		const eventStore = this.requireStore(this.eventStore, "EventStore");
		const schemaRegistry = this.requireStore(this.schemaRegistry, "SchemaRegistry");
		const macroStore = this.macroStore;
		const dictionaryStore = this.dictionaryStore;

		const adapters = registerClinicalSchemaAdapters(schemaRegistry);

		const coreClinicalEvents = new CoreClinicalEventStore(eventStore);
		const clinicalCompiler = new ClinicalOperationCompiler(adapters);
		const clinicalProjectionStore = this.projectionStore ?? new InMemoryClinicalDocumentProjectionStore();
		const archiveStore = this.archiveStore ?? new InMemorySignedDocumentArchive();
		const clinicalService = new ClinicalDocumentService(
			coreClinicalEvents,
			clinicalCompiler,
			clinicalProjectionStore,
			archiveStore,
		);

		const coreWorkspaceEvents = new CoreWorkspaceEventStore(eventStore);
		const workspaceStore = this.requireStore(this.workspaceStore, "WorkspaceStore");
		const workspaceService = new WorkspaceService(
			workspaceStore,
			coreWorkspaceEvents,
		);

		const cellStore = this.requireStore(this.cellStore, "CellStore");
		const cellService = new StructuredCellService({
			store: cellStore as any,
			compile: async () => ({ diagnostics: [], fingerprint: "" }),
		});

		const viewStore = this.viewStore ?? new InMemoryWorkspaceViewStateStore();
		const viewService = new WorkspaceViewService(workspaceService, viewStore);

		const journal = this.journal ?? new InMemoryTransactionJournal();
		const coordinator = new TransactionCoordinator({ journal });

		const clinicalParticipant = new ClinicalTransactionParticipant(clinicalService);
		const workspaceParticipant = new WorkspaceTransactionParticipant(workspaceService);
		const cellParticipant = new CellTransactionParticipant(cellStore);
		const participants: TransactionParticipant[] = [
			clinicalParticipant,
			workspaceParticipant,
			cellParticipant,
			...this.extraParticipants,
		];

		const syncEngine = new SyncEngine({ syncConfig: this.syncConfig });

		const registry = new ProjectionRegistry();
		registry.register(createClinicalProjection(clinicalService));
		registry.register(createWorkspaceProjection(workspaceService));
		if (this.syncConfig) {
			registry.register(createSyncProjection(syncEngine, clinicalService, workspaceService));
		}

		const runtime: ClinicalRuntimeV2 = {
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
				defs: macroStore ?? ({} as any),
				dictionary: dictionaryStore ?? ({} as any),
			},
		};

		return new ClinicalEngineV2(
			runtime,
			coordinator,
			participants,
			registry,
			workspaceService,
			clinicalService,
			cellService,
			viewService,
			syncEngine,
		);
	}

	private requireStore<T>(store: T | undefined, name: string): T {
		if (!store) throw new Error(`ClinicalEngineV2Builder: '${name}' is required. Call .with${name}(store) before .build()`);
		return store;
	}
}