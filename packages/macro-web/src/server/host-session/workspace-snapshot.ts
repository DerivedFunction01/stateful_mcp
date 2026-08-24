import {
	normalizeCommandAliases,
	resolveKeymapBindings,
} from "@stateful-mcp/macro";
import { translate } from "@stateful-mcp/macro/workspace/i18n/translation";
import type {
	CommandDescriptorDto,
	DomainApplicationDescriptor,
	EffectiveKeymapDto,
	KeymapBindingDto,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import type { Session } from "./session-types";

export function workspaceSnapshot(
	session: Session,
	dependencies: {
		readonly editorSnapshot: (session: Session) => WorkspaceSnapshot["editor"];
		readonly projectResourceTree: (
			session: Session,
		) => WorkspaceSnapshot["project"] extends infer P
			? P extends { resourceTree?: infer R }
				? R
				: never
			: never;
		readonly emptySettingsSnapshot: (
			profileId: string,
			scopes: readonly import("@stateful-mcp/macro-protocol").SettingsScope[],
		) => NonNullable<WorkspaceSnapshot["settings"]>;
		readonly supportedScopes: (
			session: Session,
		) => import("@stateful-mcp/macro-protocol").SettingsScope[];
		readonly serializeSettings: (
			snapshot: ReturnType<
				NonNullable<
					NonNullable<Session["loaded"]["workspace"]["settingsUiModel"]>
				>["getSnapshot"]
			>,
			options: {
				readonly supportedScopes: readonly import("@stateful-mcp/macro-protocol").SettingsScope[];
				readonly i18n: Session["loaded"]["workspace"]["i18n"];
			},
		) => NonNullable<WorkspaceSnapshot["settings"]>;
	},
): WorkspaceSnapshot {
	const workspace = session.loaded.workspace;
	const profileId =
		workspace.settings?.getActiveProfileId() ?? workspace.profile?.id ?? "base";
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
			sequences: session.keymap.sequences as unknown as Record<string, string>,
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
	const settings = workspace.settingsUiModel
		? dependencies.serializeSettings(workspace.settingsUiModel.getSnapshot(), {
				supportedScopes: dependencies.supportedScopes(session),
				i18n: workspace.i18n,
			})
		: undefined;
	const fallback = dependencies.emptySettingsSnapshot(
		profileId,
		dependencies.supportedScopes(session),
	);
	const resourceTree = dependencies.projectResourceTree(session);
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
		layout: workspace.layout.getSnapshot(),
		activeTabId: workspace.layout.getSnapshot().activeTabId,
		editor: dependencies.editorSnapshot(session),
		diagnostics: [],
		project: session.loaded.project
			? {
					projectId: session.loaded.project.descriptor.projectId,
					displayName: session.loaded.project.descriptor.displayName,
					lifecycle: session.loaded.project.descriptor.lifecycle,
					revision: session.loaded.project.descriptor.revision,
					resources: session.loaded.project.descriptor.resources,
					historyResources: session.loaded.project.descriptor.historyResources,
					resourceTree,
					ephemeral: false,
				}
			: {
					projectId: "in-memory",
					displayName: translate(workspace.i18n, "workbench.inMemorySession"),
					displayNameI18nKey: "workbench.inMemorySession",
					lifecycle: "open" as const,
					revision: "0",
					resources: [],
					historyResources: [],
					resourceTree: [],
					ephemeral: true,
				},
		revision: session.revision,
	};
}
