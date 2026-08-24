import type {
	LoadedMacroWorkspace,
	MacroProject,
	ProjectMigrationJournal,
	ProjectMigrationRecoveryResult,
} from "@stateful-mcp/macro-host";
import type {
	ProjectConfigurationDto,
	ProjectExtensionAvailabilityDto,
	ProjectExtensionDescriptorDto,
	ProjectMigrationJournalDto,
	ProjectMigrationJournalOwnerDto,
	ProjectMigrationRecoveryAction,
	ProjectMigrationRecoveryResultDto,
	ProjectSettingsContributionDto,
	SettingsSchemaEntryDto,
} from "@stateful-mcp/macro-protocol";
import {
	buildProjectExtensionCatalog,
	resolveActiveExtensionGroup,
	toProjectExtensionGroupDto,
	toProjectExtensionGroupResolutionDto,
	toResolverExtensions,
} from "../project-extension-groups";

/**
 * Builds the project settings contribution list from the active workspace's
 * extensions. Shared by the configuration projection and the boundary
 * validation so both agree on the available schema.
 */
export function buildProjectSettingsContributions(
	loaded: LoadedMacroWorkspace,
): ProjectSettingsContributionDto[] {
	return loaded.workspace.runtime.extensions.list().flatMap((extension) =>
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
export function toProjectConfigurationDto(
	project: MacroProject,
	loaded: LoadedMacroWorkspace,
): ProjectConfigurationDto {
	const manifest = project.manifest;
	const projectSettingsContributions =
		buildProjectSettingsContributions(loaded);
	const extensionCatalog = buildExtensionCatalog(project, loaded);
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
		availableLocales: loaded.workspace.i18n.getAvailableLocales(),
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
export function buildExtensionCatalog(
	project: MacroProject,
	loaded: LoadedMacroWorkspace,
): readonly ProjectExtensionDescriptorDto[] {
	const runtime = loaded.workspace.runtime;
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

export function toProjectMigrationJournalDto(
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

export function toProjectMigrationRecoveryResultDto(
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
