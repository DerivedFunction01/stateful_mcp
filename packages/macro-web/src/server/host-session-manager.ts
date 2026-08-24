import { randomUUID } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rename as renameFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { MacroProjectManifest } from "@stateful-mcp/macro";
import {
	BUILTIN_KEYMAP_PROFILES,
	DocumentManagerError,
	DocumentRevisionError,
	keymapBindingConflicts,
	type MacroDocument,
	type MacroDocumentTemplate,
	matchEffectiveBindings,
	normalizeCommandAliases,
	resolveKeymapBindings,
	type ScratchpadExecutionBatchResult,
	type ScratchpadExecutionReceipt,
} from "@stateful-mcp/macro";
import type { MacroDiagnostic } from "@stateful-mcp/macro/contracts/input";
import {
	SUPPORTED_SETTINGS_SCOPES,
	serializeSettingsUiSnapshot,
} from "@stateful-mcp/macro/workspace/config/settings-projection";
import type {
	SettingsBundlePayload,
	SettingsDiagnostic,
	SettingsSchemaEntry,
} from "@stateful-mcp/macro/workspace/config/settings-service";
import { translate } from "@stateful-mcp/macro/workspace/i18n/translation";
import {
	createMacroProject,
	getProjectFileTree,
	type MacroHost,
	type MacroProject,
	type ProjectMigrationJournal,
	type ProjectMigrationRecoveryResult,
	ServerUserPreferencesStore,
} from "@stateful-mcp/macro-host";
import {
	type CommandDescriptorDto,
	type DiagnosticDto,
	type DomainApplicationDescriptor,
	type EditorJsonValue,
	type EditorOperation,
	type EditorOperationResult,
	type EditorPayloadEnvelope,
	type EditorWorkspaceSnapshotDto,
	type EffectiveKeymapDto,
	type FileTreeItemDto,
	type HostEvent,
	type HostEventType,
	type KeymapBindingContextDto,
	type KeymapBindingDto,
	type KeymapBindingResolutionDto,
	MACRO_PROTOCOL_VERSION,
	type ProjectConfigurationDto,
	type ProjectConfigurationImpact,
	type ProjectExtensionAvailabilityDto,
	type ProjectExtensionDescriptorDto,
	type ProjectExtensionGroupDraft,
	type ProjectExtensionGroupOperationResult,
	type ProjectExtensionGroupPatch,
	type ProjectMigrationJournalDto,
	type ProjectMigrationJournalOwnerDto,
	type ProjectMigrationJournalStatusDto,
	type ProjectMigrationRecoveryAction,
	type ProjectMigrationRecoveryResultDto,
	type ProjectOperationResult,
	type ProjectSettingsContributionDto,
	type ScratchpadExecutionReceiptDto,
	type ScratchpadLineDto,
	type ScratchpadTemplateDescriptor,
	SETTINGS_REDACTION_MARKER,
	type SettingsApplyResult,
	type SettingsBundleDto,
	type SettingsBundleOperation,
	type SettingsBundleResult,
	type SettingsDiagnosticDto,
	type SettingsOperation,
	type SettingsPreviewDto,
	type SettingsSchemaEntryDto,
	type SettingsScope,
	type SettingsUiOperation,
	type SettingsUiSnapshotDto,
	type UserPreferencesDto,
	type UserPreferencesExportBundleDto,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	toEditorPayload as extractedToEditorPayload,
	toEditorDocumentDto,
	toEditorDocumentSnapshot,
	toEditorOutput,
	toScratchpadLineDto,
} from "./editor/editor-projections";
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
import {
	buildProjectSettingsContributions as extractedBuildProjectSettingsContributions,
	toProjectConfigurationDto as extractedToProjectConfigurationDto,
} from "./project/project-projections";
import { validateProjectConfiguration } from "./project-configuration-validation";
import {
	buildProjectExtensionCatalog,
	resolveActiveExtensionGroup,
	toProjectExtensionGroupDto,
	toProjectExtensionGroupResolutionDto,
	toResolverExtensions,
} from "./project-extension-groups";
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

export {
	prepareImportedBundle,
	redactSensitiveBundle,
} from "./settings/settings-projections";
export { SessionError };

