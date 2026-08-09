import type {
	ClinicalProseTemplateStore,
	CommandHistoryStore,
	CommandSyntaxProfile,
	MacroStore,
	PatientStore,
	ProseRenderContext,
	ProseTemplateUsageStore,
	UnifiedProfileStore,
} from "@stateful-mcp/clinical";
import { createPatientRenderContext } from "@stateful-mcp/clinical";
import type { ClinicalBootstrapResult } from "@stateful-mcp/clinical/bootstrap/bootstrap";
import { ClinicalBootstrap } from "@stateful-mcp/clinical/bootstrap/bootstrap";
import { createMockCaseIdentity } from "@stateful-mcp/clinical/bootstrap/mock-patient";
import { createDefaultNotebookUiState } from "@stateful-mcp/clinical/bootstrap/notebook-ui-defaults";
import type { VariableCellService } from "@stateful-mcp/clinical/cells/variable-cell-service";
import { CommandBarService } from "@stateful-mcp/clinical/commands/command-bar-service";
import { VariableCommandService } from "@stateful-mcp/clinical/commands/variable-command-service";
import type { ClinicalEngine } from "@stateful-mcp/clinical/engine/clinical-engine-v2";
import type { NotebookSessionStore } from "@stateful-mcp/clinical/notebook/notebook-session-store";
import type { SetupSourceStore } from "@stateful-mcp/clinical";
import type { DocumentPlacementRef } from "@stateful-mcp/clinical";
import type { MacroDefinition } from "@stateful-mcp/clinical";
import type { DictionaryStore } from "@stateful-mcp/core";
import type { ConceptFilterStore } from "@stateful-mcp/core";
import {
	defaultEditorKeymapProfile,
	mergeEditorKeymap,
} from "../../bootstrap/editor-keymap-defaults";
import type { EditorKeymapProfile } from "../../lib/editor/editor-keymap-profile";
import {
	DEFAULT_CLINICAL_IDE_PROFILE,
	type ClinicalIdeProfile,
} from "@stateful-mcp/clinical";
import {
	createNotebookSession,
	type NotebookSession,
} from "./notebook-session";
import { resolveInitialSession } from "./resolver";

function hasIdePerformance(payload: unknown): payload is ClinicalIdeProfile {
	if (typeof payload !== "object" || payload === null) return false;
	const performance = (payload as Record<string, unknown>).performance;
	return (
		typeof performance === "object" &&
		performance !== null &&
		typeof (performance as Record<string, unknown>).parseDebounceMs === "number"
	);
}

export interface Cli2BootstrapResult {
	engine: ClinicalEngine;
	commandBar: CommandBarService;
	variableCells: VariableCellService;
	macroStore: MacroStore & { set(macro: MacroDefinition): Promise<void> };
	notebookSessionStore: NotebookSessionStore;
	notebook: NotebookSession;
	sessionId: string;
	syntaxProfile: CommandSyntaxProfile;
	editorKeymap: EditorKeymapProfile;
	profileStore: UnifiedProfileStore;
	ideProfile: ClinicalIdeProfile;
	commandHistoryStore: CommandHistoryStore;
	proseTemplateStore: ClinicalProseTemplateStore;
	proseTemplateUsageStore: ProseTemplateUsageStore;
	proseRenderContext: ProseRenderContext;
	patientStore: PatientStore;
	setupSourceStore: SetupSourceStore;
	dictionary: DictionaryStore;
	conceptFilterStore: ConceptFilterStore;
	documentPlacements: DocumentPlacementRef[];
	patient: ReturnType<typeof createMockCaseIdentity>["patient"];
	caseIdentity: ReturnType<typeof createMockCaseIdentity>;
	bootstrapStatus: "created" | "resumed" | "error";
	bootstrapError?: string;
}

