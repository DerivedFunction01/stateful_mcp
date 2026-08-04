import { KvCellStore } from "../cells/kv-cell-store";
import { SqlCellStore } from "../cells/sql-cell-store";
import type { CellStore } from "../cells/cell-service-types";
import {
	InMemoryClinicalDocumentProjectionStore,
	InMemorySignedDocumentArchive,
	KvClinicalDocumentProjectionStore,
	KvSignedDocumentArchive,
} from "../clinical/clinical-document-types";
import type {
	ClinicalDocumentProjectionStore,
	SignedDocumentArchive,
} from "../clinical/clinical-document-types";
import {
	SqlClinicalDocumentProjectionStore,
	SqlSignedDocumentArchive,
} from "../clinical/clinical-document-sql-stores";
import { KvMacroStore } from "../macros/kv-macro-store";
import { SqlMacroStore } from "../macros/sql-macro-store";
import type { MacroStore } from "../macros/macro-definition";
import { KvNotebookSessionStore } from "../notebook/kv-notebook-session-store";
import { SqlNotebookSessionStore } from "../notebook/sql-notebook-session-store";
import type { NotebookSessionStore } from "../notebook/notebook-session-store";
import { KvTransactionJournal } from "../transactions/kv-transaction-journal";
import { SqlTransactionJournal } from "../transactions/sql-transaction-journal";
import type { TransactionJournal } from "../transactions/transaction-types";
import { KvWorkspaceStore } from "../workspaces/kv-workspace-store";
import { SqlWorkspaceStore } from "../workspaces/sql-workspace-store";
import type { WorkspaceStore } from "../workspaces/workspace-store";
import {
	EventStore,
	JsonlKvBackend,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { SqlDialect } from "@stateful-mcp/core/translation/sql-compiler";
import { createEventStore as createSqlEventStore } from "@stateful-mcp/core/adapters/storage/sql/create-event-store";
import { createEventStore as createSimpleEventStore } from "@stateful-mcp/core/adapters/storage/simple/create-event-store";
import { JsonlKvBackend as SimpleJsonlKvBackend } from "@stateful-mcp/core/adapters/storage/simple/jsonl/backend";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";

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
	journal: TransactionJournal;
	projectionStore: ClinicalDocumentProjectionStore;
	archiveStore: SignedDocumentArchive;
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
	const eventStorage = await createSimpleEventStore(new SimpleMemoryKvBackend());
	const backend = new MemoryKvBackend();
	return {
		eventStore: createEventStore(eventStorage),
		workspaceStore: new KvWorkspaceStore(backend),
		cellStore: new KvCellStore(backend),
		notebookSessionStore: new KvNotebookSessionStore(backend),
		macroStore: new KvMacroStore(backend),
		journal: new KvTransactionJournal(backend),
		projectionStore: new InMemoryClinicalDocumentProjectionStore(),
		archiveStore: new InMemorySignedDocumentArchive(),
	};
}

async function createJsonlStores(basePath: string): Promise<StoreBuilderResult> {
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
		journal: new KvTransactionJournal(backend),
		projectionStore: new KvClinicalDocumentProjectionStore(backend),
		archiveStore: new KvSignedDocumentArchive(backend),
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
		journal: new SqlTransactionJournal(dialect, executor),
		projectionStore: new SqlClinicalDocumentProjectionStore(dialect, executor),
		archiveStore: new SqlSignedDocumentArchive(dialect, executor),
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