export class HostSessionManager {
	private readonly registry: SessionRegistry;
	private readonly eventBus: SessionEventBus;
	private readonly userPreferencesStore: ServerUserPreferencesStore;

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
				"Directory name must be a single non-empty path segment",
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
				"Project root cannot be renamed",
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
					"Dirty open documents must be saved before rename",
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
				"Project root cannot be deleted",
				false,
			);
		for (const document of session.loaded.workspace.documents.list()) {
			if (
				document.filePath === path ||
				document.filePath?.startsWith(`${path}${sep}`)
			)
				throw new SessionError(
					"INVALID_REQUEST",
					"Open documents must be closed before delete",
					false,
				);
		}
		await rm(path, { recursive: true, force: false });
		this.emitFileTreeChanged(session);
	}

	private requireProjectRoot(session: Session): string {
		const root = session.loaded.project?.rootPath;
		if (!root)
			throw new SessionError("PROJECT_NOT_OPENED", "No project is open", false);
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
			throw new SessionError("PROJECT_NOT_OPENED", "No project is open", false);
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
				throw new SessionError(error.code, error.message, error.retryable);
			throw error;
		}
	}

	private resolveProjectPathAbsolute(root: string, child: string): string {
		try {
			return resolveProjectAbsolutePath(root, child);
		} catch (error) {
			if (error instanceof ProjectPathError)
				throw new SessionError(error.code, error.message, error.retryable);
			throw error;
		}
	}

	private validateSegment(name: string): void {
		try {
			validatePathSegment(name);
		} catch (error) {
			if (error instanceof ProjectPathError)
				throw new SessionError(error.code, error.message, error.retryable);
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

	private startFileTreeWatcher(session: Session): void {
		this.stopFileTreeWatcher(session);
		const root = session.loaded.project?.rootPath;
		if (!root) return;
		const onChange = (_event: string, filename: string | Buffer | null) => {
			const changedPath = filename?.toString().replaceAll("\\", "/") ?? "";
			if (
				changedPath
					.split("/")
					.some((part) => [".macro", ".macro-user", ".git"].includes(part))
			)
				return;
			if (session.fileTreeRefreshTimer)
				clearTimeout(session.fileTreeRefreshTimer);
			session.fileTreeRefreshTimer = setTimeout(() => {
				session.fileTreeRefreshTimer = undefined;
				this.emitFileTreeChanged(session);
				this.startFileTreeWatcher(session);
			}, 100);
		};
		void this.watchProjectDirectories(session, root, onChange);
	}

	private async watchProjectDirectories(
		session: Session,
		root: string,
		onChange: (event: string, filename: string | Buffer | null) => void,
	): Promise<void> {
		const watchers: FSWatcher[] = [];
		const visit = async (directory: string): Promise<void> => {
			let entries;
			try {
				entries = await readdir(directory, { withFileTypes: true });
			} catch {
				return;
			}
			try {
				watchers.push(watch(directory, onChange));
			} catch {
				return;
			}
			for (const entry of entries) {
				if (
					entry.isDirectory() &&
					![".macro", ".macro-user", ".git"].includes(entry.name)
				)
					await visit(resolve(directory, entry.name));
			}
		};
		await visit(root);
		if (session.disposed) {
			for (const watcher of watchers) watcher.close();
		} else {
			session.fileTreeWatchers = watchers;
		}
	}

	private stopFileTreeWatcher(session: Session): void {
		if (session.fileTreeRefreshTimer)
			clearTimeout(session.fileTreeRefreshTimer);
		session.fileTreeRefreshTimer = undefined;
		session.fileTreeWatcher?.close();
		session.fileTreeWatcher = undefined;
		for (const watcher of session.fileTreeWatchers ?? []) watcher.close();
		session.fileTreeWatchers = undefined;
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
			throw new SessionError(
				"PROJECT_REQUIRED",
				"A project workspace is required",
				false,
			);
		return extractedToProjectConfigurationDto(project, session.loaded);
	}

	private migrationService(sessionId: string): ProjectMigrationService {
		return new ProjectMigrationService(
			createProjectMigrationServiceContext({
				loaded: () =>
					this.get(sessionId)?.loaded ??
					(() => {
						throw new SessionError(
							"SESSION_NOT_FOUND",
							"Session not found",
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
		const project = session.loaded.project;
		if (!project)
			throw new SessionError(
				"PROJECT_REQUIRED",
				"A project workspace is required",
				false,
			);
		const current = project.manifest;
		const configuration = operation.configuration;
		if (
			Object.hasOwn(configuration, "extensionGroups") ||
			Object.hasOwn(configuration, "activeExtensionGroupId")
		)
			return {
				status: "rejected",
				message:
					"Extension Activation Groups must be changed through the group manager",
				diagnostics: [
					{
						code: "unsupportedProjectConfigurationField",
						severity: "error",
						message:
							"Project configuration field 'extensionGroups' or 'activeExtensionGroupId' is unsupported here",
					},
				],
			};
		if (
			configuration.backend.kind !== current.backend.kind ||
			configuration.backend.path !== current.backend.path
		)
			return {
				status: "migrationRequired",
				message: "Changing the project backend requires migration",
				configuration: this.getProjectConfiguration(sessionId),
			};
		if (!configuration.displayName.trim())
			return {
				status: "rejected",
				message: "Project display name is required",
			};
		const validationErrors = validateProjectConfiguration(
			configuration,
			session.loaded.workspace.i18n.getAvailableLocales(),
			extractedBuildProjectSettingsContributions(session.loaded),
		);
		if (validationErrors.length > 0)
			return {
				status: "rejected",
				message: validationErrors.join("; "),
				configuration: this.getProjectConfiguration(sessionId),
			};
		if (operation.expectedRevision !== project.descriptor.revision)
			return {
				status: "conflict",
				message: "Project configuration is stale",
				configuration: this.getProjectConfiguration(sessionId),
			};
		const candidate = {
			...current,
			displayName: configuration.displayName.trim(),
			uiLocale: configuration.uiLocale,
			extensions: configuration.extensions,
			templates: configuration.templates,
			projectSettings: configuration.projectSettings,
		};
		const impact: ProjectConfigurationImpact =
			JSON.stringify(current.templates) !==
				JSON.stringify(candidate.templates) ||
			JSON.stringify(current.projectSettings) !==
				JSON.stringify(candidate.projectSettings)
				? "templates"
				: current.uiLocale !== candidate.uiLocale ||
						JSON.stringify(current.extensions) !==
							JSON.stringify(candidate.extensions)
					? "workspaceReload"
					: "metadata";
		await project.saveManifest(candidate, operation.expectedRevision);
		if (impact === "workspaceReload") {
			const root = project.rootPath;
			return {
				status: "accepted",
				configuration: this.getProjectConfiguration(sessionId),
				impact,
				snapshot: await this.openProject(sessionId, root),
			};
		}
		this.emit(session, "workspace.changed");
		return {
			status: "accepted",
			configuration: this.getProjectConfiguration(sessionId),
			impact,
			snapshot: this.snapshot(session),
		};
	}

	rejectUnsupportedProjectConfigurationFields(
		sessionId: string,
		fields: readonly string[],
	): ProjectOperationResult {
		return {
			status: "rejected",
			message: "Extension Activation Groups have a dedicated manager",
			configuration: this.getProjectConfiguration(sessionId),
			diagnostics: fields.map((field) => ({
				code: "unsupportedProjectConfigurationField",
				severity: "error",
				message: `Project configuration field '${field}' is unsupported here`,
			})),
		};
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
			throw new SessionError(
				"PROJECT_REQUIRED",
				"A project workspace is required",
				false,
			);
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
						message:
							translate(session.loaded.workspace.i18n, "keymap.noBinding") ||
							"keymap.noBinding",
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
				message:
					translate(session.loaded.workspace.i18n, "keymap.conflict") ||
					"keymap.conflict",
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
			if (error instanceof SettingsServiceError)
				throw new SessionError(error.code, error.message, error.retryable);
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
			if (error instanceof SettingsServiceError)
				throw new SessionError(error.code, error.message, error.retryable);
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
			if (error instanceof SettingsServiceError)
				throw new SessionError(error.code, error.message, error.retryable);
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
		const result = await this.executeEditorOperation(sessionId, operation);
		this.emit(session, "editor.operation.completed", result);
		return result;
	}

	private async executeEditorOperation(
		sessionId: string,
		operation: EditorOperation,
	): Promise<EditorOperationResult> {
		const session = this.getOrError(sessionId);
		const workspace = session.loaded.workspace;
		const documents = workspace.documents;
		const base = () => ({
			operation: operation.operation,
			requestId: operation.requestId,
			snapshot: this.editorSnapshot(session),
			workspaceSnapshot: this.snapshot(session),
			workspaceRevision: session.revision,
		});
		const conflict = (
			documentId: string | undefined,
			expected: number | undefined,
			actual: number | undefined,
		): EditorOperationResult => ({
			...base(),
			status: "conflict",
			code: "EDITOR_REVISION_STALE",
			message: this.message(session, "editor.input.stale"),
			...(documentId ? { documentId } : {}),
			...(expected === undefined ? {} : { expectedTextRevision: expected }),
			...(actual === undefined ? {} : { actualTextRevision: actual }),
		});
		const workspaceConflict = (expected: number): EditorOperationResult => ({
			...base(),
			status: "conflict",
			code: "EDITOR_WORKSPACE_REVISION_STALE",
			message: this.message(session, "editor.input.stale"),
			expectedWorkspaceRevision: expected,
			actualWorkspaceRevision: session.revision,
		});

		try {
			switch (operation.operation) {
				case "editor.saveTemplate": {
					if (
						operation.template.source === "extension" ||
						operation.template.isReadonly
					)
						throw new DocumentManagerError(
							"EDITOR_TEMPLATE_READONLY",
							"Template is read-only",
						);
					const template: MacroDocumentTemplate = {
						templateId: operation.template.templateId,
						title: operation.template.title,
						...(operation.template.description
							? { description: operation.template.description }
							: {}),
						...(operation.template.initialText !== undefined
							? { initialText: operation.template.initialText }
							: {}),
						...(operation.template.cellDefaults
							? { cellDefaults: operation.template.cellDefaults }
							: {}),
						...(operation.template.tags
							? { tags: operation.template.tags }
							: {}),
						source: operation.scope,
					};
					const liveTemplateDocument = documents
						.list()
						.find(
							(document) =>
								document.providerId === "macro.template" &&
								document.templateId === template.templateId,
						);
					const savedTemplate: MacroDocumentTemplate = liveTemplateDocument
						? {
								...template,
								cellDefaults: [
									...liveTemplateDocument.cellDefaults.entries(),
								].map(([index, defaultMacroId]) => ({
									lineNumber: index + 1,
									defaultMacroId,
								})),
							}
						: template;
					if (operation.scope === "project") {
						const project = session.loaded.project;
						if (!project)
							throw new DocumentManagerError(
								"EDITOR_PROJECT_REQUIRED",
								"A project workspace is required",
							);
						const templates = [...(project.manifest.templates ?? [])].filter(
							(item) => item.templateId !== template.templateId,
						);
						await project.saveManifest(
							{
								...project.manifest,
								templates: [...templates, savedTemplate],
							} as MacroProjectManifest,
							project.descriptor.revision,
						);
					} else {
						const path = resolve(
							this.projectRoot ?? process.cwd(),
							".macro-user",
							"templates.json",
						);
						await mkdir(resolve(path, ".."), { recursive: true });
						const existing = await readFile(path, "utf8")
							.then((raw) => JSON.parse(raw) as MacroDocumentTemplate[])
							.catch(() => []);
						await writeFile(
							path,
							JSON.stringify(
								[
									...existing.filter(
										(item) => item.templateId !== template.templateId,
									),
									savedTemplate,
								],
								null,
								2,
							),
							"utf8",
						);
					}
					documents.saveTemplate(savedTemplate);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted" };
				}
				case "editor.deleteTemplate": {
					const existing = documents
						.getTemplates()
						.find((item) => item.templateId === operation.templateId);
					if (existing?.source === "extension" || existing?.isReadonly)
						throw new DocumentManagerError(
							"EDITOR_TEMPLATE_READONLY",
							"Template is read-only",
						);
					if (operation.scope === "project") {
						const project = session.loaded.project;
						if (!project)
							throw new DocumentManagerError(
								"EDITOR_PROJECT_REQUIRED",
								"A project workspace is required",
							);
						await project.saveManifest(
							{
								...project.manifest,
								templates: (project.manifest.templates ?? []).filter(
									(item) => item.templateId !== operation.templateId,
								),
							},
							project.descriptor.revision,
						);
					} else {
						const path = resolve(
							this.projectRoot ?? process.cwd(),
							".macro-user",
							"templates.json",
						);
						const existingUser = await readFile(path, "utf8")
							.then((raw) => JSON.parse(raw) as MacroDocumentTemplate[])
							.catch(() => []);
						await writeFile(
							path,
							JSON.stringify(
								existingUser.filter(
									(item) => item.templateId !== operation.templateId,
								),
								null,
								2,
							),
							"utf8",
						);
					}
					documents.deleteTemplate(operation.templateId);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted" };
				}
				case "editor.openTemplateAsDocument": {
					const document = documents.openTemplateForEditing(
						operation.templateId,
					);
					const targetGroupId =
						operation.groupId && workspace.editorGroups.get(operation.groupId)
							? operation.groupId
							: workspace.editorGroups.getActiveGroupId();
					if (targetGroupId && workspace.editorGroups.get(targetGroupId)) {
						workspace.editorGroups.moveDocument(
							document.documentId,
							targetGroupId,
						);
					}
					documents.select(document.documentId);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
					};
				}
				case "editor.updateTemplateLiteralArgs": {
					const tmpl = documents
						.getTemplates()
						.find((item) => item.templateId === operation.templateId);
					if (!tmpl)
						throw new DocumentManagerError(
							"EDITOR_TEMPLATE_NOT_FOUND",
							"Template not found",
						);
					if (tmpl.source === "extension" || tmpl.isReadonly)
						throw new DocumentManagerError(
							"EDITOR_TEMPLATE_READONLY",
							"Template is read-only",
						);
					const updatedTemplate: MacroDocumentTemplate = {
						...tmpl,
						templateLiteralArgs: operation.literalArgs,
					};
					if (operation.scope === "project") {
						const project = session.loaded.project;
						if (!project)
							throw new DocumentManagerError(
								"EDITOR_PROJECT_REQUIRED",
								"A project workspace is required",
							);
						const existingTemplates = [
							...(project.manifest.templates ?? []),
						].filter((item) => item.templateId !== operation.templateId);
						await project.saveManifest(
							{
								...project.manifest,
								templates: [...existingTemplates, updatedTemplate],
							} as MacroProjectManifest,
							project.descriptor.revision,
						);
					} else {
						const userPath = resolve(
							this.projectRoot ?? process.cwd(),
							".macro-user",
							"templates.json",
						);
						await mkdir(resolve(userPath, ".."), { recursive: true });
						const existingUser = await readFile(userPath, "utf8")
							.then((raw) => JSON.parse(raw) as MacroDocumentTemplate[])
							.catch(() => []);
						await writeFile(
							userPath,
							JSON.stringify(
								[
									...existingUser.filter(
										(item) => item.templateId !== operation.templateId,
									),
									updatedTemplate,
								],
								null,
								2,
							),
							"utf8",
						);
					}
					documents.saveTemplate(updatedTemplate);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted" };
				}
				case "editor.newScratchpad": {
					const document = documents.createBlank();
					const targetGroupId =
						operation.groupId && workspace.editorGroups.get(operation.groupId)
							? operation.groupId
							: workspace.editorGroups.getActiveGroupId();
					if (targetGroupId && workspace.editorGroups.get(targetGroupId)) {
						workspace.editorGroups.moveDocument(
							document.documentId,
							targetGroupId,
						);
					}
					documents.select(document.documentId);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
					};
				}
				case "editor.newScratchpadFromTemplate": {
					const document = documents.createFromTemplate(operation.templateId);
					const targetGroupId =
						operation.groupId && workspace.editorGroups.get(operation.groupId)
							? operation.groupId
							: workspace.editorGroups.getActiveGroupId();
					if (targetGroupId && workspace.editorGroups.get(targetGroupId)) {
						workspace.editorGroups.moveDocument(
							document.documentId,
							targetGroupId,
						);
					}
					documents.select(document.documentId);
					await document.session.parseAllLines();
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
					};
				}
				case "editor.selectDocument": {
					documents.select(operation.documentId);
					const activeGroup = workspace.editorGroups
						.list()
						.find((group) => group.activeDocumentId === operation.documentId);
					if (activeGroup) workspace.editorGroups.focus(activeGroup.groupId);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: operation.documentId,
					};
				}
				case "editor.openFile": {
					const root = this.requireProjectRoot(session);
					const path = this.resolveProjectPath(root, operation.path, false);
					const metadata = await stat(path);
					if (metadata.isDirectory())
						throw new SessionError(
							"INVALID_REQUEST",
							"Cannot open a directory",
							false,
						);
					if (metadata.size > 2 * 1024 * 1024)
						throw new SessionError(
							"FILE_NOT_EDITABLE_AS_TEXT",
							"File is too large to edit as text",
							false,
						);
					const bytes = await readFile(path);
					if (bytes.includes(0))
						throw new SessionError(
							"FILE_NOT_EDITABLE_AS_TEXT",
							"Binary files cannot be opened in the text editor",
							false,
						);
					const document = documents.openFile(path, bytes.toString("utf8"));
					documents.markSaved(document.documentId, metadata.mtimeMs);
					const activeGroup = workspace.editorGroups.get(
						operation.groupId ?? workspace.editorGroups.getActiveGroupId(),
					);
					if (activeGroup)
						workspace.editorGroups.openDocument(
							activeGroup.groupId,
							document.documentId,
						);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
					};
				}
				case "editor.save": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					// Template document: sync text back to template definition.
					if (document.providerId === "macro.template" && document.templateId) {
						const tmpl = documents
							.getTemplates()
							.find((item) => item.templateId === document.templateId);
						if (tmpl && tmpl.source !== "extension" && !tmpl.isReadonly) {
							const updatedTemplate: MacroDocumentTemplate = {
								...tmpl,
								initialText: document.editor.getLines().join("\n"),
							};
							const scope = tmpl.source ?? "user";
							if (scope === "project") {
								const project = session.loaded.project;
								if (project) {
									const existingTemplates = [
										...(project.manifest.templates ?? []),
									].filter((item) => item.templateId !== tmpl.templateId);
									await project.saveManifest(
										{
											...project.manifest,
											templates: [...existingTemplates, updatedTemplate],
										} as MacroProjectManifest,
										project.descriptor.revision,
									);
								}
							} else {
								const userPath = resolve(
									this.projectRoot ?? process.cwd(),
									".macro-user",
									"templates.json",
								);
								await mkdir(resolve(userPath, ".."), { recursive: true });
								const existingUser = await readFile(userPath, "utf8")
									.then((raw) => JSON.parse(raw) as MacroDocumentTemplate[])
									.catch(() => []);
								await writeFile(
									userPath,
									JSON.stringify(
										[
											...existingUser.filter(
												(item) => item.templateId !== tmpl.templateId,
											),
											updatedTemplate,
										],
										null,
										2,
									),
									"utf8",
								);
							}
							documents.saveTemplate(updatedTemplate);
							documents.markSaved(document.documentId);
							this.emit(session, "workspace.changed");
							return {
								...base(),
								status: "accepted",
								documentId: document.documentId,
								textRevision: document.textRevision,
							};
						}
					}
					if (document.providerId !== "file" || !document.filePath)
						return this.rejectedEditorResult(
							session,
							operation,
							"FILE_NOT_EDITABLE_AS_TEXT",
							"Document is not file-backed",
						);
					if (
						operation.expectedTextRevision !== undefined &&
						operation.expectedTextRevision !== document.textRevision
					)
						return conflict(
							document.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					const root = this.requireProjectRoot(session);
					const path = this.resolveProjectPath(
						root,
						relative(root, document.filePath),
						false,
					);
					const currentMetadata = await stat(path);
					if (
						!operation.force &&
						document.lastDiskMtime !== undefined &&
						currentMetadata.mtimeMs !== document.lastDiskMtime
					)
						return {
							...base(),
							status: "conflict",
							code: "EDITOR_EXTERNAL_CHANGE",
							message: "The file changed on disk. Reload or overwrite it.",
							documentId: document.documentId,
							path: relative(root, path).split(sep).join("/"),
							textRevision: document.textRevision,
						};
					const text = document.editor.getLines().join("\n");
					await writeFile(path, text, "utf8");
					const metadata = await stat(path);
					documents.markSaved(document.documentId, metadata.mtimeMs);
					this.emit(session, "workspace.changed");
					this.emitFileTreeChanged(session);
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
					};
				}
				case "editor.saveScratchpad": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (
						operation.expectedTextRevision !== undefined &&
						operation.expectedTextRevision !== document.textRevision
					)
						return conflict(
							document.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					const project = session.loaded.project;
					const scratchpadId =
						operation.scratchpadId ??
						(document.documentId.startsWith("scratchpad-")
							? document.documentId
							: `scratchpad-${document.documentId}`);
					const title = operation.title ?? document.title;
					const lines = document.editor.getLines().map((rawText, idx) => {
						const defaultMacroId = document.cellDefaults.get(idx);
						return {
							lineNumber: idx + 1,
							rawText,
							...(defaultMacroId ? { defaultMacroId } : {}),
						};
					});
					const executedLineIndices: number[] = [
						...document.session.getExecutedLineIndices(),
					];
					if (project) {
						await project.saveScratchpad({
							scratchpadId,
							formatVersion: 1,
							title,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							textRevision: document.textRevision,
							rawText: document.editor.getLines().join("\n"),
							lines,
							executedLineIndices,
							metadata: {},
						});
					}
					documents.markSaved(document.documentId);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
					};
				}
				case "editor.openScratchpad": {
					const project = session.loaded.project;
					if (!project)
						return this.rejectedEditorResult(
							session,
							operation,
							"PROJECT_NOT_FOUND",
							"No active project to load scratchpads from",
						);
					const resource = await project.openScratchpad(operation.scratchpadId);
					if (!resource)
						return this.rejectedEditorResult(
							session,
							operation,
							"SCRATCHPAD_NOT_FOUND",
							"Saved scratchpad not found",
						);
					const cellDefaults = new Map<number, string>();
					for (const cell of resource.lines ?? []) {
						if (cell.defaultMacroId) {
							cellDefaults.set(cell.lineNumber - 1, cell.defaultMacroId);
						}
					}
					const doc = documents.openScratchpadResource({
						scratchpadId: resource.scratchpadId,
						title: resource.title,
						rawText: resource.rawText,
						executedLineIndices: resource.executedLineIndices,
						cellDefaults,
					});
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: doc.documentId,
						textRevision: doc.textRevision,
					};
				}
				case "editor.deleteScratchpad": {
					const project = session.loaded.project;
					if (project) {
						await project.deleteScratchpad(operation.scratchpadId);
					}
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
					};
				}
				case "editor.createSplitGroup": {
					if (
						operation.expectedWorkspaceRevision !== undefined &&
						operation.expectedWorkspaceRevision !== session.revision
					)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					const group = workspace.editorGroups.create(operation);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted", groupId: group.groupId };
				}
				case "editor.closeGroup": {
					if (
						operation.expectedWorkspaceRevision !== undefined &&
						operation.expectedWorkspaceRevision !== session.revision
					)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					workspace.editorGroups.close(operation.groupId);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted", groupId: operation.groupId };
				}
				case "editor.resizeSplit": {
					if (
						operation.expectedWorkspaceRevision !== undefined &&
						operation.expectedWorkspaceRevision !== session.revision
					)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					workspace.editorGroups.resizeSplit(
						operation.nodeId,
						operation.ratios,
					);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted" };
				}
				case "editor.focusGroup": {
					if (
						operation.expectedWorkspaceRevision !== undefined &&
						operation.expectedWorkspaceRevision !== session.revision
					)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					workspace.editorGroups.focus(operation.groupId);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted", groupId: operation.groupId };
				}
				case "editor.openDocumentInGroup": {
					if (
						operation.expectedWorkspaceRevision !== undefined &&
						operation.expectedWorkspaceRevision !== session.revision
					)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					workspace.editorGroups.openDocument(
						operation.groupId,
						operation.documentId,
					);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						groupId: operation.groupId,
						documentId: operation.documentId,
					};
				}
				case "editor.moveDocumentToGroup": {
					if (
						operation.expectedWorkspaceRevision !== undefined &&
						operation.expectedWorkspaceRevision !== session.revision
					)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					workspace.editorGroups.moveDocument(
						operation.documentId,
						operation.groupId,
					);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						groupId: operation.groupId,
						documentId: operation.documentId,
					};
				}
				case "editor.closeDocument": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (
						operation.expectedTextRevision !== undefined &&
						operation.expectedTextRevision !== document.textRevision
					)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					documents.close(operation.documentId, operation.force ?? false);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: operation.documentId,
					};
				}
				case "editor.closeDocumentInGroup": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (
						operation.expectedTextRevision !== undefined &&
						operation.expectedTextRevision !== document.textRevision
					)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					workspace.editorGroups.closeDocumentInGroup(
						operation.groupId,
						operation.documentId,
					);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						groupId: operation.groupId,
						documentId: operation.documentId,
					};
				}
				case "editor.renameDocument": {
					documents.rename(operation.documentId, operation.title);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: operation.documentId,
					};
				}
				case "editor.setCellDefault": {
					if (
						operation.expectedTextRevision !== undefined &&
						operation.expectedTextRevision !==
							documents.get(operation.documentId)?.textRevision
					)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							documents.get(operation.documentId)?.textRevision ?? 0,
						);
					documents.setCellDefault(
						operation.documentId,
						operation.lineNumber - 1,
						operation.defaultMacroId,
					);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: operation.documentId,
					};
				}
				case "editor.replaceText": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (document.textRevision !== operation.expectedTextRevision)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					const updated = documents.replaceText({
						documentId: operation.documentId,
						lines: operation.lines,
						expectedTextRevision: operation.expectedTextRevision,
					});
					await updated.session.parseAllLines();
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: updated.documentId,
						textRevision: updated.textRevision,
					};
				}
				case "editor.previewLine":
				case "editor.previewRange":
				case "editor.previewDocument": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (document.textRevision !== operation.expectedTextRevision)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					await document.session.parseAllLines();
					if (
						(operation.operation === "editor.previewLine" &&
							(operation.lineNumber < 1 ||
								operation.lineNumber > document.session.getTotalLineCount())) ||
						(operation.operation === "editor.previewRange" &&
							(operation.startLine < 1 ||
								operation.endLine < operation.startLine ||
								operation.endLine > document.session.getTotalLineCount()))
					)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_RANGE_INVALID",
							this.message(session, "editor.execution.rangeInvalid"),
						);
					const lines = this.editorLinesForOperation(document, operation);
					return {
						...base(),
						status: "preview",
						documentId: document.documentId,
						textRevision: document.textRevision,
						lines,
					};
				}
				case "editor.executeLine": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (document.textRevision !== operation.expectedTextRevision)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					await document.session.parseAllLines();
					const status = document.session.getLineStatusByNumber(
						operation.lineNumber,
					);
					if (status !== "valid")
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_LINE_NOT_EXECUTABLE",
							this.message(session, "editor.execution.notExecutable"),
						);
					const receipt =
						await workspace.commands.executeCommand<ScratchpadExecutionReceipt | null>(
							"editor.executeLine",
							operation,
						);
					if (!receipt)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_LINE_NOT_EXECUTABLE",
							this.message(session, "editor.execution.failed"),
						);
					await session.loaded.workspace.journal.recordExecution(
						this.withExecutionIdentity(receipt, operation, document),
					);
					this.emit(session, "command.completed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
						receipts: [this.toExecutionReceiptDto(receipt, operation, session)],
					};
				}
				case "editor.executeRange": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (document.textRevision !== operation.expectedTextRevision)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					await document.session.parseAllLines();
					try {
						const result =
							await workspace.commands.executeCommand<ScratchpadExecutionBatchResult>(
								"editor.executeRange",
								operation,
							);
						for (const receipt of result.receipts)
							await session.loaded.workspace.journal.recordExecution(
								this.withExecutionIdentity(receipt, operation, document),
							);
						this.emit(session, "command.completed");
						return {
							...base(),
							status: "accepted",
							documentId: document.documentId,
							textRevision: document.textRevision,
							receipts: result.receipts.map((receipt) =>
								this.toExecutionReceiptDto(receipt, operation, session),
							),
							skippedLines: result.skippedLines,
						};
					} catch (error) {
						return this.rejectedEditorResult(
							session,
							operation,
							(error as { code?: string }).code ?? "EDITOR_RANGE_INVALID",
							(error as { code?: string }).code === "EDITOR_LINE_NOT_EXECUTABLE"
								? this.message(session, "editor.execution.notExecutable")
								: this.message(session, "editor.execution.rangeInvalid"),
						);
					}
				}
				case "editor.executeValidLines": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (document.textRevision !== operation.expectedTextRevision)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					await document.session.parseAllLines();
					const result =
						await workspace.commands.executeCommand<ScratchpadExecutionBatchResult>(
							"editor.executeValidLines",
							operation,
						);
					for (const receipt of result.receipts)
						await session.loaded.workspace.journal.recordExecution(
							this.withExecutionIdentity(receipt, operation, document),
						);
					this.emit(session, "command.completed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
						receipts: result.receipts.map((receipt) =>
							this.toExecutionReceiptDto(receipt, operation, session),
						),
						skippedLines: result.skippedLines,
					};
				}
				case "editor.clearExecutedLines": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					if (
						operation.expectedTextRevision !== undefined &&
						document.textRevision !== operation.expectedTextRevision
					)
						return conflict(
							operation.documentId,
							operation.expectedTextRevision,
							document.textRevision,
						);
					documents.clearExecutedLines(operation.documentId);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
					};
				}
				case "editor.resetExecutionState": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					documents.resetExecutionState(operation.documentId);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: document.documentId,
						textRevision: document.textRevision,
					};
				}
				case "editor.duplicateDocument": {
					const document = documents.get(operation.documentId);
					if (!document)
						return this.rejectedEditorResult(
							session,
							operation,
							"EDITOR_DOCUMENT_NOT_FOUND",
							this.message(session, "editor.document.notFound"),
						);
					const duplicated = documents.duplicateDocument(
						operation.documentId,
						operation.title,
					);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: duplicated.documentId,
						textRevision: duplicated.textRevision,
					};
				}
			}
		} catch (error) {
			if (error instanceof DocumentRevisionError)
				return conflict(
					"documentId" in operation ? operation.documentId : undefined,
					error.expectedRevision,
					error.actualRevision,
				);
			if (error instanceof DocumentManagerError)
				return this.rejectedEditorResult(
					session,
					operation,
					error.code,
					error.message,
				);
			return this.rejectedEditorResult(
				session,
				operation,
				"EDITOR_OPERATION_FAILED",
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async dispose(sessionId: string): Promise<boolean> {
		return this.registry.dispose(sessionId);
	}

	private rejectedEditorResult(
		session: Session,
		operation: EditorOperation,
		code: string,
		message: string,
	): EditorOperationResult {
		const localizedMessage = this.editorMessage(session, code, message);
		return {
			operation: operation.operation,
			requestId: operation.requestId,
			status: "rejected",
			code,
			message: localizedMessage,
			snapshot: this.editorSnapshot(session),
			workspaceSnapshot: this.snapshot(session),
			workspaceRevision: session.revision,
			...("documentId" in operation
				? { documentId: operation.documentId }
				: {}),
		};
	}

	private editorMessage(
		session: Session,
		code: string,
		fallback: string,
	): string {
		switch (code) {
			case "EDITOR_DOCUMENT_NOT_FOUND":
				return this.message(session, "editor.document.notFound");
			case "EDITOR_GROUP_NOT_FOUND":
				return this.message(session, "editor.group.notFound");
			case "EDITOR_LAST_GROUP":
				return this.message(session, "editor.group.last");
			case "EDITOR_DOCUMENT_DIRTY":
				return this.message(session, "editor.document.closeDirty");
			case "EDITOR_LAST_DOCUMENT":
				return this.message(session, "editor.document.last");
			case "EDITOR_TITLE_REQUIRED":
				return this.message(session, "editor.document.titleRequired");
			case "EDITOR_TEMPLATE_NOT_FOUND":
				return this.message(session, "editor.template.notFound");
			case "EDITOR_TEMPLATE_SEED_UNAVAILABLE":
				return this.message(session, "editor.template.seedUnavailable");
			case "EDITOR_OPERATION_FAILED":
				return this.message(session, "editor.operation.failed");
			default:
				return fallback;
		}
	}

	private editorSnapshot(session: Session): EditorWorkspaceSnapshotDto {
		const documents = session.loaded.workspace.documents;
		const active = documents.active();
		const templates: ScratchpadTemplateDescriptor[] = documents
			.getTemplates()
			.map((template) => ({
				templateId: template.templateId,
				providerId: "macro.text",
				title: template.title,
				...(template.description ? { description: template.description } : {}),
				...(template.cellDefaults
					? { cellDefaults: template.cellDefaults }
					: {}),
				...(template.sourceExtensionId
					? { sourceExtensionId: template.sourceExtensionId }
					: {}),
				...(template.requiresProfile ? { requiresProfile: true } : {}),
				...(template.initialText !== undefined
					? { initialText: template.initialText }
					: {}),
				...(template.tags ? { tags: template.tags } : {}),
				...(template.source ? { source: template.source } : {}),
				...(template.isReadonly ? { isReadonly: true } : {}),
			}));
		return {
			documents: documents
				.list()
				.map((document) => toEditorDocumentDto(document)),
			groups: session.loaded.workspace.editorGroups.list().map((group) => ({
				groupId: group.groupId,
				documentIds: group.documentIds,
				activeDocumentId: group.activeDocumentId,
				orientation: group.orientation,
				...(group.sizeRatio === undefined
					? {}
					: { sizeRatio: group.sizeRatio }),
			})),
			editorLayout: {
				version: 1,
				root: this.editorLayoutNodeDto(
					session.loaded.workspace.editorGroups.getLayoutRoot(),
					session.loaded.workspace.editorGroups,
				),
			},
			activeGroupId: session.loaded.workspace.editorGroups.getActiveGroupId(),
			activeDocumentId: documents.getActiveDocumentId(),
			activeDocument: active ? toEditorDocumentSnapshot(active) : null,
			loadedDocuments: Object.fromEntries(
				documents
					.list()
					.map((document) => [
						document.documentId,
						toEditorDocumentSnapshot(document),
					]),
			),
			templates,
			output: toEditorOutput(session.loaded.workspace.journal),
			capabilities: {
				canCreate: true,
				canExecute: Boolean(active),
				canPersist: true,
				canSplit: true,
				canUseVim: true,
			},
		};
	}

	private editorLayoutNodeDto(
		node: import("@stateful-mcp/macro").EditorLayoutNode,
		groups: import("@stateful-mcp/macro").MacroEditorGroupManager,
	): import("@stateful-mcp/macro-protocol").EditorLayoutNodeDto {
		if (node.kind === "group") {
			const group = groups.get(node.groupId);
			return {
				kind: "group",
				groupId: node.groupId,
				documentIds: group?.documentIds ?? [],
				activeDocumentId: group?.activeDocumentId ?? null,
			};
		}
		return {
			kind: "split",
			nodeId: node.nodeId,
			orientation: node.orientation,
			children: node.children.map((child) =>
				this.editorLayoutNodeDto(child, groups),
			),
		};
	}

	private editorLinesForOperation(
		document: MacroDocument,
		operation: {
			readonly operation: string;
			readonly lineNumber?: number;
			readonly startLine?: number;
			readonly endLine?: number;
		},
	): readonly ScratchpadLineDto[] {
		const lines = document.session.getProjectedLines().map((line, idx) =>
			toScratchpadLineDto({
				...line,
				isExecuted: document.session.isLineExecuted(idx),
			}),
		);
		if (operation.operation === "editor.previewDocument") return lines;
		if (operation.operation === "editor.previewLine")
			return lines.filter((line) => line.lineNumber === operation.lineNumber);
		return lines.filter(
			(line) =>
				line.lineNumber >= operation.startLine! &&
				line.lineNumber <= operation.endLine!,
		);
	}

	private toExecutionReceiptDto(
		receipt: {
			readonly lineNumber: number;
			readonly rawText: string;
			readonly macroId: string;
			readonly invokedAs?: string;
			readonly success: boolean;
			readonly result?: unknown;
			readonly error?: string;
			readonly executedAt: number;
		},
		operation: Extract<
			EditorOperation,
			{
				operation:
					| "editor.executeLine"
					| "editor.executeRange"
					| "editor.executeValidLines";
			}
		>,
		session: Session,
	): ScratchpadExecutionReceiptDto {
		return {
			documentId: operation.documentId,
			requestId: operation.requestId,
			textRevision:
				"expectedTextRevision" in operation &&
				operation.expectedTextRevision !== undefined
					? operation.expectedTextRevision
					: 0,
			lineNumber: receipt.lineNumber,
			rawText: receipt.rawText,
			macroId: receipt.macroId,
			...(receipt.invokedAs ? { invokedAs: receipt.invokedAs } : {}),
			success: receipt.success,
			...(receipt.result === undefined
				? {}
				: {
						result: extractedToEditorPayload(receipt.result, {
							kind: "execution-result",
							ownerId: receipt.macroId,
						}),
					}),
			...(receipt.error
				? {
						error: this.message(session, "editor.execution.failed"),
						errorCode: "EDITOR_EXECUTION_FAILED",
					}
				: {}),
			executedAt: receipt.executedAt,
		};
	}

	private withExecutionIdentity(
		receipt: ScratchpadExecutionReceipt,
		operation: Extract<
			EditorOperation,
			{
				operation:
					| "editor.executeLine"
					| "editor.executeRange"
					| "editor.executeValidLines";
			}
		>,
		document: MacroDocument,
	): ScratchpadExecutionReceipt {
		return {
			...receipt,
			identity: {
				documentId: document.documentId,
				requestId: operation.requestId,
				operation: operation.operation,
				textRevision: document.textRevision,
			},
		};
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
		const workspace = session.loaded.workspace;
		const profileId =
			workspace.settings?.getActiveProfileId() ??
			workspace.profile?.id ??
			"base";
		const extensionIds = session.loaded.resolvedExtensionIds;
		const applications: DomainApplicationDescriptor[] =
			session.loaded.loadedExtensions.map(({ extension }) => ({
				id: extension.manifest.id,
				displayName: extension.manifest.displayNameI18nKey
					? translate(workspace.i18n, extension.manifest.displayNameI18nKey) ||
						extension.manifest.displayName ||
						extension.manifest.id
					: (extension.manifest.displayName ??
						extension.manifest.contributes?.settings?.[0]?.title ??
						extension.manifest.id),
				description: extension.manifest.descriptionI18nKey
					? translate(workspace.i18n, extension.manifest.descriptionI18nKey) ||
						extension.manifest.description
					: extension.manifest.description,
				extensionVersion: extension.manifest.version,
			}));
		const bindings: KeymapBindingDto[] = resolveKeymapBindings(
			session.keymap,
		).map((binding) => ({
			command: binding.command,
			chords: binding.chords,
			modes: binding.modes,
			when: binding.when,
			labelI18nKey: binding.labelI18nKey,
			source: "macro-profile",
		}));
		const flatAliases = session.keymap.aliases
			? Object.fromEntries(normalizeCommandAliases(session.keymap.aliases))
			: undefined;
		const aliasesByCommand = new Map<string, string[]>();
		for (const [alias, commandId] of Object.entries(flatAliases ?? {})) {
			const aliases = aliasesByCommand.get(commandId) ?? [];
			if (!aliases.some((value) => value.toLowerCase() === alias.toLowerCase()))
				aliases.push(alias);
			aliasesByCommand.set(commandId, aliases);
		}
		const keymap: EffectiveKeymapDto = {
			profileId: session.keymap.profileId,
			name: session.keymap.name,
			description: session.keymap.description,
			vim: {
				normal: session.keymap.normal as unknown as Record<string, string>,
				visual: session.keymap.visual as unknown as Record<string, string>,
				sequences: session.keymap.sequences as unknown as Record<
					string,
					string
				>,
			},
			normal: session.keymap.normal as unknown as Record<string, string>,
			visual: session.keymap.visual as unknown as Record<string, string>,
			sequences: session.keymap.sequences as unknown as Record<string, string>,
			...(flatAliases ? { aliases: flatAliases } : {}),
			bindings,
		};
		const commands: CommandDescriptorDto[] = workspace.commands
			.getCommands()
			.map((command) => {
				const aliases = [
					...(command.aliases ?? []),
					...(aliasesByCommand.get(command.command) ?? []),
				];
				const uniqueAliases = [
					...new Map(
						aliases.map((alias) => [alias.toLowerCase(), alias]),
					).values(),
				];
				return {
					id: command.command,
					titleI18nKey: command.titleI18nKey,
					verb: command.verb,
					...(uniqueAliases.length > 0 ? { aliases: uniqueAliases } : {}),
					categoryI18nKey: command.categoryI18nKey,
					description: command.description,
					keybinding: command.keybinding,
					args: command.args,
					extensionId: command.extensionId,
				};
			});
		const layout = workspace.layout.getSnapshot();
		const settings = workspace.settingsUiModel
			? serializeSettingsUiSnapshot(workspace.settingsUiModel.getSnapshot(), {
					supportedScopes: this.supportedScopes(session),
					i18n: workspace.i18n,
				})
			: undefined;
		const fallback = extractedEmptySettingsSnapshot(
			profileId,
			this.supportedScopes(session),
		);
		return {
			workspaceId: session.workspaceId,
			sessionId: session.id,
			profile: {
				id: profileId,
				displayName: profileId,
				enabledExtensionIds: extensionIds,
			},
			enabledExtensionIds: extensionIds,
			applications,
			keymap,
			commands,
			contributions: {
				tabs: workspace.tabs.getTabs().map((tab) => ({
					id: tab.id,
					label: tab.label,
					icon: tab.icon,
					order: tab.order,
					defaultVisible: tab.defaultVisible,
					extensionId: tab.extensionId,
				})),
				views: workspace.views.getAllViews().map((view) => ({
					id: view.id,
					name: view.name,
					containerId: view.containerId,
					order: view.order,
					region: view.region,
					extensionId: view.extensionId,
				})),
				containers: workspace.views.getContainers().map((container) => ({
					id: container.id,
					titleI18nKey: container.titleI18nKey,
					icon: container.icon,
					order: container.order,
					region: container.region,
					extensionId: container.extensionId,
				})),
			},
			settings: settings ?? fallback,
			layout,
			activeTabId: workspace.layout.getSnapshot().activeTabId,
			editor: this.editorSnapshot(session),
			diagnostics: [],
			...(session.loaded.project
				? {
						project: {
							projectId: session.loaded.project.descriptor.projectId,
							displayName: session.loaded.project.descriptor.displayName,
							lifecycle: session.loaded.project.descriptor.lifecycle,
							revision: session.loaded.project.descriptor.revision,
							resources: session.loaded.project.descriptor.resources,
							historyResources:
								session.loaded.project.descriptor.historyResources,
							ephemeral: false,
						},
					}
				: {
						project: {
							projectId: "in-memory",
							displayName: translate(
								workspace.i18n,
								"workbench.inMemorySession",
							),
							displayNameI18nKey: "workbench.inMemorySession",
							lifecycle: "open" as const,
							revision: "0",
							resources: [],
							historyResources: [],
							ephemeral: true,
						},
					}),
			revision: session.revision,
		};
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

/**
 * Canonical scratchpad diagnostics carry no severity of their own. A line is
 * either valid or invalid, and every diagnostic on an invalid line is an
 * error. Project the browser DTO explicitly instead of letting the host type
 * leak through an `as` cast.
 */
export function toScratchpadDiagnosticDto(
	diagnostic: MacroDiagnostic,
	isValid: boolean,
): DiagnosticDto {
	return {
		severity: isValid ? "info" : "error",
		message: diagnostic.message,
		code: diagnostic.code,
		...(diagnostic.start !== undefined && diagnostic.end !== undefined
			? {
					span: {
						start: diagnostic.start,
						end: diagnostic.end,
					},
				}
			: {}),
	};
}

function toEditorPayload(
	value: unknown,
	metadata: Pick<EditorPayloadEnvelope, "kind" | "ownerId"> &
		Partial<Pick<EditorPayloadEnvelope, "schemaVersion">>,
): EditorPayloadEnvelope {
	const data = toEditorJsonValue(value);
	if (data === undefined)
		return {
			...metadata,
			schemaVersion: metadata.schemaVersion ?? 1,
			availability: "unavailable",
			reasonCode: "EDITOR_PAYLOAD_UNAVAILABLE",
		};
	return {
		...metadata,
		schemaVersion: metadata.schemaVersion ?? 1,
		availability: "available",
		data,
	};
}

function toEditorJsonValue(
	value: unknown,
	seen = new Set<object>(),
	depth = 0,
): EditorJsonValue | undefined {
	if (depth > 8) return undefined;
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "object") return undefined;
	if (seen.has(value)) return undefined;
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const items = value.map((item) =>
				toEditorJsonValue(item, seen, depth + 1),
			);
			return items.every((item) => item !== undefined)
				? (items as EditorJsonValue[])
				: undefined;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) return undefined;
		const entries = Object.entries(value).map(
			([key, item]) => [key, toEditorJsonValue(item, seen, depth + 1)] as const,
		);
		if (entries.some(([, item]) => item === undefined)) return undefined;
		return Object.fromEntries(entries) as EditorJsonValue;
	} finally {
		seen.delete(value);
	}
}

