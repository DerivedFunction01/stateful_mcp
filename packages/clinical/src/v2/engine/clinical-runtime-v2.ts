import type { EventStore } from "@stateful-mcp/core";
import type { TransactionJournal } from "../transactions/transaction-types";
import type { WorkspaceStore } from "../workspaces/workspace-store";
import type { CellStore } from "../cells/cell-service-types";
import type { ClinicalDocumentProjectionStore, SignedDocumentArchive } from "../clinical/clinical-document-types";
import type { WorkspaceViewStateStore } from "../workspaces/workspace-view-state";
import type { SyncConfig } from "../sync/sync-rule-config";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type { MacroStore } from "../macros/macro-definition";
import type { DictionaryStore } from "@stateful-mcp/core";

/**
 * Injectable configuration holder for V2 engine services.
 * The builder produces a populated runtime from store implementations.
 */
export interface ClinicalRuntimeV2 {
	stores: {
		eventStore: EventStore;
		transactionJournal: TransactionJournal;
		workspaceStore: WorkspaceStore;
		cellStore: CellStore;
		clinicalProjectionStore: ClinicalDocumentProjectionStore;
		signedDocumentArchive: SignedDocumentArchive;
		viewStateStore: WorkspaceViewStateStore;
		syncConfig?: SyncConfig;
	};
	macros: {
		schemaRegistry: SchemaRegistry;
		defs: MacroStore;
		dictionary: DictionaryStore;
	};
}