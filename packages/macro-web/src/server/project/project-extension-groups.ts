import {
	type MacroProjectManifest,
	type ProjectExtensionActivationGroupMap,
	type ProjectExtensionCatalogEntry,
	type ProjectExtensionGroupResolution,
	resolveProjectExtensionGroup,
} from "@stateful-mcp/macro";
import type {
	LoadedMacroWorkspace,
	MacroProject,
} from "@stateful-mcp/macro-host";
import type {
	ProjectConfigurationDto,
	ProjectExtensionAvailabilityDto,
	ProjectExtensionGroupDraft,
	ProjectExtensionGroupOperationResult,
	ProjectExtensionGroupPatch,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	extensionGroupImpact,
	type ProjectExtensionGroupChange,
	type ProjectExtensionGroupState,
	planProjectExtensionGroupChange,
	resolveActiveExtensionGroup,
	toProjectExtensionGroupDiagnosticDto,
	toProjectExtensionGroupDto,
	toProjectExtensionGroupResolutionDto,
	toResolverExtensions,
	validatePlannedExtensionGroups,
} from "../project-extension-groups";

/**
 * Extension Activation Group service (session-facing half).
 *
 * `../project-extension-groups` is the pure planner: it turns a current group
 * map plus one requested change into a validated next map or diagnostics. This
 * module is the stateful counterpart that today lives inline in
 * `host-session-manager.ts`: it reads the project manifest, drives the planner,
 * computes the reload impact, persists with optimistic concurrency, and reloads
 * the workspace only when the caller asked to apply the change.
 *
 * Session ownership, event emission, and workspace reload stay with the caller
 * and are reached only through {@link ProjectExtensionGroupServiceContext}.
 *
 * Behavioural contract preserved from the session manager:
 *  - `PROJECT_REQUIRED` is raised by the caller's `requireProject`, so the
 *    boundary error type and identity are unchanged.
 *  - Validation runs before the revision check, so a malformed patch is
 *    reported as `rejected` rather than masked by a stale-revision `conflict`.
 *  - Persistence always happens; the workspace reloads only when
 *    `apply === true` *and* the impact requires a reload.
 *  - A failed reload restores the previous manifest and the previous runtime, so
 *    an activation failure can never leave a half-applied active group.
 */

/**
 * Manifest fields the group state is derived from. Structurally satisfied by
 * `MacroProjectManifest`, but narrow enough to build in a test.
 */
export interface ExtensionGroupManifestView {
	readonly extensionGroups?: ProjectExtensionActivationGroupMap;
	readonly activeExtensionGroupId?: string;
}

/**
 * Projects the manifest into planner state. An absent
 * `activeExtensionGroupId` is omitted rather than set to `undefined` so
 * "no active group" stays distinguishable from "explicitly cleared".
 */
export function extensionGroupStateFromManifest(
	manifest: ExtensionGroupManifestView,
): ProjectExtensionGroupState {
	return {
		groups: manifest.extensionGroups ?? {},
		...(manifest.activeExtensionGroupId === undefined
			? {}
			: { activeGroupId: manifest.activeExtensionGroupId }),
	};
}

/** Convenience wrapper over {@link extensionGroupStateFromManifest}. */
export function extensionGroupState(
	project: MacroProject,
): ProjectExtensionGroupState {
	return extensionGroupStateFromManifest(project.manifest);
}

/**
 * Builds resolver input from a configuration DTO, carrying the host-authored
 * availability from the extension catalog so the resolver can mark declared but
 * unavailable extensions instead of silently dropping them.
 */
export function resolverExtensionsForConfiguration(
	configuration: ProjectConfigurationDto,
): readonly ProjectExtensionCatalogEntry[] {
	const availability: Record<string, ProjectExtensionAvailabilityDto> =
		Object.fromEntries(
			(configuration.extensionCatalog ?? []).map((descriptor) => [
				descriptor.id,
				descriptor.availability,
			]),
		);
	return toResolverExtensions(configuration.extensions, availability);
}

/**
 * Everything the group service needs from the owning session.
 *
 * Each member is a function because applying a group change can reload the
 * workspace: afterwards the session points at a new `LoadedMacroWorkspace` and
 * a new `MacroProject`, and results produced later must reflect that state.
 */
export interface ProjectExtensionGroupServiceContext {
	/**
	 * Returns the currently open project or throws the caller's
	 * "a project workspace is required" boundary error (`PROJECT_REQUIRED`).
	 */
	requireProject(): MacroProject;
	/**
	 * Returns the open project, or `undefined` when no project is open or the
	 * session has been disposed. Used after a rollback, where the session may no
	 * longer have a project to report a configuration for.
	 */
	tryGetProject(): MacroProject | undefined;
	/** Current project configuration DTO, re-read on every call. */
	getConfiguration(): ProjectConfigurationDto;
	/**
	 * Activation resolution reported by the workspace loader for the running
	 * workspace, when it recorded one.
	 */
	loadedResolution(): ProjectExtensionGroupResolution | undefined;
	/** Reloads the workspace at `rootPath` and returns the fresh snapshot. */
	reloadProject(rootPath: string): Promise<WorkspaceSnapshot>;
	/** Emits the session's `workspace.changed` event. */
	emitWorkspaceChanged(): void;
}