function toSettingsBundleDto(bundle: SettingsBundlePayload): SettingsBundleDto {
	return {
		$schema: bundle.$schema,
		version: bundle.version,
		exportedAt: bundle.exportedAt,
		workspace: bundle.workspace ? { ...bundle.workspace } : undefined,
		profiles: bundle.profiles
			? Object.fromEntries(
					Object.entries(bundle.profiles).map(([id, profile]) => [
						id,
						{ ...profile },
					]),
				)
			: undefined,
		extensions: bundle.extensions
			? Object.fromEntries(
					Object.entries(bundle.extensions).map(([id, config]) => [
						id,
						{ ...config },
					]),
				)
			: undefined,
	};
}

function isSettingsBundleDto(value: unknown): value is SettingsBundleDto {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const bundle = value as Record<string, unknown>;
	if (bundle.version !== 1 || typeof bundle.exportedAt !== "string")
		return false;
	for (const key of ["workspace", "profiles", "extensions"]) {
		const section = bundle[key];
		if (
			section !== undefined &&
			(!section || typeof section !== "object" || Array.isArray(section))
		)
			return false;
	}
	return true;
}

function fromSettingsBundleDto(
	bundle: SettingsBundleDto,
): SettingsBundlePayload {
	return {
		$schema: bundle.$schema,
		version: bundle.version,
		exportedAt: bundle.exportedAt,
		workspace: bundle.workspace ? { ...bundle.workspace } : undefined,
		profiles: bundle.profiles
			? Object.fromEntries(
					Object.entries(bundle.profiles).map(([id, profile]) => [
						id,
						{ ...profile },
					]),
				)
			: undefined,
		extensions: bundle.extensions
			? Object.fromEntries(
					Object.entries(bundle.extensions).map(([id, config]) => [
						id,
						{ ...config },
					]),
				)
			: undefined,
	};
}

