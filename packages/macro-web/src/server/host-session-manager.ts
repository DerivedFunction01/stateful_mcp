import { randomUUID } from "node:crypto";
import {
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	mergeEditorKeymap,
	resolveKeymapBindings,
} from "@stateful-mcp/macro";
import { serializeSettingsUiSnapshot } from "@stateful-mcp/macro/workspace/config/settings-projection";
import type { SettingsDiagnostic } from "@stateful-mcp/macro/workspace/config/settings-service";
import { translate } from "@stateful-mcp/macro/workspace/i18n/translation";
import type { LoadedMacroWorkspace, MacroHost } from "@stateful-mcp/macro-host";
import {
	type CommandDescriptorDto,
	type DomainApplicationDescriptor,
	type EffectiveKeymapDto,
	type HostError,
	type HostEvent,
	type HostEventType,
	hostError,
	type KeymapBindingDto,
	MACRO_PROTOCOL_VERSION,
	type SettingsApplyResult,
	type SettingsDiagnosticDto,
	type SettingsOperation,
	type SettingsScope,
	type SettingsUiOperation,
	type SettingsUiSnapshotDto,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";

export interface HostSessionOptions {
	readonly workspacePath?: string;
	readonly profileId?: string;
	readonly locale?: string;
	readonly initialText?: string;
	readonly keymap?: Partial<EditorKeymapProfile>;
}

interface Session {
	readonly id: string;
	readonly workspaceId: string;
	readonly loaded: LoadedMacroWorkspace;
	readonly keymap: EditorKeymapProfile;
	readonly listeners: Set<(event: HostEvent) => void>;
	readonly unsubs: (() => void)[];
	sequence: number;
	revision: number;
	documentRevision: number;
	lastActivity: number;
	disposed: boolean;
}

export class HostSessionManager {
	private readonly sessions = new Map<string, Session>();

	constructor(
		private readonly host: MacroHost,
		private readonly idleTimeoutMs = 30 * 60 * 1000,
		private readonly projectRoot?: string,
	) {}

	async create(options: HostSessionOptions = {}): Promise<WorkspaceSnapshot> {
		const loaded = await this.host.createWorkspace({
			...(this.projectRoot ? { projectRoot: this.projectRoot } : {}),
			profileId: options.profileId,
			locale: options.locale,
			initialText: options.initialText,
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
			documentRevision: 0,
			lastActivity: Date.now(),
			disposed: false,
		};
		this.sessions.set(id, session);
		this.attachSignals(session);
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
		expectedRevision?: number,
	): Promise<{ result: unknown; snapshot: WorkspaceSnapshot }> {
		const session = this.getOrError(sessionId);
		this.assertRevision(session, expectedRevision);
		const result = await session.loaded.workspace.commands.executeCommand(
			command,
			...args,
		);
		this.emit(session, "command.completed");
		return { result, snapshot: this.snapshot(session) };
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

	async parse(
		sessionId: string,
		text: string,
		textRevision: number,
	): Promise<WorkspaceSnapshot> {
		const session = this.getOrError(sessionId);
		if (textRevision < session.documentRevision)
			throw new SessionError(
				"STALE_REVISION",
				"Parse revision is older than the session revision",
				true,
				{ textRevision, revision: session.documentRevision },
			);
		session.loaded.workspace.editor.buffer.setText(text);
		await session.loaded.workspace.scratchpad.parseAllLines();
		session.documentRevision = textRevision;
		this.emit(session, "parse.completed");
		return this.snapshot(session);
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
			session.loaded.workspace.scratchpad,
			session.loaded.workspace.i18n,
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

	private assertRevision(session: Session, expected?: number): void {
		if (expected !== undefined && expected !== session.revision)
			throw new SessionError(
				"STALE_REVISION",
				"Request revision is stale",
				true,
				{ expected, actual: session.revision },
			);
	}

	private emit(session: Session, type: HostEventType): void {
		if (session.disposed) return;
		session.sequence += 1;
		session.revision += 1;
		const event: HostEvent = {
			version: MACRO_PROTOCOL_VERSION,
			eventId: randomUUID(),
			type,
			sessionId: session.id,
			sequence: session.sequence,
			revision: session.revision,
			payload: { snapshot: this.snapshot(session) },
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
		}));
		const keymap: EffectiveKeymapDto = {
			profileId: session.keymap.profileId,
			name: session.keymap.name,
			description: session.keymap.description,
			bindings,
		};
		const commands: CommandDescriptorDto[] = workspace.commands
			.getCommands()
			.map((command) => ({
				id: command.command,
				title: command.title,
				verb: command.verb,
				aliases: command.aliases,
				category: command.category,
				description: command.description,
				keybinding: command.keybinding,
				args: command.args,
				extensionId: command.extensionId,
			}));
		const layout = workspace.layout.getSnapshot();
		const settings = workspace.settingsUiModel
			? (serializeSettingsUiSnapshot(workspace.settingsUiModel.getSnapshot(), {
					supportedScopes: this.supportedScopes(session),
					i18n: workspace.i18n,
				}) as unknown as SettingsUiSnapshotDto)
			: undefined;
		const fallback: SettingsUiSnapshotDto = {
			activeProfileId: profileId,
			availableProfiles: [],
			activeScope: "workspace",
			supportedScopes: [...this.supportedScopes(session)],
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
		return {
			workspaceId: session.workspaceId,
			sessionId: session.id,
			profile: {
				id: profileId,
				displayName:
					session.loaded.profile?.id === profileId ? profileId : profileId,
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
			scratchpad: {
				text: workspace.editor.buffer.getText(),
				textRevision: session.documentRevision,
				lines: workspace.scratchpad.getProjectedLines().map((line) => ({
					lineNumber: line.lineNumber,
					rawText: line.rawText,
					isValid: line.isValid,
					diagnostics: line.diagnostics,
				})),
			},
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
						},
					}
				: {}),
			revision: session.revision,
		};
	}

	private supportedScopes(session: Session): SettingsScope[] {
		return ["workspace"];
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
			diagnostics: result.diagnostics as unknown as SettingsDiagnosticDto[],
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
			message: "Settings bundle revision is stale",
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
			message: `Settings storage for scope '${scope}' is not available`,
			snapshot: this.settingsSnapshot(session),
		};
	}

	private settingsSnapshot(session: Session): SettingsUiSnapshotDto {
		const uiModel = session.loaded.workspace.settingsUiModel;
		if (!uiModel) {
			return {
				activeProfileId: "base",
				availableProfiles: [],
				activeScope: "workspace",
				supportedScopes: [...this.supportedScopes(session)],
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
		return serializeSettingsUiSnapshot(uiModel.getSnapshot(), {
			supportedScopes: this.supportedScopes(session),
			i18n: session.loaded.workspace.i18n,
			settingsRevision: uiModel.getSettingsRevision(),
		}) as unknown as SettingsUiSnapshotDto;
	}
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