/** Inputs for the default {@link ProjectExtensionGroupServiceContext} factory. */
export interface ProjectExtensionGroupServiceContextInput {
	/**
	 * Accessor for the owning session's loaded workspace. Returns `undefined`
	 * when the session is gone, mirroring an optional session lookup.
	 */
	readonly loaded: () => LoadedMacroWorkspace | undefined;
	readonly requireProject: () => MacroProject;
	readonly getConfiguration: () => ProjectConfigurationDto;
	readonly reloadProject: (rootPath: string) => Promise<WorkspaceSnapshot>;
	readonly emitWorkspaceChanged: () => void;
}

export function createProjectExtensionGroupServiceContext(
	input: ProjectExtensionGroupServiceContextInput,
): ProjectExtensionGroupServiceContext {
	return {
		requireProject: input.requireProject,
		tryGetProject: () => input.loaded()?.project,
		getConfiguration: input.getConfiguration,
		loadedResolution: () => input.loaded()?.extensionGroupResolution,
		reloadProject: input.reloadProject,
		emitWorkspaceChanged: input.emitWorkspaceChanged,
	};
}

/**
 * Activation state of the running workspace. Falls back to resolving the
 * manifest when the loader did not report a resolution, and to an empty
 * resolution when no project is open.
 */
export function currentActivationResolution(
	context: ProjectExtensionGroupServiceContext,
	extensions: readonly ProjectExtensionCatalogEntry[],
): ProjectExtensionGroupResolution {
	const loaded = context.loadedResolution();
	if (loaded) return loaded;
	const project = context.tryGetProject();
	if (!project) return resolveProjectExtensionGroup({ extensions: [] });
	return resolveActiveExtensionGroup(extensionGroupState(project), extensions);
}

export interface PreviewExtensionGroupRequest {
	readonly groupId?: string;
	/** Staged, not-yet-persisted direct membership to resolve instead. */
	readonly extensionIds?: readonly string[];
	readonly setActive?: boolean;
}

