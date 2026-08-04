import { initializeColdStart } from "@stateful-mcp/clinical/bootstrap/cold-start";
import { _COMMAND_SYNTAX_DEFAULTS } from "@stateful-mcp/clinical/bootstrap";
import { createMockCaseIdentity } from "@stateful-mcp/clinical/bootstrap/mock-patient";
import { StoreBuilder } from "@stateful-mcp/clinical/bootstrap/store-builder";
import { CellCompiler } from "@stateful-mcp/clinical/cells/cell-compiler";
import type { VariableCellService } from "@stateful-mcp/clinical/cells/variable-cell-service";
import { CommandBarService } from "@stateful-mcp/clinical/commands/command-bar-service";
import {
	createCommandSyntaxProfile,
	type CommandSyntaxProfile,
} from "@stateful-mcp/clinical/commands/command-syntax-profile";
import { VariableCommandService } from "@stateful-mcp/clinical/commands/variable-command-service";
import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine-v2";
import { ClinicalEngineBuilder } from "@stateful-mcp/clinical/engine/clinical-engine-v2-builder";
import { createSyntaxProfile } from "@stateful-mcp/clinical/macros/macro-profile";
import type { NotebookSessionStore } from "@stateful-mcp/clinical/notebook/notebook-session-store";
import { VariableServiceStore } from "@stateful-mcp/core";
import { InMemoryConceptResolver } from "@stateful-mcp/core/middleware/dictionary/resolver";
import { DictionaryStore } from "@stateful-mcp/core/middleware/dictionary/store";
import {
	loadJsonConfigCandidates,
	readJsonConfigFile,
	resolveConfigDir,
} from "@stateful-mcp/core/config/loader";
import * as path from "node:path";
import {
	type Cli2Backend,
	type Cli2BootstrapStores,
	type Cli2StoreConfig,
	} from "./bootstrap-stores";
import {
	createNotebookSession,
	type NotebookSession,
} from "./v2-notebook-session";

export interface Cli2BootstrapResult {
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

export interface Cli2BootstrapOptions {
	sessionId?: string;
	syntaxProfile?: CommandSyntaxProfile;
	stores?: Cli2BootstrapStores;
}

export class Cli2BootstrapBuilder {
	static async fromConfig(
		config: Cli2StoreConfig,
		options: Omit<Cli2BootstrapOptions, "stores"> = {},
	): Promise<Cli2BootstrapResult> {
		return buildCli2Bootstrap({
			...options,
			stores: await StoreBuilder.fromConfig(config),
		});
	}

	static async withDefaultBackend(
		backend: Cli2Backend,
		options: Omit<Cli2BootstrapOptions, "stores"> & { dbPath?: string } = {},
	): Promise<Cli2BootstrapResult> {
		return this.fromConfig(
			{ backend, dbPath: options.dbPath },
			options,
		);
	}

	static async fromConfigFile(
		filePath: string,
		options: Omit<Cli2BootstrapOptions, "stores"> = {},
	): Promise<Cli2BootstrapResult> {
		const config = await readJsonConfigFile<Cli2StoreConfig>(filePath);
		return this.fromConfig(config, options);
	}

	static async fromConfigDir(
		dir?: string,
		options: Omit<Cli2BootstrapOptions, "stores"> = {},
	): Promise<Cli2BootstrapResult> {
		const root = dir ?? resolveConfigDir();
		const config = await loadJsonConfigCandidates<Cli2StoreConfig>([
			{ path: path.join(root, "config", "cli2.config.json"), optional: true },
			{ path: path.join(root, "cli2.config.json"), optional: true },
		]);
		return this.fromConfig(config ?? { backend: "memory" }, options);
	}

	static async withStores(
		stores: Cli2BootstrapStores,
		options: Omit<Cli2BootstrapOptions, "stores"> = {},
	): Promise<Cli2BootstrapResult> {
		return buildCli2Bootstrap({ ...options, stores });
	}
}

export async function buildCli2Bootstrap(
	options: Cli2BootstrapOptions & { stores: Cli2BootstrapStores },
): Promise<Cli2BootstrapResult> {
	const { stores } = options;
	const syntaxProfile =
		options.syntaxProfile ??
		createCommandSyntaxProfile({
			profileId: "cli2-default",
			default: true,
			active: true,
		}, _COMMAND_SYNTAX_DEFAULTS);
	const dictionary = new DictionaryStore(new InMemoryConceptResolver());
	const coldStart = await initializeColdStart({
		dictionary,
		macroStore: stores.macroStore as typeof stores.macroStore & {
			set(macro: import("@stateful-mcp/clinical/macros/macro-definition").MacroDefinition): Promise<void>;
		},
		commandProfile: syntaxProfile,
	});
	const cellCompiler = new CellCompiler(
		stores.macroStore,
		coldStart.schemaRegistry,
		dictionary,
		createSyntaxProfile({ ...syntaxProfile, profileId: syntaxProfile.profileId }),
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
	const existingSession = await stores.notebookSessionStore.get(sessionId);
	const caseIdentity = createMockCaseIdentity(sessionId);
	let bootstrapStatus: Cli2BootstrapResult["bootstrapStatus"] = "resumed";
	if (!existingSession) {
		const document = await engine.initializeClinicalDocument({
			kind: "document_initialized",
			documentId: caseIdentity.documentId,
			sessionId,
			patientId: caseIdentity.patient.id,
			initialState: { patient: caseIdentity.patient },
		});
		const workspace = await engine.getWorkspaceService().createWorkspace({
			sessionId,
			sourceDocumentId: document.documentId,
			workspaceId: caseIdentity.workspaceId,
			initialBranches: [],
		});
		if (workspace.sourceDocumentId !== document.documentId)
			throw new Error("CLI2 bootstrap created an unlinked workspace");
		await stores.notebookSessionStore.save({
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
			throw new Error(`CLI2 session '${sessionId}' has no persisted binding`);
		const document = await engine.getDocument(existingSession.documentId);
		const workspace = await engine
			.getWorkspaceService()
			.getWorkspace(existingSession.workspaceId);
		if (!document)
			throw new Error(`CLI2 document '${existingSession.documentId}' was not found`);
		if (!workspace)
			throw new Error(`CLI2 workspace '${existingSession.workspaceId}' was not found`);
		if (workspace.sourceDocumentId !== existingSession.documentId)
			throw new Error(`CLI2 session '${sessionId}' binding is inconsistent`);
	}
	const notebook = createNotebookSession({
		sessionId,
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		syntaxProfile,
		sessionStore: stores.notebookSessionStore,
	});
	return {
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		notebookSessionStore: stores.notebookSessionStore,
		notebook,
		sessionId,
		syntaxProfile,
		caseIdentity,
		bootstrapStatus,
	};
}
