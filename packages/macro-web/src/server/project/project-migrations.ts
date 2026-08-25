import type {
	ProjectMigrationParticipant,
	ProjectMigrationParticipantPlan,
} from "@stateful-mcp/macro";
import {
	isMigrationJournalStale,
	isResumableMigrationStatus,
	type LoadedMacroWorkspace,
	type MacroProject,
} from "@stateful-mcp/macro-host";
import type {
	ProjectBackendMigrationPlanDto,
	ProjectConfigurationDto,
	ProjectMigrationJournalStatusDto,
	ProjectMigrationParticipantDto,
	ProjectMigrationRecoveryResultDto,
	ProjectOperationResult,
	WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	toProjectMigrationJournalDto,
	toProjectMigrationRecoveryResultDto,
} from "./project-projections";

/**
 * Project backend migration service.
 *
 * This module owns the migration half of the project host boundary that today
 * lives inline in `host-session-manager.ts`: planning a backend migration,
 * previewing it, reading and reconciling the migration journal, and applying,
 * resuming, or discarding a migration.
 *
 * The session, its event emitter, and the workspace reload remain owned by the
 * caller and are reached only through {@link ProjectMigrationServiceContext}.
 * That keeps every decision here observable and unit-testable without a running
 * workspace, while preserving the exact ordering and result shapes of the
 * original methods.
 *
 * Behavioural contract preserved from the session manager:
 *  - `PROJECT_REQUIRED` is raised by the caller's `requireProject`, so the
 *    boundary error type and identity are unchanged.
 *  - The configuration attached to every result is re-read through
 *    `getConfiguration()` at the moment the result is produced, so a result
 *    returned after a workspace reload reports the post-reload configuration.
 *  - A migration never mutates the source backend, so every journal state
 *    except `finalizing` is resumable.
 */

/** Backend descriptor as it crosses the host boundary. */
export type ProjectBackendDescriptor = ProjectConfigurationDto["backend"];

/** One migration participant together with the extension that contributed it. */
export interface ProjectMigrationParticipantEntry {
	readonly extensionId: string;
	readonly participant: ProjectMigrationParticipant;
}

/**
 * Maps a migration participant's plan status to an explicit, host-authored
 * translation key. The participant's own `message` is extension-authored prose
 * and must never leak into a translation key, so it is not consulted here; the
 * keys carry only safe identifier params (`participantId`, `extensionId`).
 */
export function participantMessageKey(
	status: ProjectMigrationParticipantPlan["status"] | undefined,
): string | undefined {
	if (status === "missing") return "project.migration.participant.missing";
	if (status === "incompatible")
		return "project.migration.participant.incompatible";
	return undefined;
}

/**
 * Minimal structural view of an active extension. Matches `ActiveExtension`
 * from `@stateful-mcp/macro` but only requires the two fields the migration
 * boundary reads, so tests can supply plain objects.
 */
export interface MigrationParticipantProvider {
	readonly manifest: { readonly id: string };
	readonly projectMigrationParticipants?: readonly ProjectMigrationParticipant[];
}

/**
 * Flattens active extensions into ordered participant entries. Extension order
 * and per-extension participant order are preserved, which is what the host
 * store relies on when it topologically sorts `dependsOn`.
 */
export function collectMigrationParticipants(
	extensions: readonly MigrationParticipantProvider[],
): readonly ProjectMigrationParticipantEntry[] {
	const entries: ProjectMigrationParticipantEntry[] = [];
	for (const extension of extensions) {
		for (const participant of extension.projectMigrationParticipants ?? [])
			entries.push({ extensionId: extension.manifest.id, participant });
	}
	return entries;
}

/** Collects participants from the extensions active in a loaded workspace. */
export function migrationParticipantsFromWorkspace(
	loaded: LoadedMacroWorkspace,
): readonly ProjectMigrationParticipantEntry[] {
	return collectMigrationParticipants(
		loaded.workspace.runtime.extensions.list(),
	);
}

/**
 * Everything the migration service needs from the owning session.
 *
 * Each member is a function rather than a value because a migration reloads the
 * workspace: after `reloadProject` the session points at a new
 * `LoadedMacroWorkspace` and a new `MacroProject`, and results produced
 * afterwards must reflect that new state.
 */
export interface ProjectMigrationServiceContext {
	/**
	 * Returns the currently open project or throws the caller's
	 * "a project workspace is required" boundary error (`PROJECT_REQUIRED`).
	 */
	requireProject(): MacroProject;
	/** Current project configuration DTO, re-read on every call. */
	getConfiguration(): ProjectConfigurationDto;
	/** Migration participants contributed by the currently active extensions. */
	listParticipants(): readonly ProjectMigrationParticipantEntry[];
	/** Reloads the workspace at `rootPath` and returns the fresh snapshot. */
	reloadProject(rootPath: string): Promise<WorkspaceSnapshot>;
}