export interface Cli2BootstrapOptions {
	sessionId?: string;
	syntaxProfile?: CommandSyntaxProfile;
	editorKeymap?: EditorKeymapProfile;
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
		options: Omit<Cli2BootstrapOptions, "stores" | "clinical"> & {
			dbPath?: string;
		} = {},
	): Promise<Cli2BootstrapResult> {
		return Cli2BootstrapBuilder.fromConfig(
			{ backend, dbPath: options.dbPath },
			options,
		);
	}

	static async withStores(
		stores: ClinicalBootstrapResult["stores"],
		options: Omit<Cli2BootstrapOptions, "stores" | "clinical"> = {},
	): Promise<Cli2BootstrapResult> {
		return buildCli2Bootstrap({
			...options,
			clinical: await ClinicalBootstrap.fromConfig({
				backend: "memory",
				syntaxProfile: options.syntaxProfile,
			}),
			stores,
		});
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
	const editorKeymap = mergeEditorKeymap(
		defaultEditorKeymapProfile,
		options.editorKeymap,
	);
	const commandBar = new CommandBarService(
		engine,
		engine.getWorkspaceService(),
		clinical.syntaxProfile,
		new VariableCommandService(runtime.variables),
		runtime.variableCells,
	);
	const sessionStore =
		stores?.notebookSessionStore ?? clinical.stores.notebookSessionStore;
	const profileStore = stores?.profileStore ?? clinical.stores.profileStore;
	const ideProfileRecords = await profileStore.list();
	const ideProfileRecord =
		ideProfileRecords.find((profile) => profile.kind === "ide" && profile.active) ??
		ideProfileRecords.find(
			(profile) => profile.profileId === DEFAULT_CLINICAL_IDE_PROFILE.profileId,
		);
	const ideProfile =
		ideProfileRecord?.kind === "ide" &&
		hasIdePerformance(ideProfileRecord.payload)
			? (ideProfileRecord.payload as ClinicalIdeProfile)
			: DEFAULT_CLINICAL_IDE_PROFILE;
	const commandHistoryStore =
		stores?.commandHistoryStore ?? clinical.stores.commandHistoryStore;
	const patientStore = stores?.patientStore ?? clinical.stores.patientStore;
	const sessionId = await resolveInitialSession(
		sessionStore,
		options.sessionId,
	);
	const existingSession = await sessionStore.get(sessionId);
	const caseIdentity = createMockCaseIdentity(sessionId);
	let patient = await patientStore.get(caseIdentity.patient.id);
	if (!patient) {
		patient = caseIdentity.patient;
		await patientStore.set(patient);
	}
	let bootstrapStatus: Cli2BootstrapResult["bootstrapStatus"] = "resumed";
	let bootstrapError: string | undefined;
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
			uiState: createDefaultNotebookUiState(sessionId),
			revision: 0,
			updatedAt: new Date().toISOString(),
		});
		bootstrapStatus = "created";
	} else {
		try {
			if (!existingSession.workspaceId || !existingSession.documentId) {
				bootstrapStatus = "error";
				bootstrapError = `CLI2 session '${sessionId}' has no persisted binding`;
			} else {
				const document = await engine.getDocument(existingSession.documentId);
				const workspace = await engine
					.getWorkspaceService()
					.getWorkspace(existingSession.workspaceId);
				if (!document) {
					bootstrapStatus = "error";
					bootstrapError = `CLI2 document '${existingSession.documentId}' was not found`;
				} else if (!workspace) {
					bootstrapStatus = "error";
					bootstrapError = `CLI2 workspace '${existingSession.workspaceId}' was not found`;
				} else if (workspace.sourceDocumentId !== existingSession.documentId) {
					bootstrapStatus = "error";
					bootstrapError = `CLI2 session '${sessionId}' binding is inconsistent`;
				}
			}
		} catch (cause) {
			bootstrapStatus = "error";
			bootstrapError = `CLI2 session '${sessionId}' recovery: ${cause instanceof Error ? cause.message : String(cause)}`;
		}
	}
	if (existingSession?.documentId) {
		const persistedDocument = await engine.getDocument(
			existingSession.documentId,
		);
		if (persistedDocument) {
			const persistedPatient = await patientStore.get(
				persistedDocument.patientId,
			);
			if (persistedPatient) patient = persistedPatient;
		}
	}
	const notebook = createNotebookSession({
		sessionId,
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		syntaxProfile: clinical.syntaxProfile,
		sessionStore,
	});
	const setupStore = stores?.setupSourceStore ?? clinical.stores.setupSourceStore;
	const setupSources = await setupStore.list();
	const documentPlacements = setupSources[0]?.placements ?? [];
	return {
		engine,
		commandBar,
		variableCells: runtime.variableCells,
		macroStore: stores?.macroStore ?? clinical.stores.macroStore,
		notebookSessionStore: sessionStore,
		notebook,
		sessionId,
		syntaxProfile: clinical.syntaxProfile,
		editorKeymap,
		profileStore,
		ideProfile,
		commandHistoryStore,
		proseTemplateStore:
			stores?.proseTemplateStore ?? clinical.stores.proseTemplateStore,
		proseTemplateUsageStore:
			stores?.proseTemplateUsageStore ??
			clinical.stores.proseTemplateUsageStore,
		proseRenderContext: createPatientRenderContext(
			clinical.proseRenderContext,
			patient,
		),
		patientStore,
		setupSourceStore: setupStore,
		dictionary: clinical.dictionary,
		conceptFilterStore: stores?.conceptFilterStore ?? clinical.stores.conceptFilterStore,
		documentPlacements,
		patient,
		caseIdentity,
		bootstrapStatus,
		bootstrapError,
	};
}