function toSettingsDiagnosticDto(
	diagnostic: SettingsDiagnostic,
): SettingsDiagnosticDto {
	return {
		severity: diagnostic.severity,
		code: diagnostic.code,
		path: diagnostic.path,
		message: diagnostic.message,
		line: diagnostic.line,
		column: diagnostic.column,
		restartRequired: diagnostic.restartRequired,
	};
}

function toSettingsPreviewDto(
	preview: import("@stateful-mcp/macro").SettingsPreviewResult,
): SettingsPreviewDto {
	return {
		requestId: preview.requestId,
		settingsRevision: preview.settingsRevision,
		providerId: preview.providerId,
		status: preview.status,
		diagnostics: preview.diagnostics.map(toSettingsDiagnosticDto),
		tokenDescriptors: preview.tokenDescriptors,
		templateAnalysis: preview.templateAnalysis?.map((analysis) => ({
			template: analysis.template,
			tokens: analysis.tokens,
			segments: analysis.segments,
			unknownTokens: analysis.unknownTokens,
		})),
		sample: preview.sample,
	};
}

function redactSensitiveBundleLegacy(
	bundle: SettingsBundleDto,
	schema: readonly SettingsSchemaEntry[],
): SettingsBundleDto {
	const result = structuredClone(bundle);
	const redact = (
		value: Record<string, unknown> | undefined,
		entries: readonly SettingsSchemaEntry[],
	) => {
		if (!value) return;
		for (const entry of entries) {
			if (entry.sensitive && hasBundlePath(value, entry.path))
				setBundlePath(value, entry.path, SETTINGS_REDACTION_MARKER);
		}
	};
	redact(result.workspace, sectionSchema(schema, "workspace"));
	for (const [id, profile] of Object.entries(result.profiles ?? {}))
		redact(profile, sectionSchema(schema, "profile", id));
	for (const [id, extension] of Object.entries(result.extensions ?? {}))
		redact(extension, sectionSchema(schema, "extension", id));
	return result;
}

