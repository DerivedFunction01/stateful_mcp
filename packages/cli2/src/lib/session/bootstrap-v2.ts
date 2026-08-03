import { KvCellStore } from "@stateful-mcp/clinical/v2/cells/kv-cell-store";
import { V2CellCompiler } from "@stateful-mcp/clinical/v2/cells/v2-cell-compiler";
import type { V2VariableCellService } from "@stateful-mcp/clinical/v2/cells/variable-cell-service";
import { V2CommandBarService } from "@stateful-mcp/clinical/v2/commands/command-bar-service";
import {
	createV2CommandSyntaxProfile,
	type V2CommandSyntaxProfile,
} from "@stateful-mcp/clinical/v2/commands/command-syntax-profile";
import { V2VariableCommandService } from "@stateful-mcp/clinical/v2/commands/variable-command-service";
import type { ClinicalEngineV2 } from "@stateful-mcp/clinical/v2/engine/clinical-engine-v2";
import { ClinicalEngineV2Builder } from "@stateful-mcp/clinical/v2/engine/clinical-engine-v2-builder";
import { KvMacroStore } from "@stateful-mcp/clinical/v2/macros/kv-macro-store";
import { createV2SyntaxProfile } from "@stateful-mcp/clinical/v2/macros/macro-profile";
import { KvNotebookSessionStore } from "@stateful-mcp/clinical/v2/notebook/kv-notebook-session-store";
import type { V2NotebookSessionStore } from "@stateful-mcp/clinical/v2/notebook/notebook-session-store";
import { initializeV2ColdStart } from "@stateful-mcp/clinical/v2/bootstrap/v2-cold-start";
import { KvWorkspaceStore } from "@stateful-mcp/clinical/v2/workspaces/kv-workspace-store";
import {
	createEventStore,
	EventStore,
	MemoryKvBackend,
	VariableServiceStore,
} from "@stateful-mcp/core";
import { MemoryKvBackend as SimpleMemoryKvBackend } from "@stateful-mcp/core/adapters/storage/simple/memory/backend";
import { InMemoryConceptResolver } from "@stateful-mcp/core/middleware/dictionary/resolver";
import { DictionaryStore } from "@stateful-mcp/core/middleware/dictionary/store";
import {
	createV2NotebookSession,
	type V2NotebookSession,
} from "./v2-notebook-session";

export interface V2BootstrapResult {
	engine: ClinicalEngineV2;
	commandBar: V2CommandBarService;
	variableCells: V2VariableCellService;
	notebookSessionStore: V2NotebookSessionStore;
	notebook: V2NotebookSession;
	sessionId: string;
	syntaxProfile: V2CommandSyntaxProfile;
}

/**
 * Native CLI2 bootstrap. This intentionally has no legacy ClinicalEngine or
 * NotebookStore dependency. V2 cell compilation is wired; macro definitions
 * remain an explicit store seam until durable definitions are configured.
 */
export async function bootstrapV2Session(
	options: { sessionId?: string; syntaxProfile?: V2CommandSyntaxProfile } = {},
): Promise<V2BootstrapResult> {
	const eventStorage = await createEventStore(new SimpleMemoryKvBackend());
	const eventStore = new EventStore({
		session: eventStorage,
		persistent: eventStorage,
		schemas: new Map(),
	});
	const syntaxProfile =
		options.syntaxProfile ??
		createV2CommandSyntaxProfile({
			profileId: "cli2-default",
			default: true,
			active: true,
		});
	const dictionary = new DictionaryStore(new InMemoryConceptResolver());
	const macroStore = new KvMacroStore(new MemoryKvBackend());
	const notebookSessionStore = new KvNotebookSessionStore(
		new MemoryKvBackend(),
	);
	const coldStart = await initializeV2ColdStart({ dictionary, macroStore, commandProfile: syntaxProfile });
	const schemaRegistry = coldStart.schemaRegistry;
	const cellCompiler = new V2CellCompiler(
		macroStore,
		schemaRegistry,
		dictionary,
		createV2SyntaxProfile({
			...syntaxProfile,
			profileId: syntaxProfile.profileId,
		}),
	);
	const engine = new ClinicalEngineV2Builder()
		.withEventStore(eventStore)
		.withSchemaRegistry(schemaRegistry)
		.withMacroStore(macroStore)
		.withDictionary(dictionary)
		.withWorkspaceStore(new KvWorkspaceStore(new MemoryKvBackend()))
		.withCellStore(new KvCellStore(new MemoryKvBackend()))
		.withCellCompiler(cellCompiler.compile.bind(cellCompiler))
		.withSyntaxProfile(syntaxProfile)
		.withVariableService(new VariableServiceStore())
		.build();
	const runtime = engine.getRuntime();
	const commandBar = new V2CommandBarService(
		engine,
		engine.getWorkspaceService(),
		syntaxProfile,
		new V2VariableCommandService(runtime.variables),
		runtime.variableCells,
	);

	const sessionId = options.sessionId ?? `cli2-${Date.now()}`;
	if (!(await notebookSessionStore.get(sessionId)))
		await notebookSessionStore.save({
			sessionId,
			cellOrder: [],
			commandHistory: [],
			revision: 0,
			updatedAt: new Date().toISOString(),
		});
	const notebook = createV2NotebookSession({
		sessionId,
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		syntaxProfile,
		sessionStore: notebookSessionStore,
	});
	return {
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		notebookSessionStore,
		notebook,
		sessionId,
		syntaxProfile,
	};
}
