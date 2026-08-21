import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	BUILTIN_KEYMAP_PROFILES,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	DocumentManagerError,
	DocumentRevisionError,
	type EditorKeymapProfile,
	keymapBindingConflicts,
	type MacroDocument,
	type MacroDocumentTemplate,
	matchEffectiveBindings,
	mergeEditorKeymap,
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
	type LoadedMacroWorkspace,
	type MacroHost,
	ServerUserPreferencesStore,
} from "@stateful-mcp/macro-host";
import {
	type CommandDescriptorDto,
	type DiagnosticDto,
	type DomainApplicationDescriptor,
	type EditorDocumentDto,
	type EditorJsonValue,
	type EditorOperation,
	type EditorOperationResult,
	type EditorOutputSnapshotDto,
	type EditorPayloadEnvelope,
	type EditorWorkspaceSnapshotDto,
	type EffectiveKeymapDto,
	type HostError,
	type HostEvent,
	type HostEventType,
	hostError,
	type KeymapBindingContextDto,
	type KeymapBindingDto,
	type KeymapBindingResolutionDto,
	MACRO_PROTOCOL_VERSION,
	type ScratchpadLineDto,
	type ScratchpadLineStatus,
	type ScratchpadTemplateDescriptor,
	SETTINGS_REDACTION_MARKER,
	type SettingsApplyResult,
	type SettingsBundleDto,
	type SettingsBundleOperation,
	type SettingsBundleResult,
	type SettingsDiagnosticDto,
	type SettingsOperation,
	type SettingsPreviewDto,
	type SettingsScope,
	type SettingsUiOperation,
	type SettingsUiSnapshotDto,
	type UserPreferencesDto,
	type UserPreferencesExportBundleDto,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";

export interface HostSessionOptions {
	readonly workspacePath?: string;
	readonly profileId?: string;
	readonly locale?: string;
	readonly initialText?: string;
	readonly templates?: readonly MacroDocumentTemplate[];
	readonly keymap?: Partial<EditorKeymapProfile>;
}

interface Session {
	readonly id: string;
	readonly workspaceId: string;
	loaded: LoadedMacroWorkspace;
	keymap: EditorKeymapProfile;
	readonly listeners: Set<(event: HostEvent) => void>;
	readonly unsubs: (() => void)[];
	sequence: number;
	revision: number;
	lastActivity: number;
	disposed: boolean;
	stagedBundle?: {
		readonly stageId: string;
		readonly revision: string;
		readonly bundle: SettingsBundlePayload;
		readonly scope: SettingsScope;
		readonly profileId: string;
		readonly mode: "merge" | "replace";
	};
}

export class HostSessionManager {
	private readonly sessions = new Map<string, Session>();
	private readonly userPreferencesStore: ServerUserPreferencesStore;

	constructor(
		private readonly host: MacroHost,
		private readonly idleTimeoutMs = 30 * 60 * 1000,
		private readonly projectRoot?: string,
		preferencesOptions?: { readonly dataFilePath?: string },
	) {
		this.userPreferencesStore = new ServerUserPreferencesStore(
			preferencesOptions,
		);
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

	async create(options: HostSessionOptions = {}): Promise<WorkspaceSnapshot> {
		const loaded = await this.host.createWorkspace({
			...(this.projectRoot ? { projectRoot: this.projectRoot } : {}),
			profileId: options.profileId,
			locale: options.locale,
			...(options.initialText === undefined
				? {}
				: { initialText: options.initialText }),
			...(options.templates === undefined
				? {}
				: { templates: options.templates }),
		});
		const id = randomUUID();
		const session: Session = {
			id,
			workspaceId: randomUUID(),
			loaded,
			keymap: mergeEditorKeymap(DEFAULT_EDITOR_KEYMAP_PROFILE, options.keymap),
			listeners: new Set(),
			unsubs: [],
			sequence: 0,
			revision: 0,
			lastActivity: Date.now(),
			disposed: false,
		};
		this.sessions.set(id, session);
		this.attachSignals(session);
		return this.snapshot(session);
	}

	async openProject(
		sessionId: string,
		projectRoot: string,
	): Promise<WorkspaceSnapshot> {
		const session = this.getOrError(sessionId);
		for (const unsub of session.unsubs) unsub();
		session.unsubs.length = 0;
		await session.loaded.workspace.dispose();

		const loaded = await this.host.createWorkspace({
			projectRoot: resolve(projectRoot),
		});
		session.loaded = loaded;
		this.attachSignals(session);
		this.emit(session, "workspace.changed");
		return this.snapshot(session);
	}

	async initProject(
		sessionId: string,
		projectRoot: string,
		displayName?: string,
	): Promise<WorkspaceSnapshot> {
		const rootPath = resolve(projectRoot);
		await createMacroProject({ rootPath, displayName });
		return this.openProject(sessionId, rootPath);
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
		const resolvedParent = resolve(parentPath);
		const childPath = join(resolvedParent, trimmed);
		await mkdir(childPath);
		return { path: childPath };
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
		await session.loaded.workspace.dispose();

		const loaded = await this.host.createWorkspace({});
		session.loaded = loaded;
		this.attachSignals(session);
		this.emit(session, "workspace.changed");
		return this.snapshot(session);
	}

	get(sessionId: string): Session | undefined {
		const session = this.sessions.get(sessionId);
		if (session && !session.disposed) {
			session.lastActivity = Date.now();
			return session;
		}
		return undefined;
	}

	getOrError(sessionId: string): Session {
		const session = this.get(sessionId);
		if (!session)
			throw new SessionError("SESSION_NOT_FOUND", "Session not found", false);
		return session;
	}

	subscribe(
		sessionId: string,
		listener: (event: HostEvent) => void,
	): () => void {
		const session = this.getOrError(sessionId);
		session.listeners.add(listener);
		return () => session.listeners.delete(listener);
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

	async settings(
		sessionId: string,
		operation: SettingsOperation,
	): Promise<SettingsApplyResult> {
		const session = this.getOrError(sessionId);
		const uiModel = session.loaded.workspace.settingsUiModel;
		const settings = session.loaded.workspace.settings;
		if (!uiModel || !settings)
			throw new SessionError(
				"SETTINGS_UNAVAILABLE",
				"Settings are unavailable",
				false,
			);
		if (operation.operation === "preview") {
			const preview = await settings.preview({
				requestId: operation.requestId,
				settingsRevision:
					operation.expectedRevision ?? settings.getSettingsRevision(),
				path: operation.path,
				draftValue: operation.draftValue,
				effectiveSettings: settings.getEffective(),
				sampleInput: operation.sampleInput,
			});
			return {
				status: "preview",
				preview: toSettingsPreviewDto(preview),
				snapshot: this.snapshotResult(session).snapshot,
			};
		}

		// Semantic mutations route through the canonical SettingsUiModel so the
		// host remains the sole authority on values, diagnostics, and
		// persistence. The settings-bundle revision is opaque and distinct from
		// the per-session workspace revision; it is never a session number.
		switch (operation.operation) {
			case "set":
				uiModel.setValue(operation.path, operation.value);
				break;
			case "replaceJson":
				uiModel.replaceRawJson(operation.rawText);
				break;
			case "save": {
				const result = await uiModel.save(operation.expectedRevision);
				if (result.status === "conflict") {
					return this.conflictResult(session, result);
				}
				if (result.status === "blocked") {
					return this.blockedResult(session, result);
				}
				this.emit(session, "settings.changed");
				return this.savedResult(session, result);
			}
			case "discard":
			case "reload":
				await settings.reload();
				break;
			case "profile.select":
				await uiModel.switchProfile(operation.profileId);
				break;
			case "scope.select": {
				const supported = this.supportedScopes(session);
				if (!supported.includes(operation.scope)) {
					return this.unsupportedScopeResult(session, operation.scope);
				}
				uiModel.setActiveScope(operation.scope);
				break;
			}
			case "jsonMode.toggle":
				if (operation.enabled !== uiModel.getIsSplitJsonMode())
					uiModel.toggleSplitJsonMode();
				break;
		}

		this.emit(session, "settings.changed");
		return this.snapshotResult(session);
	}

	async settingsUi(
		sessionId: string,
		operation: SettingsUiOperation,
	): Promise<SettingsApplyResult> {
		const session = this.getOrError(sessionId);
		const uiModel = session.loaded.workspace.settingsUiModel;
		if (!uiModel)
			throw new SessionError(
				"SETTINGS_UNAVAILABLE",
				"Settings are unavailable",
				false,
			);
		switch (operation.operation) {
			case "settings.ui.scope.set": {
				const supported = this.supportedScopes(session);
				if (!supported.includes(operation.scope)) {
					return this.unsupportedScopeResult(session, operation.scope);
				}
				uiModel.setActiveScope(operation.scope);
				return this.snapshotResult(session);
			}
			case "settings.ui.search.set":
				uiModel.setSearchQuery(operation.query);
				break;
			case "settings.ui.modifiedOnly.set":
				uiModel.setFilterModifiedOnly(operation.enabled);
				break;
			case "settings.ui.jsonMode.toggle":
				uiModel.toggleSplitJsonMode();
				break;
			case "settings.ui.section.set":
				uiModel.setActiveSection(operation.sectionId);
				break;
			default:
				throw new SessionError(
					"SETTINGS_OPERATION_UNKNOWN",
					"Unknown settings UI operation",
					false,
				);
		}
		return this.snapshotResult(session);
	}

	async settingsBundle(
		sessionId: string,
		operation: SettingsBundleOperation,
	): Promise<SettingsBundleResult> {
		const session = this.getOrError(sessionId);
		const settings = session.loaded.workspace.settings;
		if (!settings)
			throw new SessionError(
				"SETTINGS_UNAVAILABLE",
				"Settings are unavailable",
				false,
			);

		if (operation.operation === "export") {
			if (!this.supportedScopes(session).includes(operation.scope))
				return {
					status: "unsupported",
					code: "SETTINGS_SCOPE_UNSUPPORTED",
					message: this.message(session, "settings.bundle.scopeUnsupported", {
						scope: operation.scope,
					}),
				};
			const profiles = await settings.listProfiles();
			if (!profiles.includes(operation.profileId))
				return {
					status: "unsupported",
					code: "SETTINGS_PROFILE_UNSUPPORTED",
					message: this.message(session, "settings.bundle.profileUnsupported", {
						profile: operation.profileId,
					}),
				};
			const exported = await settings.exportBundle(operation.profileId);
			return {
				status: "exported",
				revision: exported.revision,
				bundle: redactSensitiveBundle(
					toSettingsBundleDto(exported.bundle),
					settings.getSchema(),
				),
			};
		}

		if (operation.operation === "importStage") {
			if (!this.supportedScopes(session).includes(operation.scope))
				return {
					status: "unsupported",
					code: "SETTINGS_SCOPE_UNSUPPORTED",
					message: this.message(session, "settings.bundle.scopeUnsupported", {
						scope: operation.scope,
					}),
				};
			if (!isSettingsBundleDto(operation.bundle))
				return {
					status: "invalid",
					message: this.message(session, "settings.bundle.invalid"),
					diagnostics: [
						{
							severity: "error",
							message: this.message(session, "settings.bundle.versionInvalid"),
						},
					],
				};
			const profiles = await settings.listProfiles();
			if (!profiles.includes(operation.profileId))
				return {
					status: "unsupported",
					code: "SETTINGS_PROFILE_UNSUPPORTED",
					message: this.message(session, "settings.bundle.profileUnsupported", {
						profile: operation.profileId,
					}),
				};
			const revision = settings.getSettingsRevision();
			if (operation.expectedRevision && operation.expectedRevision !== revision)
				return {
					status: "stale",
					code: "SETTINGS_REVISION_STALE",
					message: this.message(session, "settings.bundle.stale"),
					expectedRevision: operation.expectedRevision,
					actualRevision: revision,
				};
			const prepared = prepareImportedBundle(
				operation.bundle,
				operation.profileId,
				settings.getSchema(),
				this.message.bind(this, session),
			);
			if (
				prepared.diagnostics.some(
					(diagnostic) => diagnostic.severity === "error",
				)
			)
				return {
					status: "invalid",
					message: this.message(session, "settings.bundle.invalid"),
					diagnostics: prepared.diagnostics,
				};
			const stageId = randomUUID();
			session.stagedBundle = {
				stageId,
				revision,
				bundle: fromSettingsBundleDto(prepared.bundle),
				scope: operation.scope,
				profileId: operation.profileId,
				mode: operation.mode,
			};
			return {
				status: "staged",
				stageId,
				revision,
				diagnostics: prepared.diagnostics,
			};
		}

		const staged = session.stagedBundle;
		if (!staged || staged.stageId !== operation.stageId)
			return {
				status: "invalid",
				message: this.message(session, "settings.bundle.stageUnavailable"),
				diagnostics: [
					{
						severity: "error",
						message: this.message(session, "settings.bundle.stageUnknown"),
					},
				],
			};
		const expectedRevision = operation.expectedRevision ?? staged.revision;
		if (expectedRevision !== staged.revision)
			return {
				status: "stale",
				code: "SETTINGS_REVISION_STALE",
				message: this.message(session, "settings.bundle.stale"),
				expectedRevision: staged.revision,
				actualRevision: expectedRevision,
			};
		const result = await settings.applyBundle(
			staged.bundle,
			staged.profileId,
			operation.mode ?? staged.mode,
			expectedRevision,
		);
		session.stagedBundle = undefined;
		if (result.status === "conflict")
			return {
				status: "stale",
				code: "SETTINGS_REVISION_STALE",
				message: this.message(session, "settings.bundle.stale"),
				expectedRevision: result.expectedRevision,
				actualRevision: result.actualRevision,
			};
		if (result.status === "blocked")
			return {
				status: "blocked",
				diagnostics: result.diagnostics.map(toSettingsDiagnosticDto),
				snapshot: this.settingsSnapshot(session),
			};
		return {
			status: "applied",
			settingsRevision: result.settingsRevision,
			snapshot: this.settingsSnapshot(session),
		};
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
				case "editor.newScratchpad": {
					const document = documents.createBlank();
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
				case "editor.createSplitGroup": {
					if (operation.expectedWorkspaceRevision !== session.revision)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					const group = workspace.editorGroups.create(operation);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted", groupId: group.groupId };
				}
				case "editor.closeGroup": {
					if (operation.expectedWorkspaceRevision !== session.revision)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					workspace.editorGroups.close(operation.groupId);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted", groupId: operation.groupId };
				}
				case "editor.focusGroup": {
					if (operation.expectedWorkspaceRevision !== session.revision)
						return workspaceConflict(operation.expectedWorkspaceRevision);
					workspace.editorGroups.focus(operation.groupId);
					this.emit(session, "workspace.changed");
					return { ...base(), status: "accepted", groupId: operation.groupId };
				}
				case "editor.openDocumentInGroup": {
					if (operation.expectedWorkspaceRevision !== session.revision)
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
					if (operation.expectedWorkspaceRevision !== session.revision)
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
				case "editor.renameDocument": {
					documents.rename(operation.documentId, operation.title);
					this.emit(session, "workspace.changed");
					return {
						...base(),
						status: "accepted",
						documentId: operation.documentId,
					};
				}
				case "editor.pinMacro": {
					documents.setPinnedMacro(operation.documentId, operation.macroId);
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
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		session.disposed = true;
		for (const unsubscribe of session.unsubs) unsubscribe();
		session.listeners.clear();
		this.sessions.delete(sessionId);
		await session.loaded.workspace.dispose();
		return true;
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
				...(template.pinnedMacroIds
					? { pinnedMacroIds: template.pinnedMacroIds }
					: {}),
				...(template.sourceExtensionId
					? { sourceExtensionId: template.sourceExtensionId }
					: {}),
				...(template.requiresProfile ? { requiresProfile: true } : {}),
			}));
		return {
			documents: documents
				.list()
				.map((document) => this.editorDocumentDto(document)),
			groups: session.loaded.workspace.editorGroups.list().map((group) => ({
				groupId: group.groupId,
				documentIds: group.documentIds,
				activeDocumentId: group.activeDocumentId,
				orientation: group.orientation,
				...(group.sizeRatio === undefined
					? {}
					: { sizeRatio: group.sizeRatio }),
			})),
			activeGroupId: session.loaded.workspace.editorGroups.getActiveGroupId(),
			activeDocumentId: documents.getActiveDocumentId(),
			activeDocument: active ? this.editorDocumentSnapshot(active) : null,
			templates,
			output: this.editorOutput(session),
			capabilities: {
				canCreate: true,
				canExecute: Boolean(active),
				canPersist: false,
				canSplit: true,
				canUseVim: true,
			},
		};
	}

	private editorOutput(session: Session): EditorOutputSnapshotDto {
		const entries = session.loaded.workspace.journal.getEntries();
		const bounded = entries.slice(-100);
		return {
			entries: bounded.map((entry) => ({
				outputId: entry.id,
				availability: entry.availability ?? "legacy",
				...(entry.identity ? { identity: entry.identity } : {}),
				lineNumber: entry.lineNumber,
				status:
					entry.status === "reversed"
						? "reversed"
						: entry.success === false
							? "failed"
							: "committed",
				...(entry.result === undefined
					? {}
					: {
							result: toEditorPayload(entry.result, {
								kind: "journal-result",
								ownerId: entry.macroName,
							}),
						}),
				...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
				executedAt: entry.executedAt,
			})),
			hasMore: entries.length > bounded.length,
		};
	}

	private editorDocumentDto(document: MacroDocument): EditorDocumentDto {
		return {
			documentId: document.documentId,
			providerId: "macro.text",
			title: document.title,
			...(document.templateId ? { templateId: document.templateId } : {}),
			dirty: document.dirty,
			textRevision: document.textRevision,
			...(document.pinnedMacroIds.length > 0
				? { pinnedMacroIds: document.pinnedMacroIds }
				: {}),
		};
	}

	private editorDocumentSnapshot(document: MacroDocument) {
		const projectedLines = document.session.getProjectedLines();
		const lines = projectedLines.map((line, idx) =>
			this.toScratchpadLineDto({
				...line,
				isExecuted: document.session.isLineExecuted(idx),
			}),
		);
		const projections = projectedLines.flatMap((line) => [
			...line.projections.map((projection) => ({
				kind: "slot" as const,
				ownerId: projection.macroId,
				version: projection.macroVersion,
				payload: toEditorPayload(projection, {
					kind: "slot",
					ownerId: projection.macroId,
					schemaVersion: 1,
				}),
			})),
			...(line.extensionProjections ?? []).map((projection) => ({
				kind: "extension" as const,
				ownerId: projection.ownerExtensionId,
				payload: toEditorPayload(projection.data, {
					kind: "extension",
					ownerId: projection.ownerExtensionId,
				}),
			})),
		]);
		const executionPreviews = projectedLines.flatMap((line) =>
			line.executionPreview
				? [
						{
							payload: toEditorPayload(line.executionPreview, {
								kind: "execution-preview",
							}),
						},
					]
				: [],
		);
		return {
			documentId: document.documentId,
			textRevision: document.textRevision,
			lines,
			...(projections.length > 0 ? { projections } : {}),
			...(executionPreviews.length > 0 ? { executionPreviews } : {}),
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
			this.toScratchpadLineDto({
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

	private toScratchpadLineDto(line: {
		readonly lineNumber: number;
		readonly rawText: string;
		readonly isValid: boolean;
		readonly isExecuted?: boolean;
		readonly macroName?: string;
		readonly projections: readonly {
			readonly macroId: string;
			readonly macroVersion: number;
		}[];
		readonly extensionProjections?: readonly {
			readonly ownerExtensionId: string;
			readonly data: unknown;
		}[];
		readonly preview?: { readonly text?: string };
		readonly executionPreview?: unknown;
		readonly diagnostics: readonly MacroDiagnostic[];
	}): ScratchpadLineDto {
		const lineStatus: ScratchpadLineStatus = !line.rawText.trim()
			? "empty"
			: !line.macroName
				? "non-macro"
				: line.isValid
					? "valid"
					: "invalid";
		const lineProjections = [
			...line.projections.map((projection) => ({
				kind: "slot" as const,
				ownerId: projection.macroId,
				version: projection.macroVersion,
				payload: toEditorPayload(projection, {
					kind: "slot",
					ownerId: projection.macroId,
					schemaVersion: 1,
				}),
			})),
			...(line.extensionProjections ?? []).map((projection) => ({
				kind: "extension" as const,
				ownerId: projection.ownerExtensionId,
				payload: toEditorPayload(projection.data, {
					kind: "extension",
					ownerId: projection.ownerExtensionId,
				}),
			})),
		];
		return {
			lineNumber: line.lineNumber,
			rawText: line.rawText,
			...(line.macroName ? { macroName: line.macroName } : {}),
			lineStatus,
			...(line.isExecuted !== undefined ? { isExecuted: line.isExecuted } : {}),
			diagnostics: line.diagnostics.map((diagnostic) =>
				toScratchpadDiagnosticDto(diagnostic, lineStatus === "valid"),
			),
			...(lineProjections.length > 0 ? { projections: lineProjections } : {}),
			...(line.preview ? { preview: { text: line.preview.text } } : {}),
			...(line.executionPreview
				? {
						executionPreview: {
							payload: toEditorPayload(line.executionPreview, {
								kind: "execution-preview",
							}),
						},
					}
				: {}),
		};
	}

	private toExecutionReceiptDto(
		receipt: {
			readonly lineNumber: number;
			readonly rawText: string;
			readonly macroName: string;
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
	) {
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
			macroName: receipt.macroName,
			success: receipt.success,
			...(receipt.result === undefined
				? {}
				: {
						result: toEditorPayload(receipt.result, {
							kind: "execution-result",
							ownerId: receipt.macroName,
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
		for (const [id, session] of this.sessions) {
			if (now - session.lastActivity > this.idleTimeoutMs)
				await this.dispose(id);
		}
	}

	async disposeAll(): Promise<void> {
		for (const id of [...this.sessions.keys()]) await this.dispose(id);
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
				...(eventResult ? { result: eventResult } : {}),
			},
		};
		for (const listener of session.listeners) listener(event);
	}

	private snapshot(session: Session): WorkspaceSnapshot {
		const workspace = session.loaded.workspace;
		const profileId =
			workspace.settings?.getActiveProfileId() ??
			session.loaded.activeProfile ??
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
			workbench: session.keymap.window as unknown as Record<string, string>,
			normal: session.keymap.normal as unknown as Record<string, string>,
			visual: session.keymap.visual as unknown as Record<string, string>,
			sequences: session.keymap.sequences as unknown as Record<string, string>,
			window: session.keymap.window as unknown as Record<string, string>,
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
					title: command.title,
					verb: command.verb,
					...(uniqueAliases.length > 0 ? { aliases: uniqueAliases } : {}),
					category: command.category,
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
		const fallback = emptySettingsSnapshot(
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
					title: container.title,
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
							displayName:
								translate(workspace.i18n, "workbench.inMemorySession") ||
								"In-Memory Session",
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

	private snapshotResult(session: Session): SettingsApplyResult {
		return {
			status: "saved",
			restartRequired: false,
			settingsRevision:
				session.loaded.workspace.settingsUiModel?.getSettingsRevision() ?? "",
			snapshot: this.settingsSnapshot(session),
		};
	}

	private savedResult(
		session: Session,
		result: {
			status: "saved";
			restartRequired: boolean;
			settingsRevision: string;
		},
	): SettingsApplyResult {
		return {
			status: "saved",
			restartRequired: result.restartRequired,
			settingsRevision: result.settingsRevision,
			snapshot: this.settingsSnapshot(session),
		};
	}

	private blockedResult(
		session: Session,
		result: { status: "blocked"; diagnostics: readonly SettingsDiagnostic[] },
	): SettingsApplyResult {
		return {
			status: "blocked",
			diagnostics: result.diagnostics.map(toSettingsDiagnosticDto),
			snapshot: this.settingsSnapshot(session),
		};
	}

	private conflictResult(
		session: Session,
		result: {
			status: "conflict";
			expectedRevision: string;
			actualRevision: string;
		},
	): SettingsApplyResult {
		return {
			status: "conflict",
			code: "SETTINGS_REVISION_STALE",
			message: this.message(session, "settings.bundle.stale"),
			expectedRevision: result.expectedRevision,
			actualRevision: result.actualRevision,
			snapshot: this.settingsSnapshot(session),
		};
	}

	private unsupportedScopeResult(
		session: Session,
		scope: SettingsScope,
	): SettingsApplyResult {
		return {
			status: "unsupported",
			code: "SETTINGS_SCOPE_UNSUPPORTED",
			message: this.message(session, "settings.bundle.scopeUnsupported", {
				scope,
			}),
			snapshot: this.settingsSnapshot(session),
		};
	}

	private settingsSnapshot(session: Session): SettingsUiSnapshotDto {
		const uiModel = session.loaded.workspace.settingsUiModel;
		if (!uiModel)
			return emptySettingsSnapshot("base", this.supportedScopes(session));
		return serializeSettingsUiSnapshot(uiModel.getSnapshot(), {
			supportedScopes: this.supportedScopes(session),
			i18n: session.loaded.workspace.i18n,
			settingsRevision: uiModel.getSettingsRevision(),
		});
	}
}

function emptySettingsSnapshot(
	activeProfileId: string,
	supportedScopes: readonly SettingsScope[],
): SettingsUiSnapshotDto {
	return {
		activeProfileId,
		availableProfiles: [],
		activeScope: "workspace",
		supportedScopes: [...supportedScopes],
		searchQuery: "",
		filterModifiedOnly: false,
		isSplitJsonMode: false,
		jsonModeAvailable: true,
		modifiedCount: 0,
		totalModifiedCount: 0,
		sections: [],
		rawJsonText: "{}",
		hasErrors: false,
		settingsRevision: "",
	};
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

export function redactSensitiveBundle(
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

export function prepareImportedBundle(
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

export class SessionError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly retryable = false,
		readonly details?: unknown,
	) {
		super(message);
	}
	toHostError(): HostError {
		return hostError(this.code, this.message, this.details, this.retryable);
	}
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
function setAtPath(
	target: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): void {
	let cursor = target;
	for (const key of path.slice(0, -1)) {
		const next = cursor[key];
		if (!next || typeof next !== "object" || Array.isArray(next))
			cursor[key] = {};
		cursor = cursor[key] as Record<string, unknown>;
	}
	const leaf = path[path.length - 1];
	if (leaf) cursor[leaf] = value;
}