function prepareImportedBundleLegacy(
	bundle: SettingsBundleDto,
	profileId: string,
	schema: readonly SettingsSchemaEntry[],
	messageForKey: (
		key: string,
		params?: Readonly<Record<string, string | number>>,
	) => string = (key) => key,
): {
	bundle: SettingsBundleDto;
	diagnostics: readonly SettingsDiagnosticDto[];
} {
	const result = structuredClone(bundle);
	const diagnostics: SettingsDiagnosticDto[] = [];
	const profileIds = Object.keys(result.profiles ?? {});
	for (const importedProfileId of profileIds) {
		if (importedProfileId !== profileId) {
			diagnostics.push({
				severity: "error",
				message: messageForKey("settings.bundle.profileOutsideSelection", {
					profile: importedProfileId,
				}),
			});
		}
	}
	const sanitize = (
		value: Record<string, unknown> | undefined,
		entries: readonly SettingsSchemaEntry[],
	) => {
		if (!value) return;
		for (const entry of entries) {
			if (!hasBundlePath(value, entry.path)) continue;
			if (entry.sensitive) {
				diagnostics.push({
					severity: "warning",
					path: entry.path,
					message: messageForKey("settings.bundle.sensitiveOmitted"),
				});
				deleteBundlePath(value, entry.path);
				continue;
			}
			const current = getBundlePath(value, entry.path);
			if (!matchesSettingsType(current, entry))
				diagnostics.push({
					severity: "error",
					path: entry.path,
					message: messageForKey("settings.bundle.valueInvalid", {
						path: entry.path.join("."),
					}),
				});
		}
	};
	sanitize(result.workspace, sectionSchema(schema, "workspace"));
	for (const [id, profile] of Object.entries(result.profiles ?? {}))
		sanitize(profile, sectionSchema(schema, "profile", id));
	for (const [id, extension] of Object.entries(result.extensions ?? {}))
		sanitize(extension, sectionSchema(schema, "extension", id));
	return { bundle: result, diagnostics };
}