export interface CreateExtensionGroupRequest {
	readonly group: ProjectExtensionGroupDraft;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

export interface UpdateExtensionGroupRequest {
	readonly patch: ProjectExtensionGroupPatch;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

export interface DuplicateExtensionGroupRequest {
	readonly sourceGroupId: string;
	readonly displayName?: string;
	readonly groupId?: string;
	readonly setActive?: boolean;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

export interface DeleteExtensionGroupRequest {
	readonly groupId: string;
	readonly replacementGroupId?: string;
	readonly clearActive?: boolean;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

export interface SetActiveExtensionGroupRequest {
	readonly groupId: string | null;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

export interface ApplyExtensionGroupChangeRequest {
	readonly change: ProjectExtensionGroupChange;
	readonly expectedRevision: string;
	readonly apply?: boolean;
}

/**
 * Side-effect-free group preview. Resolves the group (optionally with staged
 * membership that has not been persisted) and reports the reload impact of
 * activating it, using the canonical resolver and the current catalog.
 */
export function previewExtensionGroup(
	context: ProjectExtensionGroupServiceContext,
	request: PreviewExtensionGroupRequest = {},
): ProjectExtensionGroupOperationResult {
	const project = context.requireProject();
	const configuration = context.getConfiguration();
	const extensions = resolverExtensionsForConfiguration(configuration);
	const state = extensionGroupState(project);
	const resolution = resolveProjectExtensionGroup({
		extensions,
		groups: state.groups,
		...(request.groupId === undefined ? {} : { groupId: request.groupId }),
		...(request.extensionIds === undefined
			? {}
			: { directExtensionIds: request.extensionIds }),
	});
	// The impact of a preview is always measured against what is running now,
	// so an inactive group preview reports what activating it would change.
	// Note: with no `groupId` and no `setActive`, `activeGroupId === groupId`
	// compares `undefined === undefined`, which is intentionally truthy — the
	// "no active group" preview is a preview of the state already running.
	const wouldActivate =
		request.setActive === true || state.activeGroupId === request.groupId;
	const proposed = wouldActivate
		? resolution
		: resolveActiveExtensionGroup(state, extensions);
	const impact = extensionGroupImpact(
		currentActivationResolution(context, extensions),
		proposed,
	);
	const group = request.groupId ? state.groups[request.groupId] : undefined;
	return {
		status: "preview",
		configuration,
		...(request.groupId === undefined ? {} : { groupId: request.groupId }),
		...(group ? { group: toProjectExtensionGroupDto(group) } : {}),
		resolution: toProjectExtensionGroupResolutionDto(resolution),
		impact,
		diagnostics: resolution.diagnostics.map(
			toProjectExtensionGroupDiagnosticDto,
		),
	};
}

export async function createExtensionGroup(
	context: ProjectExtensionGroupServiceContext,
	request: CreateExtensionGroupRequest,
): Promise<ProjectExtensionGroupOperationResult> {
	return applyExtensionGroupChange(context, {
		change: { kind: "create", group: request.group },
		expectedRevision: request.expectedRevision,
		...(request.apply === undefined ? {} : { apply: request.apply }),
	});
}

export async function updateExtensionGroup(
	context: ProjectExtensionGroupServiceContext,
	request: UpdateExtensionGroupRequest,
): Promise<ProjectExtensionGroupOperationResult> {
	return applyExtensionGroupChange(context, {
		change: { kind: "update", patch: request.patch },
		expectedRevision: request.expectedRevision,
		...(request.apply === undefined ? {} : { apply: request.apply }),
	});
}

export async function duplicateExtensionGroup(
	context: ProjectExtensionGroupServiceContext,
	request: DuplicateExtensionGroupRequest,
): Promise<ProjectExtensionGroupOperationResult> {
	return applyExtensionGroupChange(context, {
		change: {
			kind: "duplicate",
			sourceGroupId: request.sourceGroupId,
			...(request.displayName === undefined
				? {}
				: { displayName: request.displayName }),
			...(request.groupId === undefined ? {} : { groupId: request.groupId }),
			...(request.setActive === undefined
				? {}
				: { setActive: request.setActive }),
		},
		expectedRevision: request.expectedRevision,
		...(request.apply === undefined ? {} : { apply: request.apply }),
	});
}

export async function deleteExtensionGroup(
	context: ProjectExtensionGroupServiceContext,
	request: DeleteExtensionGroupRequest,
): Promise<ProjectExtensionGroupOperationResult> {
	return applyExtensionGroupChange(context, {
		change: {
			kind: "delete",
			groupId: request.groupId,
			...(request.replacementGroupId === undefined
				? {}
				: { replacementGroupId: request.replacementGroupId }),
			...(request.clearActive === undefined
				? {}
				: { clearActive: request.clearActive }),
		},
		expectedRevision: request.expectedRevision,
		...(request.apply === undefined ? {} : { apply: request.apply }),
	});
}

export async function setActiveExtensionGroup(
	context: ProjectExtensionGroupServiceContext,
	request: SetActiveExtensionGroupRequest,
): Promise<ProjectExtensionGroupOperationResult> {
	return applyExtensionGroupChange(context, {
		change: { kind: "setActive", groupId: request.groupId },
		expectedRevision: request.expectedRevision,
		...(request.apply === undefined ? {} : { apply: request.apply }),
	});
}

/**
 * Shared mutation path for every group operation:
 * validate the patch, resolve the dependency closure, compute the reload
 * impact, persist with optimistic concurrency, and only reload the workspace
 * when the caller asked to apply the change. A failed reload restores the
 * previous manifest and previous runtime so activation failures can never
 * leave a half-applied active group.
 */
export async function applyExtensionGroupChange(
	context: ProjectExtensionGroupServiceContext,
	request: ApplyExtensionGroupChangeRequest,
): Promise<ProjectExtensionGroupOperationResult> {
	const project = context.requireProject();
	const configuration = context.getConfiguration();
	const extensions = resolverExtensionsForConfiguration(configuration);
	const state = extensionGroupState(project);
	const planned = planProjectExtensionGroupChange(state, request.change);
	if (!planned.ok)
		return {
			status: "rejected",
			message: planned.diagnostics
				.map((diagnostic) => diagnostic.message)
				.join("; "),
			configuration,
			diagnostics: planned.diagnostics.map(
				toProjectExtensionGroupDiagnosticDto,
			),
		};
	const validation = validatePlannedExtensionGroups(planned.plan, extensions);
	const blocking = validation.filter((item) => item.severity === "error");
	if (blocking.length > 0)
		return {
			status: "rejected",
			message: blocking.map((diagnostic) => diagnostic.message).join("; "),
			configuration,
			diagnostics: validation.map(toProjectExtensionGroupDiagnosticDto),
		};
	// Revision is checked after validation so a malformed patch is reported as
	// rejected rather than masked by a stale-revision conflict.
	if (request.expectedRevision !== project.descriptor.revision)
		return {
			status: "conflict",
			message: "Project configuration is stale",
			configuration,
		};

	const currentResolution = currentActivationResolution(context, extensions);
	const proposedResolution = resolveActiveExtensionGroup(
		planned.plan,
		extensions,
	);
	const impact = extensionGroupImpact(currentResolution, proposedResolution);
	const groupResolution = planned.plan.groupId
		? resolveProjectExtensionGroup({
				extensions,
				groups: planned.plan.groups,
				groupId: planned.plan.groupId,
			})
		: proposedResolution;
	// Captured before `saveManifest`, which replaces the project's current
	// manifest in place. This is the state a failed activation rolls back to.
	const previousManifest = project.manifest;
	const nextManifest: MacroProjectManifest = {
		...previousManifest,
		extensionGroups: planned.plan.groups,
		...(planned.plan.activeGroupId === undefined
			? { activeExtensionGroupId: undefined }
			: { activeExtensionGroupId: planned.plan.activeGroupId }),
	};
	await project.saveManifest(nextManifest, request.expectedRevision);

	const diagnostics = [
		...planned.plan.diagnostics,
		...validation,
		...groupResolution.diagnostics,
	].map(toProjectExtensionGroupDiagnosticDto);
	const plannedGroup = planned.plan.groupId
		? planned.plan.groups[planned.plan.groupId]
		: undefined;
	const shouldApply = request.apply === true && impact.requiresReload;
	if (!shouldApply) {
		context.emitWorkspaceChanged();
		return {
			status: "accepted",
			configuration: context.getConfiguration(),
			...(planned.plan.groupId === undefined
				? {}
				: { groupId: planned.plan.groupId }),
			...(plannedGroup
				? { group: toProjectExtensionGroupDto(plannedGroup) }
				: {}),
			resolution: toProjectExtensionGroupResolutionDto(groupResolution),
			impact,
			diagnostics,
			applied: false,
		};
	}

	const rootPath = project.rootPath;
	try {
		const snapshot = await context.reloadProject(rootPath);
		return {
			status: "accepted",
			configuration: context.getConfiguration(),
			...(planned.plan.groupId === undefined
				? {}
				: { groupId: planned.plan.groupId }),
			resolution: toProjectExtensionGroupResolutionDto(groupResolution),
			impact,
			diagnostics,
			applied: true,
			snapshot,
		};
	} catch (error) {
		// Activation failed: restore the manifest and the previous runtime so the
		// project never keeps a partially activated group.
		const message =
			error instanceof Error ? error.message : "Workspace reload failed";
		await restoreExtensionGroups(context, project, previousManifest).catch(
			() => undefined,
		);
		return {
			status: "rejected",
			message: `Activating the extension group failed and was rolled back: ${message}`,
			...(context.tryGetProject()
				? { configuration: context.getConfiguration() }
				: {}),
			diagnostics,
		};
	}
}

/**
 * Writes the previous group state back and reloads the previous runtime.
 *
 * Uses the project's *current* revision, not the caller's original
 * `expectedRevision`, because the failed attempt already advanced it.
 */
export async function restoreExtensionGroups(
	context: ProjectExtensionGroupServiceContext,
	project: MacroProject,
	previousManifest: MacroProjectManifest,
): Promise<void> {
	await project.saveManifest(previousManifest, project.descriptor.revision);
	await context.reloadProject(project.rootPath);
}

/**
 * Thin object-oriented facade over the group functions.
 *
 * Useful for integration: construct one per session and delegate the
 * `project.*ExtensionGroup` host operations to it.
 */
export class ProjectExtensionGroupService {
	constructor(private readonly context: ProjectExtensionGroupServiceContext) {}

	preview(
		request: PreviewExtensionGroupRequest = {},
	): ProjectExtensionGroupOperationResult {
		return previewExtensionGroup(this.context, request);
	}

	create(
		request: CreateExtensionGroupRequest,
	): Promise<ProjectExtensionGroupOperationResult> {
		return createExtensionGroup(this.context, request);
	}

	update(
		request: UpdateExtensionGroupRequest,
	): Promise<ProjectExtensionGroupOperationResult> {
		return updateExtensionGroup(this.context, request);
	}

	duplicate(
		request: DuplicateExtensionGroupRequest,
	): Promise<ProjectExtensionGroupOperationResult> {
		return duplicateExtensionGroup(this.context, request);
	}

	delete(
		request: DeleteExtensionGroupRequest,
	): Promise<ProjectExtensionGroupOperationResult> {
		return deleteExtensionGroup(this.context, request);
	}

	setActive(
		request: SetActiveExtensionGroupRequest,
	): Promise<ProjectExtensionGroupOperationResult> {
		return setActiveExtensionGroup(this.context, request);
	}

	applyChange(
		request: ApplyExtensionGroupChangeRequest,
	): Promise<ProjectExtensionGroupOperationResult> {
		return applyExtensionGroupChange(this.context, request);
	}
}
