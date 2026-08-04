import { createMockCaseIdentity } from "@stateful-mcp/clinical/bootstrap/mock-patient";
import { ClinicalBootstrap } from "@stateful-mcp/clinical/bootstrap/bootstrap";
import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine-v2";
import { CommandBarService } from "@stateful-mcp/clinical/commands/command-bar-service";
import { VariableCommandService } from "@stateful-mcp/clinical/commands/variable-command-service";
import type { VariableCellService } from "@stateful-mcp/clinical/cells/variable-cell-service";
import { createNotebookSession, type NotebookSession } from "./notebook-session";
import type { NotebookSessionStore } from "@stateful-mcp/clinical/notebook/notebook-session-store";
import type { ClinicalBootstrapResult } from "@stateful-mcp/clinical/bootstrap/bootstrap";
import type { CommandSyntaxProfile } from "@stateful-mcp/clinical";

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
	stores?: ClinicalBootstrapResult["stores"];
	clinical?: ClinicalBootstrapResult;
}

export class Cli2BootstrapBuilder {
	static async fromConfig(
		config: { backend: "memory" | "sqlite" | "jsonl"; dbPath?: string },
		options: Omit<Cli2BootstrapOptions, "stores" | "clinical"> = {},
	): Promise<Cli2BootstrapResult> {
		return buildCli2Bootstrap({
			...options,
			clinical: await ClinicalBootstrap.fromConfig({
				backend: config.backend,
				dbPath: config.dbPath,
				syntaxProfile: options.syntaxProfile,
			}),
		});
	}

	static async withDefaultBackend(
		backend: "memory" | "sqlite" | "jsonl",
		options: Omit<Cli2BootstrapOptions, "stores" | "clinical"> & { dbPath?: string } = {},
	): Promise<Cli2BootstrapResult> {
		return this.fromConfig({ backend, dbPath: options.dbPath }, options);
	}

	static async withStores(
		stores: ClinicalBootstrapResult["stores"],
		options: Omit<Cli2BootstrapOptions, "stores" | "clinical"> = {},
	): Promise<Cli2BootstrapResult> {
		return this.withClinical(
			await ClinicalBootstrap.fromStores(stores, {
				syntaxProfile: options.syntaxProfile,
			}),
			options,
		);
	}

	static async withClinical(
		clinical: ClinicalBootstrapResult,
		options: Omit<Cli2BootstrapOptions, "clinical"> = {},
	): Promise<Cli2BootstrapResult> {
		return buildCli2Bootstrap({ ...options, clinical });
	}
}

export async function buildCli2Bootstrap(
	options: Cli2BootstrapOptions & { clinical: ClinicalBootstrapResult },
): Promise<Cli2BootstrapResult> {
	const { clinical, stores } = options;
	const engine = clinical.engine;
	const runtime = clinical.runtime;
	const commandBar = new CommandBarService(
		engine,
		engine.getWorkspaceService(),
		clinical.syntaxProfile,
		new VariableCommandService(runtime.variables),
		runtime.variableCells,
	);
	const sessionId = options.sessionId ?? `cli2-${Date.now()}`;
	const sessionStore =
		stores?.notebookSessionStore ??
		clinical.stores.notebookSessionStore;
	const existingSession = await sessionStore.get(sessionId);
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
		await sessionStore.save({
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
		syntaxProfile: clinical.syntaxProfile,
		sessionStore,
	});
	return {
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		notebookSessionStore: sessionStore,
		notebook,
		sessionId,
		syntaxProfile: clinical.syntaxProfile,
		caseIdentity,
		bootstrapStatus,
	};
}
