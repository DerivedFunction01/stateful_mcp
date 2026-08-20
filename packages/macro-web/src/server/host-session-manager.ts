import { randomUUID } from "node:crypto";
import {
	BUILTIN_KEYMAP_PROFILES,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	keymapBindingConflicts,
	matchEffectiveBindings,
	mergeEditorKeymap,
	resolveKeymapBindings,
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
import type { LoadedMacroWorkspace, MacroHost } from "@stateful-mcp/macro-host";
import {
	type CommandDescriptorDto,
	type DiagnosticDto,
	type DomainApplicationDescriptor,
	type EffectiveKeymapDto,
	type HostError,
	type HostEvent,
	type HostEventType,
	hostError,
	type KeymapBindingContextDto,
	type KeymapBindingDto,
	type KeymapBindingResolutionDto,
	MACRO_PROTOCOL_VERSION,
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
	keymap: EditorKeymapProfile;
	readonly listeners: Set<(event: HostEvent) => void>;
	readonly unsubs: (() => void)[];
	sequence: number;
	revision: number;
	documentRevision: number;
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
			source: "macro-profile",
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
			scratchpad: {
				text: workspace.editor.buffer.getText(),
				textRevision: session.documentRevision,
				lines: workspace.scratchpad.getProjectedLines().map((line) => ({
					lineNumber: line.lineNumber,
					rawText: line.rawText,
					isValid: line.isValid,
					diagnostics: line.diagnostics.map((diagnostic) =>
						toScratchpadDiagnosticDto(diagnostic, line.isValid),
					),
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
	};
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
