import { randomUUID } from "node:crypto";
import {
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	mergeEditorKeymap,
	resolveKeymapBindings,
} from "@stateful-mcp/macro";
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
	type SettingsOperation,
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
	): Promise<WorkspaceSnapshot> {
		const session = this.getOrError(sessionId);
		const settings = session.loaded.workspace.settings;
		if (!settings)
			throw new SessionError(
				"SETTINGS_UNAVAILABLE",
				"Settings are unavailable",
				false,
			);
		this.assertRevision(session, operation.expectedRevision);
		switch (operation.operation) {
			case "set": {
				const draft = clone(settings.getDraft());
				setAtPath(draft, operation.path, operation.value);
				settings.replaceRawText(JSON.stringify(draft, null, 2));
				break;
			}
			case "replaceJson":
				settings.replaceRawText(operation.rawText);
				break;
			case "save": {
				const result = await settings.save();
				if (result.status === "blocked")
					throw new SessionError(
						"SETTINGS_INVALID",
						"Settings contain validation errors",
						false,
						result.diagnostics,
					);
				break;
			}
			case "discard":
			case "reload":
				await settings.reload();
				break;
			case "profile.select":
				await settings.switchProfile(operation.profileId);
				break;
		}
		this.emit(session, "settings.changed");
		return this.snapshot(session);
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

	private emit(
		session: Session,
		type: HostEventType,
	): void {
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
		const settings = workspace.settings;
		const layout = workspace.layout.getSnapshot();
		return {
			workspaceId: session.workspaceId,
			sessionId: session.id,
			profile: {
				id: profileId,
				displayName: session.loaded.profile?.id === profileId ? profileId : profileId,
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
			settings: settings
				? {
						effective: settings.getEffective(),
						draft: settings.getDraft(),
						rawText: settings.getRawText(),
						schema: settings.getSchema(),
						diagnostics: settings.getDiagnostics(),
						dirty: settings.isDirty(),
						activeProfileId: settings.getActiveProfileId(),
					}
				: {
						effective: {},
						draft: {},
						rawText: "{}",
						schema: [],
						diagnostics: [],
						dirty: false,
						activeProfileId: profileId,
					},
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
							historyResources: session.loaded.project.descriptor.historyResources,
						},
					}
				: {}),
			revision: session.revision,
		};
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
