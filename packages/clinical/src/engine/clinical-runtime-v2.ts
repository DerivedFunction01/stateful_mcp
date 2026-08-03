import type {
	DictionaryStore,
	EventStore,
	VariableService,
} from "@stateful-mcp/core";
import type { CellStore } from "../cells/cell-service-types";
import type { VariableCellService } from "../cells/variable-cell-service";
import type {
	ClinicalDocumentProjectionStore,
	SignedDocumentArchive,
} from "../clinical/clinical-document-types";
import type { CommandSyntaxProfile } from "../commands/command-syntax-profile";
import type { MacroStore } from "../macros/macro-definition";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type { SyncConfig } from "../sync/sync-rule-config";
import type { TransactionJournal } from "../transactions/transaction-types";
import type { WorkspaceStore } from "../workspaces/workspace-store";
import type { WorkspaceViewStateStore } from "../workspaces/workspace-view-state";

/**
 * Injectable configuration holder for  engine services.
 * The builder produces a populated runtime from store implementations.
 */
export interface ClinicalRuntime {
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
	syntaxProfile: CommandSyntaxProfile;
	variables: VariableService;
	variableCells: VariableCellService;
}
