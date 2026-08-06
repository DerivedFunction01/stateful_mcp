import {
	EventStore,
	JsonlKvBackend,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import { createEventStore as createSimpleEventStore } from "@stateful-mcp/core/adapters/storage/simple/create-event-store";
import { JsonlKvBackend as SimpleJsonlKvBackend } from "@stateful-mcp/core/adapters/storage/simple/jsonl/backend";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { createEventStore as createSqlEventStore } from "@stateful-mcp/core/adapters/storage/sql/create-event-store";
import type { SqlDialect } from "@stateful-mcp/core/translation/sql-compiler";
import type { CellStore } from "../cells/cell-service-types";
import { KvCellStore } from "../cells/kv-cell-store";
import { SqlCellStore } from "../cells/sql-cell-store";
import {
	SqlClinicalDocumentProjectionStore,
	SqlSignedDocumentArchive,
} from "../clinical/clinical-document-sql-stores";
import type {
	ClinicalDocumentProjectionStore,
	SignedDocumentArchive,
} from "../clinical/clinical-document-types";
import {
	InMemoryClinicalDocumentProjectionStore,
	InMemorySignedDocumentArchive,
	KvClinicalDocumentProjectionStore,
	KvSignedDocumentArchive,
} from "../clinical/clinical-document-types";
import { KvMacroTransitionStore } from "../learning/autocomplete/kv-transition-store";
import { SqlMacroTransitionStore } from "../learning/autocomplete/sql-transition-store";
import type { CommandHistoryStore } from "../learning/command-history";
import type {
	MacroTransitionStore,
	SystemWeightStore,
} from "../learning/interfaces";
import { KvCommandHistoryStore } from "../learning/kv-command-history-store";
import { KvMacroParseLearningStore } from "../learning/kv-macro-parse-learning-store";
import {
	type MacroParseLearningStore,
	SqlMacroParseLearningStore,
} from "../learning/macro-parse-learning-store";
import { SqlCommandHistoryStore } from "../learning/sql-command-history-store";
import {
	KvBackendSystemWeightStore,
	SqlBackendSystemWeightStore,
} from "../learning/weight-store";
import { KvMacroStore } from "../macros/kv-macro-store";
import type { MacroStore } from "../macros/macro-definition";
import { SqlMacroStore } from "../macros/sql-macro-store";
import { KvNotebookSessionStore } from "../notebook/kv-notebook-session-store";
import type { NotebookSessionStore } from "../notebook/notebook-session-store";
import { SqlNotebookSessionStore } from "../notebook/sql-notebook-session-store";
import type { PatientStore } from "../stores/patients/interfaces";
import { KvPatientStore } from "../stores/patients/kv-patient-store";
import { SqlPatientStore } from "../stores/patients/sql-patient-store";
import { KvProfileStore } from "../stores/profiles/kv-profile-store";
import type { UnifiedProfileStore } from "../stores/profiles/profile-store";
import { SqlProfileStore } from "../stores/profiles/sql-profile-store";
import type { ClinicalProseTemplateStore } from "../stores/prose-templates/interfaces";
import { KvClinicalProseTemplateStore } from "../stores/prose-templates/kv-clinical-prose-template-store";
import { KvClinicalProseTemplateUsageStore } from "../stores/prose-templates/kv-clinical-prose-template-usage-store";
import { SqlClinicalProseTemplateStore } from "../stores/prose-templates/sql-clinical-prose-template-store";
import { SqlClinicalProseTemplateUsageStore } from "../stores/prose-templates/sql-clinical-prose-template-usage-store";
import type { ProseTemplateUsageStore } from "../stores/prose-templates/usage";
import { KvTransactionJournal } from "../transactions/kv-transaction-journal";
import { SqlTransactionJournal } from "../transactions/sql-transaction-journal";
import type { TransactionJournal } from "../transactions/transaction-types";
import { KvWorkspaceStore } from "../workspaces/kv-workspace-store";
import { SqlWorkspaceStore } from "../workspaces/sql-workspace-store";
import type { WorkspaceStore } from "../workspaces/workspace-store";

export type StoreBackend = "memory" | "sqlite" | "jsonl";

export interface StoreBuilderConfig {
	backend: StoreBackend;
	dbPath?: string;
}

export interface StoreBuilderResult {
	eventStore: EventStore;
	workspaceStore: WorkspaceStore;
	cellStore: CellStore;
	notebookSessionStore: NotebookSessionStore;
	macroStore: MacroStore;
	profileStore: UnifiedProfileStore;
	journal: TransactionJournal;
	projectionStore: ClinicalDocumentProjectionStore;
	archiveStore: SignedDocumentArchive;
	commandHistoryStore: CommandHistoryStore;
	macroParseLearningStore: MacroParseLearningStore;
	macroTransitionStore: MacroTransitionStore;
	systemWeightStore: SystemWeightStore;
	proseTemplateStore: ClinicalProseTemplateStore;
	proseTemplateUsageStore: ProseTemplateUsageStore;
	patientStore: PatientStore;
}

export class StoreBuilder {
	static fromConfig(config: StoreBuilderConfig): Promise<StoreBuilderResult> {
		return createStoreBuilder(config);
	}

	static withDefaultBackend(
		backend: StoreBackend,
		dbPath?: string,
	): Promise<StoreBuilderResult> {
		return createStoreBuilder({ backend, dbPath });
	}
}

/** Creates the  persistence composition used by bootstrap callers. */
export async function createStoreBuilder(
	config: StoreBuilderConfig,
): Promise<StoreBuilderResult> {
	switch (config.backend) {
		case "memory":
			return createMemoryStores();
		case "jsonl":
			return createJsonlStores(config.dbPath ?? "./clinical");
		case "sqlite":
			return createSqliteStores(config.dbPath ?? "./clinical.sqlite");
	}
}

async function createMemoryStores(): Promise<StoreBuilderResult> {
	const eventStorage = await createSimpleEventStore(
		new SimpleMemoryKvBackend(),
	);
	const backend = new MemoryKvBackend();
	return {
		eventStore: createEventStore(eventStorage),
		workspaceStore: new KvWorkspaceStore(backend),
		cellStore: new KvCellStore(backend),
		notebookSessionStore: new KvNotebookSessionStore(backend),
		macroStore: new KvMacroStore(backend),
		profileStore: new KvProfileStore(backend),
		journal: new KvTransactionJournal(backend),
		projectionStore: new InMemoryClinicalDocumentProjectionStore(),
		archiveStore: new InMemorySignedDocumentArchive(),
		commandHistoryStore: new KvCommandHistoryStore(backend),
		macroParseLearningStore: new KvMacroParseLearningStore(backend),
		macroTransitionStore: new KvMacroTransitionStore(backend),
		systemWeightStore: new KvBackendSystemWeightStore(backend),
		proseTemplateStore: new KvClinicalProseTemplateStore(backend),
		proseTemplateUsageStore: new KvClinicalProseTemplateUsageStore(backend),
		patientStore: new KvPatientStore(backend),
	};
}

async function createJsonlStores(
	basePath: string,
): Promise<StoreBuilderResult> {
	const eventStorage = await createSimpleEventStore(
		new SimpleJsonlKvBackend(
			`${basePath}.events.jsonl`,
			`${basePath}.events.jsonl`,
		),
	);
	const backend = new JsonlKvBackend({ dataFilePath: `${basePath}.v2.jsonl` });
	await backend.load();
	return {
		eventStore: createEventStore(eventStorage),
		workspaceStore: new KvWorkspaceStore(backend),
		cellStore: new KvCellStore(backend),
		notebookSessionStore: new KvNotebookSessionStore(backend),
		macroStore: new KvMacroStore(backend),
		profileStore: new KvProfileStore(backend),
		journal: new KvTransactionJournal(backend),
		projectionStore: new KvClinicalDocumentProjectionStore(backend),
		archiveStore: new KvSignedDocumentArchive(backend),
		commandHistoryStore: new KvCommandHistoryStore(backend),
		macroParseLearningStore: new KvMacroParseLearningStore(backend),
		macroTransitionStore: new KvMacroTransitionStore(backend),
		systemWeightStore: new KvBackendSystemWeightStore(backend),
		proseTemplateStore: new KvClinicalProseTemplateStore(backend),
		proseTemplateUsageStore: new KvClinicalProseTemplateUsageStore(backend),
		patientStore: new KvPatientStore(backend),
	};
}

async function createSqliteStores(dbPath: string): Promise<StoreBuilderResult> {
	const dialect: SqlDialect = "sqlite";
	const backend = await SqlBackend.connect(dialect, dbPath);
	const executor = new SqlExecutor(backend);
	const eventStorage = await createSqlEventStore(dialect, dbPath, backend);
	return {
		eventStore: createEventStore(eventStorage),
		workspaceStore: new SqlWorkspaceStore(dialect, executor),
		cellStore: new SqlCellStore(dialect, executor),
		notebookSessionStore: new SqlNotebookSessionStore(dialect, executor),
		macroStore: new SqlMacroStore(dialect, executor),
		profileStore: new SqlProfileStore(dialect, executor),
		journal: new SqlTransactionJournal(dialect, executor),
		projectionStore: new SqlClinicalDocumentProjectionStore(dialect, executor),
		archiveStore: new SqlSignedDocumentArchive(dialect, executor),
		commandHistoryStore: new SqlCommandHistoryStore(dialect, executor),
		macroParseLearningStore: new SqlMacroParseLearningStore(dialect, executor),
		macroTransitionStore: new SqlMacroTransitionStore(dialect, executor),
		systemWeightStore: new SqlBackendSystemWeightStore(dialect, executor),
		proseTemplateStore: new SqlClinicalProseTemplateStore(dialect, executor),
		proseTemplateUsageStore: new SqlClinicalProseTemplateUsageStore(
			dialect,
			executor,
		),
		patientStore: new SqlPatientStore(backend, executor),
	};
}

function createEventStore(
	storage: Awaited<ReturnType<typeof createSimpleEventStore>>,
): EventStore {
	return new EventStore({
		session: storage,
		persistent: storage,
		schemas: new Map(),
	});
}