/** Inputs for the default {@link ProjectMigrationServiceContext} factory. */
export interface ProjectMigrationServiceContextInput {
	/** Accessor for the live loaded workspace of the owning session. */
	readonly loaded: () => LoadedMacroWorkspace;
	readonly requireProject: () => MacroProject;
	readonly getConfiguration: () => ProjectConfigurationDto;
	readonly reloadProject: (rootPath: string) => Promise<WorkspaceSnapshot>;
	/** Overrides participant collection; defaults to the loaded workspace. */
	readonly listParticipants?: () => readonly ProjectMigrationParticipantEntry[];
}

export function createProjectMigrationServiceContext(
	input: ProjectMigrationServiceContextInput,
): ProjectMigrationServiceContext {
	return {
		requireProject: input.requireProject,
		getConfiguration: input.getConfiguration,
		listParticipants:
			input.listParticipants ??
			(() => migrationParticipantsFromWorkspace(input.loaded())),
		reloadProject: input.reloadProject,
	};
}

/**
 * Builds the migration plan for `target`.
 *
 * Every participant is asked to `plan` against the *source* stores only. The
 * target stores do not exist while planning — the concrete project store opens
 * them when the migration is applied — so `targetHistory` and
 * `targetScratchpads` are deliberately `undefined` here.
 *
 * `sourceDigest` snapshots the source history and scratchpad listings so a
 * later recovery can tell whether the source still matches the plan.
 */
export async function buildBackendMigrationPlan(
	context: ProjectMigrationServiceContext,
	target: ProjectBackendDescriptor,
): Promise<ProjectBackendMigrationPlanDto> {
	const configuration = context.getConfiguration();
	const project = context.requireProject();
	const participants: ProjectMigrationParticipantDto[] = [];
	for (const { extensionId, participant } of context.listParticipants()) {
		const result = await participant.plan?.({
			projectRoot: project.rootPath,
			sourceBackend: configuration.backend,
			targetBackend: target,
			sourceHistory: project.history,
			sourceScratchpads: project.scratchpads,
			// The target store does not exist during planning; the concrete
			// project store opens it only when the migration is applied.
			targetHistory: undefined,
			targetScratchpads: undefined,
		});
		// `result.message` is extension-authored prose and must never be used as
		// a translation key, so it is dropped. A non-ready participant instead
		// gets an explicit, host-authored key with only safe identifier params.
		const messageKey = participantMessageKey(result?.status);
		participants.push({
			id: participant.id,
			extensionId,
			dependsOn: participant.dependsOn,
			status: result?.status ?? "ready",
			resourceIds: result?.resourceIds ?? participant.resourceIds ?? [],
			...(messageKey
				? {
						messageKey,
						messageParams: {
							participantId: participant.id,
							extensionId,
						},
					}
				: {}),
		});
	}
	return {
		source: configuration.backend,
		target,
		participants,
		historyCount: project.manifest.historyResources.length,
		scratchpadCount: project.manifest.scratchpadResources?.length ?? 0,
		warnings: [],
		sourceDigest: JSON.stringify({
			history: await project.listHistory(),
			scratchpads: await project.listScratchpads(),
		}),
	};
}

/** Side-effect-free plan projection for `project.previewBackendMigration`. */
export async function previewBackendMigration(
	context: ProjectMigrationServiceContext,
	target: ProjectBackendDescriptor,
): Promise<ProjectOperationResult> {
	return {
		status: "plan",
		configuration: context.getConfiguration(),
		plan: await buildBackendMigrationPlan(context, target),
	};
}

/**
 * Reconciles an interrupted migration, honouring the store's liveness guard: a
 * journal that still looks owned by a running migration is retained.
 */
export async function recoverBackendMigration(
	context: ProjectMigrationServiceContext,
): Promise<ProjectMigrationRecoveryResultDto> {
	const project = context.requireProject();
	return toProjectMigrationRecoveryResultDto(await project.recoverMigration());
}

/**
 * Force-reconciles an interrupted migration, discarding the partially written
 * target even when the journal still looks live.
 */
export async function discardBackendMigration(
	context: ProjectMigrationServiceContext,
): Promise<ProjectMigrationRecoveryResultDto> {
	const project = context.requireProject();
	return toProjectMigrationRecoveryResultDto(
		await project.recoverMigration({ force: true }),
	);
}

