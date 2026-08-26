import { mkdir, rename as renameFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	BUILTIN_KEYMAP_PROFILES,
	keymapBindingConflicts,
	matchEffectiveBindings,
	resolveKeymapBindings,
} from "@stateful-mcp/macro";
import {
	SUPPORTED_SETTINGS_SCOPES,
	serializeSettingsUiSnapshot,
} from "@stateful-mcp/macro/workspace/config/settings-projection";
import { translate } from "@stateful-mcp/macro/workspace/i18n/translation";
import {
	createMacroProject,
	getProjectFileTree,
	type MacroHost,
	type MacroProject,
	ServerUserPreferencesStore,
} from "@stateful-mcp/macro-host";
import {
	type ArtifactLifecycle,
	type EditorOperation,
	type EditorOperationResult,
	type EditorWorkspaceSnapshotDto,
	type FileTreeItemDto,
	type HostEvent,
	type HostEventType,
	type KeymapBindingContextDto,
	type KeymapBindingResolutionDto,
	MACRO_PROTOCOL_VERSION,
	type ProjectConfigurationDto,
	type ProjectExtensionGroupDraft,
	type ProjectExtensionGroupOperationResult,
	type ProjectExtensionGroupPatch,
	type ProjectMigrationJournalStatusDto,
	type ProjectMigrationRecoveryResultDto,
	type ProjectOperationResult,
	type SettingsApplyResult,
	type SettingsBundleOperation,
	type SettingsBundleResult,
	type SettingsOperation,
	type SettingsScope,
	type SettingsUiOperation,
	type SettingsUiSnapshotDto,
	type UserPreferencesDto,
	type UserPreferencesExportBundleDto,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { ArtifactService } from "./artifacts/artifact-service";
import { executePersistenceOperation } from "./editor/document-persistence-operations";
import { createEditorOperationRouter } from "./editor/editor-operation-service";
import { toEditorPayload } from "./editor/editor-projections";
import { rejectedEditorResult } from "./editor/editor-result";
import {
	editorLinesForOperation as extractedEditorLinesForOperation,
	editorSnapshot as extractedEditorSnapshot,
} from "./editor/editor-snapshot";
import {
	executeExecutionOperation,
	toExecutionReceiptDto,
	withExecutionIdentity,
} from "./editor/execution-operations";
import { executeResourceOperation } from "./editor/resource-operations";
import { executeTemplateOperation } from "./editor/template-operations";
import { SessionEventBus } from "./host-session/session-events";
import {
	createDisposalController,
	createSession,
	initProject as lifecycleInitProject,
	openProject as lifecycleOpenProject,
	stopFileTreeWatcher,
} from "./host-session/session-lifecycle";
import { SessionRegistry } from "./host-session/session-registry";
import type {
	HostSessionOptions,
	Session,
	SessionLifecycleContext,
} from "./host-session/session-types";
import { workspaceSnapshot as extractedWorkspaceSnapshot } from "./host-session/workspace-snapshot";
import {
	getProjectConfiguration as extractedGetProjectConfiguration,
	rejectUnsupportedProjectConfigurationFields as extractedRejectUnsupportedProjectConfigurationFields,
	updateProjectConfiguration as extractedUpdateProjectConfiguration,
} from "./project/project-configuration";
import {
	createProjectExtensionGroupServiceContext,
	ProjectExtensionGroupService,
} from "./project/project-extension-groups";
import {
	isWithinProjectRoot,
	ProjectPathError,
	resolveProjectAbsolutePath,
	resolveProjectRelativePath,
	validatePathSegment,
} from "./project/project-files";
import {
	createProjectMigrationServiceContext,
	ProjectMigrationService,
} from "./project/project-migrations";
import { projectResourceTree } from "./project/project-resource-projection";
import { SessionError } from "./session-error";
import {
	applySettingsBundleOperation,
	type SettingsBundleHost,
} from "./settings/settings-bundles";
import {
	applySettingsOperation,
	applySettingsUiOperation,
	type SettingsOperationHost,
	SettingsServiceError,
} from "./settings/settings-operations";
import { emptySettingsSnapshot as extractedEmptySettingsSnapshot } from "./settings/settings-projections";
import {
	applyValueAuthoringOperation,
	type ValueAuthoringOperationHost,
} from "./settings/value-authoring-operations";

export {
	prepareImportedBundle,
	redactSensitiveBundle,
} from "./settings/settings-projections";
export { SessionError };

export class HostSessionManager {
	private readonly registry: SessionRegistry;
	private readonly eventBus: SessionEventBus;
	private readonly userPreferencesStore: ServerUserPreferencesStore;
	private readonly artifacts = new ArtifactService();
	private readonly editorOperations = createEditorOperationRouter({
		getSession: (sessionId) => this.getOrError(sessionId),
		base: (session, operation) => ({
			operation: operation.operation,
			requestId: operation.requestId,
			snapshot: this.editorSnapshot(session),
			workspaceSnapshot: this.snapshot(session),
			workspaceRevision: session.revision,
		}),
		conflict: (session, operation, documentId, expected, actual) => ({
			operation: operation.operation,
			requestId: operation.requestId,
			status: "conflict",
			code: "EDITOR_REVISION_STALE",
			messageKey: "editor.input.stale",
			snapshot: this.editorSnapshot(session),
			workspaceSnapshot: this.snapshot(session),
			workspaceRevision: session.revision,
			...(documentId ? { documentId } : {}),
			...(expected === undefined ? {} : { expectedTextRevision: expected }),
			...(actual === undefined ? {} : { actualTextRevision: actual }),
		}),
		workspaceConflict: (session, operation, expected) => ({
			operation: operation.operation,
			requestId: operation.requestId,
			status: "conflict",
			code: "EDITOR_WORKSPACE_REVISION_STALE",
			messageKey: "editor.input.stale",
			snapshot: this.editorSnapshot(session),
			workspaceSnapshot: this.snapshot(session),
			workspaceRevision: session.revision,
			expectedWorkspaceRevision: expected,
			actualWorkspaceRevision: session.revision,
		}),
		reject: (session, operation, error) =>
			rejectedEditorResult(session, operation, error, {
				editorSnapshot: (current) => this.editorSnapshot(current),
				workspaceSnapshot: (current) => this.snapshot(current),
			}),
		emit: (session, type) => this.emit(session, type),
		lines: extractedEditorLinesForOperation,
		executeExecution: executeExecutionOperation,
		executeResource: executeResourceOperation,
		executeTemplate: executeTemplateOperation,
		executePersistence: executePersistenceOperation,
		receipt: (receipt, operation, session) =>
			toExecutionReceiptDto(receipt, operation, session, {
				payload: (value, ownerId) =>
					toEditorPayload(value, { kind: "execution-result", ownerId }),
				message: (current, key) => this.message(current, key),
			}),
		identity: withExecutionIdentity,
		userRoot: () => this.projectRoot ?? process.cwd(),
		projectRoot: (session) => this.requireProjectRoot(session),
		resolvePath: (root, path) => this.resolveProjectPath(root, path, false),
		getArtifact: (token: string) => this.getArtifact(token),
		sessionOwner: (session) => session.id,
		isResourceExposed: (session, kind, resourceId) =>
			Boolean(
				session.loaded.project?.descriptor.scratchpadResources?.some(
					(reference) =>
						reference.kind === kind && reference.resourceId === resourceId,
				),
			),
		materializeArtifact: (session, token) =>
			this.materializeArtifact(session, token),
		openScratchpad: (session: Session, id: string, groupId?: string) =>
			this.openScratchpadDocument(session, id, groupId),
	});

	constructor(
		private readonly host: MacroHost,
		readonly idleTimeoutMs = 30 * 60 * 1000,
		private readonly projectRoot?: string,
		preferencesOptions?: { readonly dataFilePath?: string },
	) {
		this.userPreferencesStore = new ServerUserPreferencesStore(
			preferencesOptions,
		);
		this.registry = new SessionRegistry({
			idleTimeoutMs,
			disposal: createDisposalController(),
		});
		this.eventBus = new SessionEventBus({
			snapshotProvider: (session) => this.snapshot(session),
		});
	}

	registerArtifact(input: {
		data: Uint8Array;
		name: string;
		mimeType: string;
		lifecycle?: ArtifactLifecycle;
		expiresAt?: number;
		owner?: string;
		projectId?: string;
	}): string {
		return this.artifacts.register(input);
	}

	getArtifact(token: string) {
		return this.artifacts.get(token);
	}

	private async materializeArtifact(session: Session, token: string) {
		const artifact = this.artifacts.get(token);
		if (
			!artifact ||
			(artifact.owner !== undefined && artifact.owner !== session.id)
		)
			throw new SessionError(
				"ARTIFACT_UNAUTHORIZED",
				"artifact.unauthorized",
				false,
			);
		const project = session.loaded.project;
		if (!project)
			throw new SessionError("PROJECT_NOT_FOUND", "project.notFound", false);
		const resourceId = `artifact-${token}`;
		const safeName = artifact.name.replace(/[^a-zA-Z0-9._-]/g, "_");
		const directory = join(project.rootPath, ".macro-artifacts");
		await mkdir(directory, { recursive: true });
		await writeFile(
			join(directory, `${resourceId}-${safeName}`),
			artifact.data,
		);
		await project.saveManifest(
			{
				...project.manifest,
				resources: [
					...project.manifest.resources.filter(
						(item) => item.resourceId !== resourceId,
					),
					{
						resourceId,
						kind: "artifact",
						metadata: { title: artifact.name, mimeType: artifact.mimeType },
					},
				],
			},
			project.descriptor.revision,
		);
		return { resourceId };
	}

	async getUserPreferences(): Promise<UserPreferencesDto> {
		return this.userPreferencesStore.loadPreferences();
	}

	async setUserPreferences(
		partial: Partial<UserPreferencesDto>,
	): Promise<UserPreferencesDto> {
		return this.userPreferencesStore.savePreferences(partial);
	}

	async exportUserPreferences(): Promise<UserPreferencesExportBundleDto> {
		return this.userPreferencesStore.exportBundle();
	}

	async importUserPreferences(
		bundle: UserPreferencesExportBundleDto,
	): Promise<UserPreferencesDto> {
		return this.userPreferencesStore.importBundle(bundle);
	}

	private lifecycleContext(): SessionLifecycleContext {
		return {
			host: this.host,
			eventBus: this.eventBus,
			registry: this.registry,
			snapshotProvider: (session) => this.snapshot(session),
			projectRootResolver: (session) => this.requireProjectRoot(session),
			projectRoot: this.projectRoot,
		};
	}

	async create(options: HostSessionOptions = {}): Promise<WorkspaceSnapshot> {
		const { snapshot } = await createSession(this.lifecycleContext(), options);
		return snapshot;
	}

	async openProject(
		sessionId: string,
		projectRoot: string,
	): Promise<WorkspaceSnapshot> {
		return lifecycleOpenProject(
			this.lifecycleContext(),
			sessionId,
			projectRoot,
		);
	}

	async initProject(
		sessionId: string,
		projectRoot: string,
		displayName?: string,
	): Promise<WorkspaceSnapshot> {
		return lifecycleInitProject(
			this.lifecycleContext(),
			sessionId,
			projectRoot,
			displayName,
		);
	}

	async createDirectory(
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }> {
		const trimmed = name.trim();
		if (
			!trimmed ||
			trimmed === "." ||
			trimmed === ".." ||
			trimmed.includes("/") ||
			trimmed.includes("\\") ||
			trimmed.includes("\0")
		) {
			throw new SessionError(
				"INVALID_REQUEST",
				"request.directoryName.invalid",
				false,
			);
		}
		let root: string;
		try {
			root = this.requireProjectRootForPath(parentPath);
		} catch {
			// No project is open covering this path; create directly on the filesystem.
			// This is the normal path when the Open Folder dialog is used before a project exists.
			const childPath = resolve(parentPath, trimmed);
			await mkdir(childPath);
			return { path: childPath };
		}
		const resolvedParent = isAbsolute(parentPath)
			? this.resolveProjectPathAbsolute(root, parentPath)
			: this.resolveProjectPath(root, parentPath);
		const childPath = this.resolveProjectPath(
			root,
			join(relative(root, resolvedParent), trimmed),
		);
		await mkdir(childPath);
		return { path: childPath };
	}

	async createProjectDirectory(
		sessionId: string,
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }> {
		const session = this.getOrError(sessionId);
		const root = this.requireProjectRoot(session);
		this.validateSegment(name);
		const parent = this.resolveProjectPath(root, parentPath || ".");
		const childPath = this.resolveProjectPath(
			root,
			join(relative(root, parent), name),
		);
		await mkdir(childPath);
		this.emitFileTreeChanged(session);
		return { path: relative(root, childPath).split(sep).join("/") };
	}

	async getFileTree(sessionId: string): Promise<readonly FileTreeItemDto[]> {
		return getProjectFileTree(
			this.requireProjectRoot(this.getOrError(sessionId)),
		);
	}

	async createFile(
		sessionId: string,
		parentPath: string,
		name: string,
	): Promise<{ readonly path: string }> {
		const root = this.requireProjectRoot(this.getOrError(sessionId));
		this.validateSegment(name);
		const path = this.resolveProjectPath(root, join(parentPath, name));
		await writeFile(path, "", { flag: "wx" });
		this.emitFileTreeChanged(this.getOrError(sessionId));
		return { path: relative(root, path).split(sep).join("/") };
	}

	async renamePath(
		sessionId: string,
		source: string,
		destination: string,
	): Promise<void> {
		const session = this.getOrError(sessionId);
		const root = this.requireProjectRoot(session);
		const from = this.resolveProjectPath(root, source, false);
		const to = this.resolveProjectPath(root, destination, false);
		if (from === root || to === root)
			throw new SessionError(
				"INVALID_REQUEST",
				"project.root.renameForbidden",
				false,
			);
		for (const document of session.loaded.workspace.documents.list()) {
			if (
				document.dirty &&
				document.filePath &&
				(document.filePath === from ||
					document.filePath.startsWith(`${from}${sep}`))
			)
				throw new SessionError(
					"INVALID_REQUEST",
					"project.rename.dirtyDocuments",
					false,
				);
		}
		await renameFile(from, to);
		for (const document of session.loaded.workspace.documents.list()) {
			if (!document.filePath) continue;
			if (
				document.filePath === from ||
				document.filePath.startsWith(`${from}${sep}`)
			) {
				const updated = to + document.filePath.slice(from.length);
				session.loaded.workspace.documents.saveAsFile(
					document.documentId,
					updated,
				);
			}
		}
		this.emit(session, "workspace.changed");
		this.emitFileTreeChanged(session);
	}

	async deletePath(sessionId: string, target: string): Promise<void> {
		const session = this.getOrError(sessionId);
		const root = this.requireProjectRoot(session);
		const path = this.resolveProjectPath(root, target, false);
		if (path === root)
			throw new SessionError(
				"INVALID_REQUEST",
				"project.root.deleteForbidden",
				false,
			);
		for (const document of session.loaded.workspace.documents.list()) {
			if (
				document.filePath === path ||
				document.filePath?.startsWith(`${path}${sep}`)
			)
				throw new SessionError(
					"INVALID_REQUEST",
					"project.delete.openDocuments",
					false,
				);
		}
		await rm(path, { recursive: true, force: false });
		this.emitFileTreeChanged(session);
	}

	private requireProjectRoot(session: Session): string {
		const root = session.loaded.project?.rootPath;
		if (!root)
			throw new SessionError("PROJECT_NOT_OPENED", "project.notOpened", false);
		return resolve(root);
	}

	private requireProjectRootForPath(path: string): string {
		const resolved = resolve(path);
		const session = [...this.registry.ids()]
			.map((id) => this.registry.get(id))
			.find(
				(candidate) =>
					candidate?.loaded.project?.rootPath &&
					isWithinProjectRoot(candidate.loaded.project.rootPath, resolved),
			);
		if (
			!session &&
			this.projectRoot &&
			isWithinProjectRoot(this.projectRoot, resolved)
		)
			return resolve(this.projectRoot);
		if (!session)
			throw new SessionError("PROJECT_NOT_OPENED", "project.notOpened", false);
		return this.requireProjectRoot(session);
	}

	private resolveProjectPath(
		root: string,
		child: string,
		allowRoot = true,
	): string {
		try {
			return resolveProjectRelativePath(root, child, allowRoot);
		} catch (error) {
			if (error instanceof ProjectPathError)
				throw new SessionError(
					error.code,
					error.messageKey,
					error.retryable,
					error.messageParams,
				);
			throw error;
		}
	}

	private resolveProjectPathAbsolute(root: string, child: string): string {
		try {
			return resolveProjectAbsolutePath(root, child);
		} catch (error) {
			if (error instanceof ProjectPathError)
				throw new SessionError(
					error.code,
					error.messageKey,
					error.retryable,
					error.messageParams,
				);
			throw error;
		}
	}

	private validateSegment(name: string): void {
		try {
			validatePathSegment(name);
		} catch (error) {
			if (error instanceof ProjectPathError)
				throw new SessionError(
					error.code,
					error.messageKey,
					error.retryable,
					error.messageParams,
				);
			throw error;
		}
	}

	private emitFileTreeChanged(session: Session): void {
		void getProjectFileTree(this.requireProjectRoot(session))
			.then((tree) =>
				this.emit(session, "project.fileTree.changed", undefined, { tree }),
			)
			.catch(() => undefined);
	}

	async saveAsProject(
		sessionId: string,
		projectRoot: string,
		displayName?: string,
	): Promise<WorkspaceSnapshot> {
		const session = this.getOrError(sessionId);
		const rootPath = resolve(projectRoot);
		const project = await createMacroProject({ rootPath, displayName });
		const documents = session.loaded.workspace.documents.list();
		for (const doc of documents) {
			if (doc.editor.getLines().length > 0) {
				await project.createHistory(doc.documentId, {
					title: doc.title,
					lines: doc.editor.getLines(),
				});
			}
		}
		return this.openProject(sessionId, rootPath);
	}

	async closeProject(sessionId: string): Promise<WorkspaceSnapshot> {
		const session = this.getOrError(sessionId);
		for (const unsub of session.unsubs) unsub();
		session.unsubs.length = 0;
		stopFileTreeWatcher(session);
		await session.loaded.workspace.dispose();

		const loaded = await this.host.createWorkspace({});
		session.loaded = loaded;
		this.attachSignals(session);
		this.emit(session, "workspace.changed");
		return this.snapshot(session);
	}

	getProjectConfiguration(sessionId: string): ProjectConfigurationDto {
		const session = this.getOrError(sessionId);
		const project = session.loaded.project;
		if (!project)
			throw new SessionError("PROJECT_REQUIRED", "project.required", false);
		return extractedGetProjectConfiguration(project, session.loaded);
	}

	private migrationService(sessionId: string): ProjectMigrationService {
		return new ProjectMigrationService(
			createProjectMigrationServiceContext({
				loaded: () =>
					this.get(sessionId)?.loaded ??
					(() => {
						throw new SessionError(
							"SESSION_NOT_FOUND",
							"session.notFound",
							false,
						);
					})(),
				requireProject: () => this.requireProject(this.getOrError(sessionId)),
				getConfiguration: () => this.getProjectConfiguration(sessionId),
				reloadProject: (rootPath) => this.openProject(sessionId, rootPath),
			}),
		);
	}

	async previewBackendMigration(
		sessionId: string,
		target: ProjectConfigurationDto["backend"],
	): Promise<ProjectOperationResult> {
		return this.migrationService(sessionId).preview(target);
	}

	async recoverBackendMigration(
		sessionId: string,
	): Promise<ProjectMigrationRecoveryResultDto> {
		return this.migrationService(sessionId).recover();
	}

	async getMigrationJournal(
		sessionId: string,
	): Promise<ProjectMigrationJournalStatusDto> {
		return this.migrationService(sessionId).journalStatus();
	}

	async discardBackendMigration(
		sessionId: string,
	): Promise<ProjectMigrationRecoveryResultDto> {
		return this.migrationService(sessionId).discard();
	}

	async resumeBackendMigration(
		sessionId: string,
	): Promise<ProjectOperationResult> {
		return this.migrationService(sessionId).resume();
	}

	async applyBackendMigration(
		sessionId: string,
		target: ProjectConfigurationDto["backend"],
		expectedRevision: string,
	): Promise<ProjectOperationResult> {
		return this.migrationService(sessionId).apply(target, expectedRevision);
	}

	async updateProjectConfiguration(
		sessionId: string,
		operation: {
			readonly configuration: Omit<
				ProjectConfigurationDto,
				"extensionGroups" | "activeExtensionGroupId"
			>;
			readonly expectedRevision: string;
		},
	): Promise<ProjectOperationResult> {
		const session = this.getOrError(sessionId);
		if (!session.loaded.project)
			throw new SessionError("PROJECT_REQUIRED", "project.required", false);
		return extractedUpdateProjectConfiguration(
			{
				requireProject: () => this.requireProject(session),
				loaded: () => session.loaded,
				getConfiguration: () => this.getProjectConfiguration(sessionId),
				reloadProject: (rootPath) => this.openProject(sessionId, rootPath),
				emitWorkspaceChanged: () => this.emit(session, "workspace.changed"),
			},
			operation,
		);
	}

	rejectUnsupportedProjectConfigurationFields(
		sessionId: string,
		fields: readonly string[],
	): ProjectOperationResult {
		return extractedRejectUnsupportedProjectConfigurationFields(
			{ getConfiguration: () => this.getProjectConfiguration(sessionId) },
			fields,
		);
	}

	// ---- Extension Activation Groups ---------------------------------------

	private groupService(sessionId: string): ProjectExtensionGroupService {
		return new ProjectExtensionGroupService(
			createProjectExtensionGroupServiceContext({
				loaded: () => this.get(sessionId)?.loaded,
				requireProject: () => this.requireProject(this.getOrError(sessionId)),
				getConfiguration: () => this.getProjectConfiguration(sessionId),
				reloadProject: (rootPath) => this.openProject(sessionId, rootPath),
				emitWorkspaceChanged: () =>
					this.emit(this.getOrError(sessionId), "workspace.changed"),
			}),
		);
	}

	previewExtensionGroup(
		sessionId: string,
		request: {
			readonly groupId?: string;
			readonly extensionIds?: readonly string[];
			readonly setActive?: boolean;
		} = {},
	): ProjectExtensionGroupOperationResult {
		return this.groupService(sessionId).preview(request);
	}

	async createExtensionGroup(
		sessionId: string,
		request: {
			readonly group: ProjectExtensionGroupDraft;
			readonly expectedRevision: string;
			readonly apply?: boolean;
		},
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.groupService(sessionId).create(request);
	}

	async updateExtensionGroup(
		sessionId: string,
		request: {
			readonly patch: ProjectExtensionGroupPatch;
			readonly expectedRevision: string;
			readonly apply?: boolean;
		},
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.groupService(sessionId).update(request);
	}

	async duplicateExtensionGroup(
		sessionId: string,
		request: {
			readonly sourceGroupId: string;
			readonly displayName?: string;
			readonly groupId?: string;
			readonly setActive?: boolean;
			readonly expectedRevision: string;
			readonly apply?: boolean;
		},
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.groupService(sessionId).duplicate(request);
	}

	async deleteExtensionGroup(
		sessionId: string,
		request: {
			readonly groupId: string;
			readonly replacementGroupId?: string;
			readonly clearActive?: boolean;
			readonly expectedRevision: string;
			readonly apply?: boolean;
		},
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.groupService(sessionId).delete(request);
	}

	async setActiveExtensionGroup(
		sessionId: string,
		request: {
			readonly groupId: string | null;
			readonly expectedRevision: string;
			readonly apply?: boolean;
		},
	): Promise<ProjectExtensionGroupOperationResult> {
		return this.groupService(sessionId).setActive(request);
	}

	private requireProject(session: Session): MacroProject {
		const project = session.loaded.project;
		if (!project)
			throw new SessionError("PROJECT_REQUIRED", "project.required", false);
		return project;
	}

	get(sessionId: string): Session | undefined {
		return this.registry.get(sessionId);
	}

	getOrError(sessionId: string): Session {
		return this.registry.getOrError(sessionId);
	}

	subscribe(
		sessionId: string,
		listener: (event: HostEvent) => void,
	): () => void {
		const session = this.getOrError(sessionId);
		return this.eventBus.subscribe(session, listener);
	}

	snapshotFor(sessionId: string): WorkspaceSnapshot {
		return this.snapshot(this.getOrError(sessionId));
	}

	async executeCommand(
		sessionId: string,
		command: string,
		args: readonly unknown[] = [],
		_expectedRevision?: number,
	): Promise<{ result: unknown; snapshot: WorkspaceSnapshot }> {
		const session = this.getOrError(sessionId);
		const result = await session.loaded.workspace.commands.executeCommand(
			command,
			...args,
		);
		this.emit(session, "command.completed");
		return { result, snapshot: this.snapshot(session) };
	}

	async selectKeymap(
		sessionId: string,
		profileId: string,
	): Promise<WorkspaceSnapshot> {
		const session = this.getOrError(sessionId);
		const profile = BUILTIN_KEYMAP_PROFILES[profileId];
		if (!profile)
			throw new SessionError(
				"KEYMAP_PROFILE_UNKNOWN",
				"keymap.profileUnknown",
				false,
			);
		// Per-window selection only. Never mutate other sessions or the
		// canonical default profile.
		session.keymap = profile;
		this.emit(session, "keymap.changed");
		return this.snapshot(session);
	}

	async resolveBinding(
		sessionId: string,
		chord: string,
		context: KeymapBindingContextDto,
	): Promise<KeymapBindingResolutionDto> {
		const session = this.getOrError(sessionId);
		const bindings = resolveKeymapBindings(session.keymap);
		const matched = matchEffectiveBindings(
			bindings,
			chord,
			context.editorMode,
			context,
		);
		if (!matched) {
			return {
				chord,
				diagnostics: [
					{
						severity: "info",
						messageKey: "keymap.noBinding",
						code: "no-binding",
					},
				],
			};
		}
		const conflicts = keymapBindingConflicts(session.keymap).filter(
			(conflict) => conflict.chord === matched.chords[0],
		);
		return {
			chord,
			command: matched.command,
			source: "macro-profile",
			diagnostics: conflicts.map((conflict) => ({
				severity: "warning" as const,
				messageKey: "keymap.conflict",
				code: "duplicate-binding",
			})),
		};
	}

	private settingsHost(sessionId: string): SettingsOperationHost {
		return {
			message: (_workspace, key, params) =>
				this.message(this.getOrError(sessionId), key, params),
			supportedScopes: (_workspace) =>
				this.supportedScopes(this.getOrError(sessionId)),
			settingsSnapshot: (_workspace) =>
				this.settingsSnapshot(this.getOrError(sessionId)),
			emitSettingsChanged: (_workspace) =>
				this.emit(this.getOrError(sessionId), "settings.changed"),
		};
	}

	private bundleHost(sessionId: string): SettingsBundleHost {
		return {
			message: (_workspace, key, params) =>
				this.message(this.getOrError(sessionId), key, params),
			supportedScopes: (_workspace) =>
				this.supportedScopes(this.getOrError(sessionId)),
			settingsSnapshot: (_workspace) =>
				this.settingsSnapshot(this.getOrError(sessionId)),
		};
	}

	async settings(
		sessionId: string,
		operation: SettingsOperation,
	): Promise<SettingsApplyResult> {
		const session = this.getOrError(sessionId);
		try {
			return await applySettingsOperation(
				this.settingsHost(sessionId),
				session,
				operation,
			);
		} catch (error) {
			if (error instanceof SettingsServiceError) {
				const mapped = error.toHostError();
				throw new SessionError(
					error.code,
					mapped.messageKey,
					mapped.retryable,
					mapped.messageParams,
				);
			}
			throw error;
		}
	}

	async settingsUi(
		sessionId: string,
		operation: SettingsUiOperation,
	): Promise<SettingsApplyResult> {
		const session = this.getOrError(sessionId);
		try {
			return await applySettingsUiOperation(
				this.settingsHost(sessionId),
				session,
				operation,
			);
		} catch (error) {
			if (error instanceof SettingsServiceError) {
				const mapped = error.toHostError();
				throw new SessionError(
					error.code,
					mapped.messageKey,
					mapped.retryable,
					mapped.messageParams,
				);
			}
			throw error;
		}
	}

	async settingsBundle(
		sessionId: string,
		operation: SettingsBundleOperation,
	): Promise<SettingsBundleResult> {
		const session = this.getOrError(sessionId);
		try {
			return await applySettingsBundleOperation(
				this.bundleHost(sessionId),
				session,
				operation,
			);
		} catch (error) {
			if (error instanceof SettingsServiceError) {
				const mapped = error.toHostError();
				throw new SessionError(
					error.code,
					mapped.messageKey,
					mapped.retryable,
					mapped.messageParams,
				);
			}
			throw error;
		}
	}

	async valueAuthoring(
		sessionId: string,
		operation: import("@stateful-mcp/macro-protocol").ValueAuthoringOperation,
	): Promise<import("@stateful-mcp/macro-protocol").ValueAuthoringResult> {
		const session = this.getOrError(sessionId);
		const host: ValueAuthoringOperationHost = {
			supportedScopes: (_workspace) => this.supportedScopes(session),
			emitSettingsChanged: (_workspace) =>
				this.emit(session, "settings.changed"),
		};
		try {
			return await applyValueAuthoringOperation(host, session, operation);
		} catch (error) {
			if (error instanceof SettingsServiceError) {
				const mapped = error.toHostError();
				throw new SessionError(
					error.code,
					mapped.messageKey,
					mapped.retryable,
					mapped.messageParams,
				);
			}
			throw error;
		}
	}

	async editor(
		sessionId: string,
		operation: EditorOperation,
	): Promise<EditorOperationResult> {
		const session = this.getOrError(sessionId);
		return this.handleEditorOperation(sessionId, operation);
	}

	async handleEditorOperation(
		sessionId: string,
		operation: EditorOperation,
	): Promise<EditorOperationResult> {
		const session = this.getOrError(sessionId);
		const result = await this.editorOperations.execute(sessionId, operation);
		this.emit(session, "editor.operation.completed", result);
		return result;
	}

	private async openScratchpadDocument(
		session: Session,
		scratchpadId: string,
		groupId?: string,
	): Promise<
		{ readonly documentId: string; readonly textRevision: number } | undefined
	> {
		const project = session.loaded.project;
		if (!project) return undefined;
		const resource = await project.openScratchpad(scratchpadId);
		if (!resource) return undefined;
		const cellDefaults = new Map<number, string>();
		for (const cell of resource.lines ?? [])
			if (cell.defaultMacroId)
				cellDefaults.set(cell.lineNumber - 1, cell.defaultMacroId);
		const document = session.loaded.workspace.documents.openScratchpadResource({
			scratchpadId: resource.scratchpadId,
			title: resource.title,
			rawText: resource.rawText,
			executedLineIndices: resource.executedLineIndices,
			cellDefaults,
		});
		if (groupId)
			session.loaded.workspace.editorGroups.openDocument(
				groupId,
				document.documentId,
			);
		return {
			documentId: document.documentId,
			textRevision: document.textRevision,
		};
	}

	async dispose(sessionId: string): Promise<boolean> {
		return this.registry.dispose(sessionId);
	}

	private editorSnapshot(session: Session): EditorWorkspaceSnapshotDto {
		return extractedEditorSnapshot(session);
	}

	async disposeAbandoned(now = Date.now()): Promise<void> {
		await this.registry.disposeAbandoned(now);
	}

	async disposeAll(): Promise<void> {
		await this.registry.disposeAll();
	}

	private attachSignals(session: Session): void {
		const signalSources = [
			session.loaded.workspace.settings,
			session.loaded.workspace.layout,
			session.loaded.workspace.commands,
			session.loaded.workspace.tabs,
			session.loaded.workspace.views,
			session.loaded.workspace.i18n,
			session.loaded.workspace.editorGroups,
			session.loaded.workspace.journal,
		];
		for (const source of signalSources) {
			if (
				source &&
				"subscribe" in source &&
				typeof source.subscribe === "function"
			) {
				session.unsubs.push(
					source.subscribe(() => this.emit(session, "workspace.changed")),
				);
			}
		}
	}

	private emit(
		session: Session,
		type: HostEventType,
		result?: EditorOperationResult,
		additionalPayload?: Record<string, unknown>,
	): void {
		if (session.disposed) return;
		session.sequence += 1;
		session.revision += 1;
		const snapshot = this.snapshot(session);
		const eventResult = result
			? {
					...result,
					snapshot: snapshot.editor,
					workspaceSnapshot: snapshot,
					workspaceRevision: session.revision,
				}
			: undefined;
		const event: HostEvent = {
			version: MACRO_PROTOCOL_VERSION,
			eventId: randomUUID(),
			type,
			sessionId: session.id,
			sequence: session.sequence,
			revision: session.revision,
			payload: {
				snapshot,
				...additionalPayload,
				...(eventResult ? { result: eventResult } : {}),
			},
		};
		for (const listener of session.listeners) listener(event);
	}

	private snapshot(session: Session): WorkspaceSnapshot {
		return extractedWorkspaceSnapshot(session, {
			editorSnapshot: (current) => this.editorSnapshot(current),
			projectResourceTree,
			emptySettingsSnapshot: extractedEmptySettingsSnapshot,
			supportedScopes: (current) => this.supportedScopes(current),
			serializeSettings: serializeSettingsUiSnapshot,
		});
	}

	private supportedScopes(session: Session): SettingsScope[] {
		return [...SUPPORTED_SETTINGS_SCOPES];
	}

	private message(
		session: Session,
		key: string,
		params?: Readonly<Record<string, string | number>>,
	): string {
		return translate(session.loaded.workspace.i18n, key, params) || key;
	}

	private settingsSnapshot(session: Session): SettingsUiSnapshotDto {
		const uiModel = session.loaded.workspace.settingsUiModel;
		if (!uiModel)
			return extractedEmptySettingsSnapshot(
				"base",
				this.supportedScopes(session),
			);
		return serializeSettingsUiSnapshot(uiModel.getSnapshot(), {
			supportedScopes: this.supportedScopes(session),
			i18n: session.loaded.workspace.i18n,
			settingsRevision: uiModel.getSettingsRevision(),
		});
	}
}

import { randomUUID } from "node:crypto";