function sectionSchema(
	schema: readonly SettingsSchemaEntry[],
	section: "workspace" | "profile" | "extension",
	id?: string,
): readonly SettingsSchemaEntry[] {
	return schema.flatMap((entry) => {
		const prefix =
			section === "extension"
				? ["extensions", id]
				: section === "profile"
					? ["profiles", id]
					: [];
		if (prefix.length === 0)
			return entry.path[0] === "extensions" || entry.path[0] === "profiles"
				? []
				: [entry];
		if (
			entry.path
				.slice(0, prefix.length)
				.every((part, index) => part === prefix[index])
		)
			return [{ ...entry, path: entry.path.slice(prefix.length) }];
		return [];
	});
}

function setBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): void {
	let current = root;
	for (const key of path.slice(0, -1)) {
		const child = current[key];
		if (!child || typeof child !== "object" || Array.isArray(child))
			current[key] = {};
		current = current[key] as Record<string, unknown>;
	}
	if (path.length > 0) current[path[path.length - 1]!] = value;
}

function getBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
): unknown {
	return path.reduce<unknown>((value, key) => {
		if (!value || typeof value !== "object" || Array.isArray(value))
			return undefined;
		return (value as Record<string, unknown>)[key];
	}, root);
}

function hasBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
): boolean {
	return path.length > 0 && getBundlePath(root, path) !== undefined;
}

function deleteBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
): void {
	const parent = getBundlePath(root, path.slice(0, -1));
	if (parent && typeof parent === "object" && !Array.isArray(parent))
		delete (parent as Record<string, unknown>)[path[path.length - 1]!];
}

function matchesSettingsType(
	value: unknown,
	entry: SettingsSchemaEntry,
): boolean {
	if (entry.type === "json") return true;
	if (entry.type === "boolean") return typeof value === "boolean";
	if (entry.type === "number")
		return typeof value === "number" && Number.isFinite(value);
	if (entry.type === "string") return typeof value === "string";
	if (entry.type === "enum")
		return (
			typeof value === "string" &&
			(!entry.enumValues || entry.enumValues.includes(value))
		);
	if (entry.type === "array") return Array.isArray(value);
	if (entry.type === "object")
		return Boolean(value) && typeof value === "object" && !Array.isArray(value);
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Builds the project settings contribution list from the active workspace's
 * extensions. Shared by the configuration projection and the boundary
 * validation so both agree on the available schema.
 */
function buildProjectSettingsContributions(
	session: Session,
): ProjectSettingsContributionDto[] {
	return session.loaded.workspace.runtime.extensions
		.list()
		.flatMap((extension) =>
			(extension.contributions?.projectSettings ?? []).map(
				(contribution): ProjectSettingsContributionDto => ({
					extensionId: extension.manifest.id,
					namespace: contribution.namespace,
					title: contribution.title,
					...(contribution.description
						? { description: contribution.description }
						: {}),
					schema: contribution.schema.map((entry) => ({
						path: entry.path,
						type: entry.type,
						title: entry.title,
						...(entry.description ? { description: entry.description } : {}),
						...(entry.widget ? { widget: entry.widget } : {}),
						...(entry.placeholder ? { placeholder: entry.placeholder } : {}),
						...(entry.enumOptions
							? {
									enumOptions: entry.enumOptions.map((option) => ({
										id: option.id,
										label: option.label,
									})),
								}
							: {}),
						...(entry.min !== undefined ? { min: entry.min } : {}),
						...(entry.max !== undefined ? { max: entry.max } : {}),
						...(entry.step !== undefined ? { step: entry.step } : {}),
						...(entry.tagDelimiters
							? { tagDelimiters: entry.tagDelimiters }
							: {}),
						...(contribution.defaults &&
						entry.path.join(".") in contribution.defaults
							? {
									default: contribution.defaults[entry.path.join(".")],
								}
							: {}),
						...(entry.sensitive ? { sensitive: true } : {}),
					})) as SettingsSchemaEntryDto[],
				}),
			),
		);
}

/**
 * Explicit, fully-typed projection of a Macro project into the host-boundary
 * ProjectConfigurationDto. Every protocol field is enumerated so the server
 * never relies on an unchecked `as ProjectConfigurationDto` spread of the
 * manifest.
 */
function toProjectConfigurationDto(
	project: MacroProject,
	session: Session,
): ProjectConfigurationDto {
	const manifest = project.manifest;
	const projectSettingsContributions =
		buildProjectSettingsContributions(session);
	const extensionCatalog = buildExtensionCatalog(project, session);
	const activeResolution = resolveActiveExtensionGroup(
		{
			groups: manifest.extensionGroups ?? {},
			...(manifest.activeExtensionGroupId === undefined
				? {}
				: { activeGroupId: manifest.activeExtensionGroupId }),
		},
		toResolverExtensions(
			manifest.extensions,
			availabilityMap(extensionCatalog),
		),
	);
	return {
		formatVersion: manifest.formatVersion,
		projectId: manifest.projectId,
		displayName: manifest.displayName,
		backend: manifest.backend,
		activeExtensionGroupId: manifest.activeExtensionGroupId,
		uiLocale: manifest.uiLocale,
		extensions: manifest.extensions,
		...(manifest.extensionGroups
			? {
					extensionGroups: Object.fromEntries(
						Object.entries(manifest.extensionGroups).map(([id, group]) => [
							id,
							toProjectExtensionGroupDto(group),
						]),
					),
				}
			: {}),
		extensionCatalog,
		activeExtensionGroupResolution:
			toProjectExtensionGroupResolutionDto(activeResolution),
		resources: manifest.resources,
		historyResources: manifest.historyResources,
		scratchpadResources: manifest.scratchpadResources,
		templates: manifest.templates,
		projectSettings: manifest.projectSettings,
		projectSettingsContributions,
		availableLocales: session.loaded.workspace.i18n.getAvailableLocales(),
		revision: project.descriptor.revision,
	};
}

function availabilityMap(
	catalog: readonly ProjectExtensionDescriptorDto[],
): Readonly<Record<string, ProjectExtensionAvailabilityDto>> {
	return Object.fromEntries(
		catalog.map((descriptor) => [descriptor.id, descriptor.availability]),
	);
}

/**
 * Projects the host-owned extension catalog for a project session.
 *
 * Capability lists come from the active extension contributions, the macro
 * registry, and project resource/migration metadata, so the browser never has
 * to infer capabilities from raw manifests.
 */
function buildExtensionCatalog(
	project: MacroProject,
	session: Session,
): readonly ProjectExtensionDescriptorDto[] {
	const runtime = session.loaded.workspace.runtime;
	const macrosByOwner = new Map<string, string[]>();
	for (const macro of runtime.macros.list()) {
		const registered = runtime.macros.getRegistered(macro.name);
		const owner = registered?.ownerExtensionId;
		if (!owner) continue;
		const bucket = macrosByOwner.get(owner) ?? [];
		bucket.push(registered.canonicalId ?? registered.id ?? macro.name);
		macrosByOwner.set(owner, bucket);
	}
	const resourcesByExtension = new Map<string, string[]>();
	for (const reference of [
		...project.manifest.resources,
		...project.manifest.historyResources,
		...(project.manifest.scratchpadResources ?? []),
	]) {
		const owner = reference.metadata?.extensionId;
		if (typeof owner !== "string") continue;
		const bucket = resourcesByExtension.get(owner) ?? [];
		bucket.push(`${reference.kind}:${reference.resourceId}`);
		resourcesByExtension.set(owner, bucket);
	}
	const active = runtime.extensions.list().map((extension) => {
		const manifest = extension.manifest;
		const contributed = manifest.contributes;
		const participants = extension.projectMigrationParticipants ?? [];
		return {
			id: manifest.id,
			...(manifest.displayName === undefined
				? {}
				: { displayName: manifest.displayName }),
			...(manifest.description === undefined
				? {}
				: { description: manifest.description }),
			capabilities: {
				macros: macrosByOwner.get(manifest.id) ?? [],
				commands: [
					...(contributed?.commands ?? []).map((command) => command.command),
					...Object.keys(extension.contributions?.commands ?? {}),
				],
				views: [
					...Object.values(contributed?.views ?? {}).flatMap((views) =>
						views.map((view) => view.id),
					),
					...Object.keys(extension.contributions?.views ?? {}),
				],
				tabs: [
					...(contributed?.workspaceTabs ?? []).map((tab) => tab.id),
					...Object.keys(extension.contributions?.tabs ?? {}),
				],
				settings: (contributed?.settings ?? []).map(
					(contribution) => contribution.namespace,
				),
				projectSettings: [
					...(contributed?.projectSettings ?? []).map(
						(contribution) => contribution.namespace,
					),
					...(extension.contributions?.projectSettings ?? []).map(
						(contribution) => contribution.namespace,
					),
				],
				resources: [
					...(resourcesByExtension.get(manifest.id) ?? []),
					...participants.flatMap(
						(participant) => participant.resourceIds ?? [],
					),
				],
				migrationParticipants: participants.map(
					(participant) => participant.id,
				),
			},
		};
	});
	return buildProjectExtensionCatalog({
		declared: project.manifest.extensions,
		active,
	});
}

function toProjectMigrationJournalDto(
	journal: ProjectMigrationJournal,
): ProjectMigrationJournalDto {
	const owner: ProjectMigrationJournalOwnerDto = {
		pid: journal.owner.pid,
		hostname: journal.owner.hostname,
	};
	return {
		journalVersion: journal.journalVersion,
		migrationId: journal.migrationId,
		status: journal.status,
		resumable: journal.resumable,
		startedAt: journal.startedAt,
		updatedAt: journal.updatedAt,
		owner,
		source: journal.source,
		target: journal.target,
		expectedRevision: journal.expectedRevision,
		copiedHistory: journal.copiedHistory,
		copiedScratchpads: journal.copiedScratchpads,
		...(journal.error !== undefined ? { error: journal.error } : {}),
	};
}

function toProjectMigrationRecoveryResultDto(
	result: ProjectMigrationRecoveryResult,
): ProjectMigrationRecoveryResultDto {
	const action = result.action as ProjectMigrationRecoveryAction;
	return {
		action,
		journal: result.journal
			? toProjectMigrationJournalDto(result.journal)
			: null,
		...(result.stale !== undefined ? { stale: result.stale } : {}),
		...(result.removedTargetPath !== undefined
			? { removedTargetPath: result.removedTargetPath }
			: {}),
		...(result.retainedReason !== undefined
			? { retainedReason: result.retainedReason }
			: {}),
		...(result.sourceDigestMatches !== undefined
			? { sourceDigestMatches: result.sourceDigestMatches }
			: {}),
	};
}