/**
 * Current journal state plus the derived staleness/resumability flags.
 *
 * `resumable` intentionally requires `stale`: a journal that still looks live
 * belongs to a running migration and must not be resumed concurrently.
 */
export async function getMigrationJournalStatus(
	context: ProjectMigrationServiceContext,
): Promise<ProjectMigrationJournalStatusDto> {
	const project = context.requireProject();
	const journal = await project.readMigrationJournal();
	const stale = journal ? isMigrationJournalStale(journal) : false;
	const resumable = journal
		? isResumableMigrationStatus(journal.status) && stale
		: false;
	return {
		journal: journal ? toProjectMigrationJournalDto(journal) : null,
		stale,
		resumable,
	};
}

/**
 * Resumes the migration recorded in the journal.
 *
 * Resuming re-applies the migration to the journal's recorded target. The
 * source backend is untouched, and {@link applyBackendMigration} reconciles any
 * stale journal for the same path before copying. A `finalizing` journal is
 * refused because its target may already be authoritative.
 */
export async function resumeBackendMigration(
	context: ProjectMigrationServiceContext,
): Promise<ProjectOperationResult> {
	const project = context.requireProject();
	const journal = await project.readMigrationJournal();
	if (!journal)
		return {
			status: "rejected",
			messageKey: "project.migration.resume.noJournal",
			configuration: context.getConfiguration(),
		};
	if (!isResumableMigrationStatus(journal.status))
		return {
			status: "rejected",
			messageKey: "project.migration.finalizingCannotResume",
			configuration: context.getConfiguration(),
		};
	return applyBackendMigration(
		context,
		journal.target,
		journal.expectedRevision,
	);
}

/**
 * Applies a backend migration and reloads the workspace onto the new backend.
 *
 * Guards run in a fixed order so the caller always gets the most specific
 * rejection: identical backend, then unavailable participants, then the
 * optimistic-concurrency revision check. Only after all three does the store
 * copy any data.
 */
export async function applyBackendMigration(
	context: ProjectMigrationServiceContext,
	target: ProjectBackendDescriptor,
	expectedRevision: string,
): Promise<ProjectOperationResult> {
	const project = context.requireProject();
	const plan = await buildBackendMigrationPlan(context, target);
	if (
		plan.source.kind === plan.target.kind &&
		plan.source.path === plan.target.path
	)
		return {
			status: "rejected",
			messageKey: "project.migration.apply.identicalBackend",
			configuration: context.getConfiguration(),
		};
	if (plan.participants.some((participant) => participant.status !== "ready"))
		return {
			status: "rejected",
			messageKey: "project.migration.participantUnavailable",
			configuration: context.getConfiguration(),
		};
	if (expectedRevision !== project.descriptor.revision)
		return {
			status: "conflict",
			messageKey: "project.configuration.stale",
			configuration: context.getConfiguration(),
		};
	const participants = context
		.listParticipants()
		.map((entry) => entry.participant);
	const result = await project.migrateBackend(
		target,
		expectedRevision,
		participants,
	);
	const snapshot = await context.reloadProject(project.rootPath);
	return {
		status: "migrated",
		configuration: context.getConfiguration(),
		plan: {
			...plan,
			historyCount: result.copiedHistory,
			scratchpadCount: result.copiedScratchpads,
		},
		snapshot,
	};
}

/**
 * Thin object-oriented facade over the migration functions.
 *
 * Useful for integration: construct one per session and delegate the
 * `project.*BackendMigration` / `project.getMigrationJournal` host operations
 * to it, keeping migration policy in a single place.
 */
export class ProjectMigrationService {
	constructor(private readonly context: ProjectMigrationServiceContext) {}

	plan(
		target: ProjectBackendDescriptor,
	): Promise<ProjectBackendMigrationPlanDto> {
		return buildBackendMigrationPlan(this.context, target);
	}

	preview(target: ProjectBackendDescriptor): Promise<ProjectOperationResult> {
		return previewBackendMigration(this.context, target);
	}

	recover(): Promise<ProjectMigrationRecoveryResultDto> {
		return recoverBackendMigration(this.context);
	}

	discard(): Promise<ProjectMigrationRecoveryResultDto> {
		return discardBackendMigration(this.context);
	}

	journalStatus(): Promise<ProjectMigrationJournalStatusDto> {
		return getMigrationJournalStatus(this.context);
	}

	resume(): Promise<ProjectOperationResult> {
		return resumeBackendMigration(this.context);
	}

	apply(
		target: ProjectBackendDescriptor,
		expectedRevision: string,
	): Promise<ProjectOperationResult> {
		return applyBackendMigration(this.context, target, expectedRevision);
	}
}
