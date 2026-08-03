import { initializeColdStart } from "@stateful-mcp/clinical/bootstrap/cold-start";
import { createMockCaseIdentity } from "@stateful-mcp/clinical/bootstrap/mock-patient";
import { KvCellStore } from "@stateful-mcp/clinical/cells/kv-cell-store";
import { CellCompiler } from "@stateful-mcp/clinical/cells/cell-compiler";
import type { VariableCellService } from "@stateful-mcp/clinical/cells/variable-cell-service";
import { CommandBarService } from "@stateful-mcp/clinical/commands/command-bar-service";
import {
	type CommandSyntaxProfile,
	createCommandSyntaxProfile,
} from "@stateful-mcp/clinical/commands/command-syntax-profile";
import { VariableCommandService } from "@stateful-mcp/clinical/commands/variable-command-service";
import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine-v2";
import { ClinicalEngineBuilder } from "@stateful-mcp/clinical/engine/clinical-engine-v2-builder";
import { KvMacroStore } from "@stateful-mcp/clinical/macros/kv-macro-store";
import { createSyntaxProfile } from "@stateful-mcp/clinical/macros/macro-profile";
import { KvNotebookSessionStore } from "@stateful-mcp/clinical/notebook/kv-notebook-session-store";
import type { NotebookSessionStore } from "@stateful-mcp/clinical/notebook/notebook-session-store";
import { KvWorkspaceStore } from "@stateful-mcp/clinical/workspaces/kv-workspace-store";
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
	createNotebookSession,
	type NotebookSession,
} from "./v2-notebook-session";

export interface BootstrapResult {
	engine: ClinicalEngine;
	commandBar: CommandBarService;
	variableCells: VariableCellService;
	notebookSessionStore: NotebookSessionStore;
	notebook: NotebookSession;
	sessionId: string;
	syntaxProfile: CommandSyntaxProfile;
	caseIdentity: ReturnType<typeof createMockCaseIdentity>;
	bootstrapStatus: "created" | "resumed";
}

/**
 * Native CLI2 bootstrap. This intentionally has no legacy ClinicalEngine or
 * NotebookStore dependency.  cell compilation is wired; macro definitions
 * remain an explicit store seam until durable definitions are configured.
 */
export async function bootstrapSession(
	options: { sessionId?: string; syntaxProfile?: CommandSyntaxProfile } = {},
): Promise<BootstrapResult> {
	const eventStorage = await createEventStore(new SimpleMemoryKvBackend());
	const eventStore = new EventStore({
		session: eventStorage,
		persistent: eventStorage,
		schemas: new Map(),
	});
	const syntaxProfile =
		options.syntaxProfile ??
		createCommandSyntaxProfile({
			profileId: "cli2-default",
			default: true,
			active: true,
		});
	const dictionary = new DictionaryStore(new InMemoryConceptResolver());
	const macroStore = new KvMacroStore(new MemoryKvBackend());
	const notebookSessionStore = new KvNotebookSessionStore(
		new MemoryKvBackend(),
	);
	const coldStart = await initializeColdStart({
		dictionary,
		macroStore,
		commandProfile: syntaxProfile,
	});
	const schemaRegistry = coldStart.schemaRegistry;
	const cellCompiler = new CellCompiler(
		macroStore,
		schemaRegistry,
		dictionary,
		createSyntaxProfile({
			...syntaxProfile,
			profileId: syntaxProfile.profileId,
		}),
	);
	const engine = new ClinicalEngineBuilder()
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
	const commandBar = new CommandBarService(
		engine,
		engine.getWorkspaceService(),
		syntaxProfile,
		new VariableCommandService(runtime.variables),
		runtime.variableCells,
	);

	const sessionId = options.sessionId ?? `cli2-${Date.now()}`;
	const existingSession = await notebookSessionStore.get(sessionId);
	const caseIdentity = createMockCaseIdentity(sessionId);
	let bootstrapStatus: BootstrapResult["bootstrapStatus"] = "resumed";
	if (!existingSession) {
		const document = await engine.initializeClinicalDocument({
			kind: "document_initialized",
			documentId: caseIdentity.documentId,
			sessionId,
			patientId: caseIdentity.patient.id,
			initialState: {
				patient: caseIdentity.patient,
			},
		});
		const workspace = await engine.getWorkspaceService().createWorkspace({
			sessionId,
			sourceDocumentId: document.documentId,
			workspaceId: caseIdentity.workspaceId,
			initialBranches: [],
		});
		if (workspace.sourceDocumentId !== document.documentId)
			throw new Error("CLI2 bootstrap created an unlinked workspace");
		await notebookSessionStore.save({
			sessionId,
			cellOrder: [],
			workspaceId: workspace.id,
			documentId: document.documentId,
			commandHistory: [],
			revision: 0,
			updatedAt: new Date().toISOString(),
		});
		bootstrapStatus = "created";
	} else {
		if (!existingSession.workspaceId || !existingSession.documentId)
			throw new Error(
				`CLI2 session '${sessionId}' has no persisted workspace/document binding`,
			);
		const document = await engine.getDocument(existingSession.documentId);
		const workspace = await engine
			.getWorkspaceService()
			.getWorkspace(existingSession.workspaceId);
		if (!document)
			throw new Error(
				`CLI2 session '${sessionId}' document '${existingSession.documentId}' was not found`,
			);
		if (!workspace)
			throw new Error(
				`CLI2 session '${sessionId}' workspace '${existingSession.workspaceId}' was not found`,
			);
		if (workspace.sourceDocumentId !== existingSession.documentId)
			throw new Error(
				`CLI2 session '${sessionId}' workspace/document binding is inconsistent`,
			);
	}
	const notebook = createNotebookSession({
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
		caseIdentity,
		bootstrapStatus,
	};
}
