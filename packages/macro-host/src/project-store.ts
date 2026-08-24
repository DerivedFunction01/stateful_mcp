import { randomUUID } from "node:crypto";
import {
	access,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
	type HistoryResource,
	type HistoryResourceStore,
	JsonlKvBackend,
	KvHistoryResourceStore,
	SqlBackend,
	SqlExecutor,
	SqlHistoryResourceStore,
} from "@stateful-mcp/core";
import {
	KvScratchpadResourceStore,
	MACRO_PROJECT_FORMAT_VERSION,
	type MacroProjectBackendKind,
	MacroProjectConflictError,
	type MacroProjectDescriptor,
	type MacroProjectExtensionSpec,
	MacroProjectFormatError,
	type MacroProjectManifest,
	type MacroProjectResourceReference,
	type ProjectMigrationContext,
	type ProjectMigrationParticipant,
	type ScratchpadResource,
	type ScratchpadResourceStore,
	SqlScratchpadResourceStore,
	validateProjectExtensionGroups,
} from "@stateful-mcp/macro";

export { MACRO_PROJECT_FORMAT_VERSION };
export const MACRO_DIRECTORY = ".macro";
export const MACRO_MANIFEST_FILE = "project.json";
export const MACRO_DEFAULT_HISTORY_ID = "default-history";
export const MACRO_MIGRATION_LOCK_FILE = "migration.lock";
export const MACRO_MIGRATION_JOURNAL_VERSION = 1;
/** A migration journal older than this is treated as abandoned. */
export const MACRO_MIGRATION_LOCK_STALE_MS = 15 * 60_000;
const JSONL_STATE_FILE = "state.jsonl";

/**
 * Explicit migration journal states. Every state except `finalizing` can be
 * resumed by discarding the partially written target and retrying, because the
 * source backend is never mutated by a migration. `finalizing` means the
 * manifest swap may already have landed, so recovery must inspect the manifest
 * before touching the target.
 */
export type ProjectMigrationJournalStatus =
	| "preparing"
	| "copying"
	| "verifying"
	| "finalizing"
	| "failed";

export type ProjectMigrationResourceKind = "history" | "scratchpad";

export interface ProjectMigrationResourceChecksum {
	readonly resourceId: string;
	readonly kind: ProjectMigrationResourceKind;
	readonly checksum: string;
}

export interface ProjectMigrationJournalOwner {
	readonly pid: number;
	readonly hostname: string;
}

export interface ProjectMigrationJournal {
	readonly journalVersion: number;
	readonly migrationId: string;
	readonly status: ProjectMigrationJournalStatus;
	readonly resumable: boolean;
	readonly startedAt: string;
	readonly updatedAt: string;
	readonly owner: ProjectMigrationJournalOwner;
	readonly source: {
		readonly kind: MacroProjectBackendKind;
		readonly path: string;
	};
	readonly target: {
		readonly kind: MacroProjectBackendKind;
		readonly path: string;
	};
	readonly sourceDigest: string;
	readonly expectedRevision: string;
	readonly resources: readonly ProjectMigrationResourceChecksum[];
	readonly missingReferences: readonly {
		readonly resourceId: string;
		readonly kind: ProjectMigrationResourceKind;
	}[];
	readonly copiedHistory: number;
	readonly copiedScratchpads: number;
	readonly error?: string;
}

export type ProjectMigrationRecoveryAction =
	/** No journal was present. */
	| "noJournal"
	/** The journal could not be parsed, so only the journal file was removed. */
	| "invalidJournalCleared"
	/** The manifest already points at the target: only the journal was removed. */
	| "migrationCompleted"
	/** The partially written target was removed and the journal cleared. */
	| "targetDiscarded"
	/** The journal was cleared but the target was not safe to remove. */
	| "targetRetained"
	/** A live migration owns the journal, so nothing was changed. */
	| "activeMigrationRetained";

export interface ProjectMigrationRecoveryResult {
	readonly action: ProjectMigrationRecoveryAction;
	readonly journal: ProjectMigrationJournal | null;
	readonly stale?: boolean;
	readonly removedTargetPath?: string;
	readonly retainedReason?: string;
	readonly sourceDigestMatches?: boolean;
}

export interface RecoverMigrationOptions {
	/**
	 * Recover even when the journal still looks live. Defaults to `true` for
	 * explicit recovery requests; guarded paths (project open, migration lock
	 * acquisition) pass `false`.
	 */
	readonly force?: boolean;
}

export interface CreateMacroProjectOptions {
	readonly rootPath: string;
	readonly displayName?: string;
	readonly backend?: MacroProjectBackendKind;
	readonly extensions?: readonly MacroProjectExtensionSpec[];
	readonly uiLocale?: string;
}

export interface OpenMacroProjectOptions {
	readonly rootPath: string;
}

export interface MacroProject {
	readonly manifest: MacroProjectManifest;
	readonly rootPath: string;
	readonly manifestPath: string;
	readonly history: HistoryResourceStore;
	readonly scratchpads: ScratchpadResourceStore;
	readonly descriptor: MacroProjectDescriptor;
	/** Guarded journal reconciliation performed while the project was opened. */
	readonly openMigrationRecovery: ProjectMigrationRecoveryResult;
	createHistory(
		historyId: string,
		metadata?: Record<string, unknown>,
	): Promise<HistoryResource>;
	openHistory(historyId: string): Promise<HistoryResource | null>;
	saveHistory(
		resource: HistoryResource,
		expectedRevision?: string,
	): Promise<string>;
	listHistory(): ReturnType<HistoryResourceStore["list"]>;
	deleteHistory(historyId: string, expectedRevision?: string): Promise<void>;
	createScratchpad(
		scratchpadId: string,
		title?: string,
		initialText?: string,
		metadata?: Record<string, unknown>,
	): Promise<ScratchpadResource>;
	openScratchpad(scratchpadId: string): Promise<ScratchpadResource | null>;
	saveScratchpad(
		resource: ScratchpadResource,
		expectedRevision?: string,
	): Promise<string>;
	listScratchpads(): ReturnType<ScratchpadResourceStore["list"]>;
	deleteScratchpad(
		scratchpadId: string,
		expectedRevision?: string,
	): Promise<void>;
	saveManifest(
		manifest: MacroProjectManifest,
		expectedRevision: string,
	): Promise<MacroProject>;
	migrateBackend(
		target: { readonly kind: MacroProjectBackendKind; readonly path: string },
		expectedRevision: string,
		participants?: readonly ProjectMigrationParticipant[],
	): Promise<{
		readonly project: MacroProject;
		readonly copiedHistory: number;
		readonly copiedScratchpads: number;
	}>;
	readMigrationJournal(): Promise<ProjectMigrationJournal | null>;
	recoverMigration(
		options?: RecoverMigrationOptions,
	): Promise<ProjectMigrationRecoveryResult>;
	close(): Promise<void>;
}

export async function createMacroProject(
	options: CreateMacroProjectOptions,
): Promise<MacroProject> {
	const rootPath = await canonicalRoot(options.rootPath);
	const macroPath = join(rootPath, MACRO_DIRECTORY);
	const manifestPath = join(macroPath, MACRO_MANIFEST_FILE);
	if (await exists(macroPath)) {
		throw new MacroProjectConflictError("A Macro project already exists", {
			rootPath,
			manifestPath,
		});
	}
	await mkdir(macroPath, { recursive: true });
	const backend = options.backend ?? "jsonl";
	const projectId = randomUUID();
	const historyReference: MacroProjectResourceReference = {
		resourceId: MACRO_DEFAULT_HISTORY_ID,
		kind: "history",
	};
	const manifest: MacroProjectManifest = {
		formatVersion: MACRO_PROJECT_FORMAT_VERSION,
		projectId,
		displayName: options.displayName ?? rootPath.split("/").pop() ?? projectId,
		backend: {
			kind: backend,
			path: `${MACRO_DIRECTORY}/${backend === "jsonl" ? JSONL_STATE_FILE : "state.sqlite"}`,
		},
		...(options.uiLocale ? { uiLocale: options.uiLocale } : {}),
		extensions: [...(options.extensions ?? [])],
		resources: [],
		historyResources: [historyReference],
	};
	const storage = await openHistoryStorage(
		backend,
		join(rootPath, manifest.backend.path),
	);
	const history = storage.history;
	await history.create(MACRO_DEFAULT_HISTORY_ID, { projectId, default: true });
	await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
	await storage.flush();
	return openMacroProject({ rootPath });
}

export async function openMacroProject(
	options: OpenMacroProjectOptions,
): Promise<MacroProject> {
	const rootPath = resolve(options.rootPath);
	const manifestPath = join(rootPath, MACRO_DIRECTORY, MACRO_MANIFEST_FILE);
	let manifest: MacroProjectManifest;
	try {
		manifest = JSON.parse(
			await readFile(manifestPath, "utf8"),
		) as MacroProjectManifest;
	} catch (error) {
		throw new MacroProjectFormatError(
			`Unable to open Macro project manifest at ${manifestPath}: ${String(error)}`,
		);
	}
	validateMacroProjectManifest(manifest);
	const expectedPath = resolve(rootPath, manifest.backend.path);
	if (!isWithin(rootPath, expectedPath)) {
		throw new MacroProjectFormatError(
			"Project backend path escapes project root",
		);
	}
	// Guarded: never fail an open because of a leftover migration journal, and
	// never remove data the manifest still points at.
	const openMigrationRecovery = await reconcileMigrationJournal(
		rootPath,
		manifest,
		{ force: false },
	).catch(
		(): ProjectMigrationRecoveryResult => ({
			action: "noJournal",
			journal: null,
		}),
	);
	const storage = await openHistoryStorage(manifest.backend.kind, expectedPath);
	return new MacroProjectHandle(
		rootPath,
		manifestPath,
		manifest,
		storage.history,
		storage.scratchpads,
		storage.flush,
		openMigrationRecovery,
	);
}

export function validateMacroProjectManifest(
	manifest: MacroProjectManifest,
): void {
	if (!manifest || typeof manifest !== "object")
		throw new MacroProjectFormatError("Project manifest must be an object");
	if (manifest.formatVersion !== MACRO_PROJECT_FORMAT_VERSION)
		throw new MacroProjectFormatError(
			`Unsupported Macro project format version '${String(manifest.formatVersion)}'`,
		);
	if (!manifest.projectId || !manifest.displayName)
		throw new MacroProjectFormatError(
			"Project manifest requires identity metadata",
		);
	if (
		!manifest.backend ||
		!["jsonl", "sqlite"].includes(manifest.backend.kind) ||
		!manifest.backend.path
	)
		throw new MacroProjectFormatError(
			"Project manifest has an invalid backend",
		);
	if (!Array.isArray(manifest.extensions) || !Array.isArray(manifest.resources))
		throw new MacroProjectFormatError(
			"Project manifest has invalid resource data",
		);
	if (!Array.isArray(manifest.historyResources))
		throw new MacroProjectFormatError(
			"Project manifest requires history resources",
		);
	const groupDiagnostics = validateProjectExtensionGroups({
		extensions: manifest.extensions,
		...(manifest.extensionGroups ? { groups: manifest.extensionGroups } : {}),
		...(manifest.activeExtensionGroupId === undefined
			? {}
			: { activeGroupId: manifest.activeExtensionGroupId }),
	}).filter((diagnostic) => diagnostic.severity === "error");
	if (groupDiagnostics.length > 0)
		throw new MacroProjectFormatError(
			`Project manifest has invalid extension activation groups: ${groupDiagnostics
				.map((diagnostic) => diagnostic.message)
				.join("; ")}`,
		);
}

class MacroProjectHandle implements MacroProject {
	private closed = false;
	private currentManifest: MacroProjectManifest;
	private currentRevision: string;

	constructor(
		readonly rootPath: string,
		readonly manifestPath: string,
		manifest: MacroProjectManifest,
		readonly history: HistoryResourceStore,
		readonly scratchpads: ScratchpadResourceStore,
		private readonly flush: () => Promise<void>,
		readonly openMigrationRecovery: ProjectMigrationRecoveryResult = {
			action: "noJournal",
			journal: null,
		},
	) {
		this.currentManifest = manifest;
		this.currentRevision = hashJson(manifest);
	}

	get manifest(): MacroProjectManifest {
		return this.currentManifest;
	}

	get descriptor(): MacroProjectDescriptor {
		return {
			projectId: this.currentManifest.projectId,
			displayName: this.currentManifest.displayName,
			rootPath: this.rootPath,
			manifestPath: this.manifestPath,
			backend: this.currentManifest.backend,
			lifecycle: this.closed ? "closed" : "open",
			revision: this.currentRevision,
			resources: this.currentManifest.resources,
			historyResources: this.currentManifest.historyResources,
			scratchpadResources: this.currentManifest.scratchpadResources,
		};
	}

	async createHistory(
		historyId: string,
		metadata: Record<string, unknown> = {},
	) {
		this.assertOpen();
		const resource = await this.history.create(historyId, {
			...metadata,
			projectId: this.currentManifest.projectId,
		});
		const reference = { resourceId: historyId, kind: "history" };
		if (
			!this.currentManifest.historyResources.some(
				(item) => item.resourceId === historyId,
			)
		) {
			await this.saveManifest(
				{
					...this.currentManifest,
					historyResources: [
						...this.currentManifest.historyResources,
						reference,
					],
				},
				this.currentRevision,
			);
		}
		return resource;
	}

	openHistory(historyId: string) {
		this.assertOpen();
		return this.history.open(historyId);
	}

	async saveHistory(
		resource: HistoryResource,
		expectedRevision?: string,
	): Promise<string> {
		this.assertOpen();
		const current = await this.history.open(resource.historyId);
		if (
			expectedRevision &&
			(!current || hashJson(current) !== expectedRevision)
		) {
			throw new MacroProjectConflictError(
				"History resource revision is stale",
				{
					historyId: resource.historyId,
					expectedRevision,
					actualRevision: current ? hashJson(current) : undefined,
				},
			);
		}
		await this.history.save(resource);
		const saved = await this.history.open(resource.historyId);
		const revision = saved ? hashJson(saved) : hashJson(resource);
		const historyResources = this.currentManifest.historyResources.map(
			(item) =>
				item.resourceId === resource.historyId ? { ...item, revision } : item,
		);
		if (
			!historyResources.some((item) => item.resourceId === resource.historyId)
		) {
			historyResources.push({
				resourceId: resource.historyId,
				kind: "history",
				revision,
			});
		}
		await this.saveManifest(
			{ ...this.currentManifest, historyResources },
			this.currentRevision,
		);
		return revision;
	}

	listHistory() {
		this.assertOpen();
		return this.history.list();
	}

	async deleteHistory(
		historyId: string,
		expectedRevision?: string,
	): Promise<void> {
		this.assertOpen();
		const current = await this.history.open(historyId);
		if (!current) return;
		if (expectedRevision && hashJson(current) !== expectedRevision)
			throw new MacroProjectConflictError(
				"History resource revision is stale",
				{ historyId },
			);
		await this.history.delete(historyId);
		await this.saveManifest(
			{
				...this.currentManifest,
				historyResources: this.currentManifest.historyResources.filter(
					(item) => item.resourceId !== historyId,
				),
			},
			this.currentRevision,
		);
	}

	async createScratchpad(
		scratchpadId: string,
		title = "scratchpad",
		initialText = "",
		metadata: Record<string, unknown> = {},
	) {
		this.assertOpen();
		const resource = await this.scratchpads.create(
			scratchpadId,
			title,
			initialText,
			{
				...metadata,
				projectId: this.currentManifest.projectId,
			},
		);
		const reference: MacroProjectResourceReference = {
			resourceId: scratchpadId,
			kind: "scratchpad",
			metadata: { title: resource.title },
		};
		const scratchpadResources = [
			...(this.currentManifest.scratchpadResources ?? []).filter(
				(item) => item.resourceId !== scratchpadId,
			),
			reference,
		];
		await this.saveManifest(
			{
				...this.currentManifest,
				scratchpadResources,
			},
			this.currentRevision,
		);
		return resource;
	}

	openScratchpad(scratchpadId: string) {
		this.assertOpen();
		return this.scratchpads.open(scratchpadId);
	}

	async saveScratchpad(
		resource: ScratchpadResource,
		expectedRevision?: string,
	): Promise<string> {
		this.assertOpen();
		const current = await this.scratchpads.open(resource.scratchpadId);
		if (
			expectedRevision &&
			(!current || hashJson(current) !== expectedRevision)
		) {
			throw new MacroProjectConflictError(
				"Scratchpad resource revision is stale",
				{
					scratchpadId: resource.scratchpadId,
					expectedRevision,
					actualRevision: current ? hashJson(current) : undefined,
				},
			);
		}
		await this.scratchpads.save(resource);
		const saved = await this.scratchpads.open(resource.scratchpadId);
		const revision = saved ? hashJson(saved) : hashJson(resource);
		const scratchpadResources = (
			this.currentManifest.scratchpadResources ?? []
		).map((item) =>
			item.resourceId === resource.scratchpadId
				? {
						...item,
						revision,
						metadata: { ...(item.metadata ?? {}), title: resource.title },
					}
				: item,
		);
		if (
			!scratchpadResources.some(
				(item) => item.resourceId === resource.scratchpadId,
			)
		) {
			scratchpadResources.push({
				resourceId: resource.scratchpadId,
				kind: "scratchpad",
				revision,
				metadata: { title: resource.title },
			});
		}
		await this.saveManifest(
			{ ...this.currentManifest, scratchpadResources },
			this.currentRevision,
		);
		return revision;
	}

	listScratchpads() {
		this.assertOpen();
		return this.scratchpads.list();
	}

	async deleteScratchpad(
		scratchpadId: string,
		expectedRevision?: string,
	): Promise<void> {
		this.assertOpen();
		const current = await this.scratchpads.open(scratchpadId);
		if (!current) return;
		if (expectedRevision && hashJson(current) !== expectedRevision)
			throw new MacroProjectConflictError(
				"Scratchpad resource revision is stale",
				{ scratchpadId },
			);
		await this.scratchpads.delete(scratchpadId);
		await this.saveManifest(
			{
				...this.currentManifest,
				scratchpadResources: (
					this.currentManifest.scratchpadResources ?? []
				).filter((item) => item.resourceId !== scratchpadId),
			},
			this.currentRevision,
		);
	}

	async saveManifest(
		manifest: MacroProjectManifest,
		expectedRevision: string,
	): Promise<MacroProject> {
		this.assertOpen();
		const disk = JSON.parse(
			await readFile(this.manifestPath, "utf8"),
		) as MacroProjectManifest;
		const diskRevision = hashJson(disk);
		if (diskRevision !== expectedRevision)
			throw new MacroProjectConflictError(
				"Project manifest revision is stale",
				{ expectedRevision, actualRevision: diskRevision },
			);
		validateMacroProjectManifest(manifest);
		await atomicWrite(this.manifestPath, JSON.stringify(manifest, null, 2));
		this.currentManifest = manifest;
		this.currentRevision = hashJson(manifest);
		return this;
	}

	async migrateBackend(
		target: { readonly kind: MacroProjectBackendKind; readonly path: string },
		expectedRevision: string,
		participants: readonly ProjectMigrationParticipant[] = [],
	) {
		this.assertOpen();
		const targetPath = resolve(this.rootPath, target.path);
		if (!isWithin(this.rootPath, targetPath) || targetPath === this.rootPath)
			throw new MacroProjectFormatError(
				"Project backend path escapes project root",
			);
		if (
			target.kind === this.currentManifest.backend.kind &&
			target.path === this.currentManifest.backend.path
		)
			return { project: this, copiedHistory: 0, copiedScratchpads: 0 };
		if (target.path === this.currentManifest.backend.path)
			throw new MacroProjectFormatError(
				"Migration target must use a different backend path",
			);
		const lockPath = migrationLockPath(this.rootPath);
		// Guarded stale-lock handling: an abandoned journal is recovered (its
		// partial target discarded) so a retry to the same path can proceed, while
		// a live journal still blocks a second migration.
		await this.acquireMigrationJournal(lockPath);
		const occupied = await existingBackendArtifact(target.kind, targetPath);
		if (occupied)
			throw new MacroProjectConflictError("Migration target already exists", {
				targetPath: occupied,
			});
		const historyReferences = dedupeReferences(
			this.currentManifest.historyResources,
		);
		const scratchpadReferences = dedupeReferences(
			this.currentManifest.scratchpadResources ?? [],
		);
		const sourceDigest = await this.computeSourceDigest();
		const migrationId = randomUUID();
		const startedAt = new Date().toISOString();
		const owner: ProjectMigrationJournalOwner = {
			pid: process.pid,
			hostname: hostname(),
		};
		const resources: ProjectMigrationResourceChecksum[] = [];
		const missingReferences: {
			resourceId: string;
			kind: ProjectMigrationResourceKind;
		}[] = [];
		let copiedHistory = 0;
		let copiedScratchpads = 0;
		const writeJournal = async (
			status: ProjectMigrationJournalStatus,
			extra: { readonly error?: string } = {},
		): Promise<void> => {
			const journal: ProjectMigrationJournal = {
				journalVersion: MACRO_MIGRATION_JOURNAL_VERSION,
				migrationId,
				status,
				resumable: isResumableMigrationStatus(status),
				startedAt,
				updatedAt: new Date().toISOString(),
				owner,
				source: this.currentManifest.backend,
				target,
				sourceDigest,
				expectedRevision,
				resources: [...resources],
				missingReferences: [...missingReferences],
				copiedHistory,
				copiedScratchpads,
				...extra,
			};
			await atomicWrite(lockPath, JSON.stringify(journal, null, 2));
		};
		await writeJournal("preparing");
		try {
			const storage = await openHistoryStorage(target.kind, targetPath);
			await writeJournal("copying");
			for (const reference of historyReferences) {
				const resource = await this.history.open(reference.resourceId);
				if (!resource) {
					missingReferences.push({
						resourceId: reference.resourceId,
						kind: "history",
					});
					continue;
				}
				await storage.history.save(resource);
				resources.push({
					resourceId: reference.resourceId,
					kind: "history",
					checksum: historyResourceChecksum(resource),
				});
				copiedHistory += 1;
			}
			for (const reference of scratchpadReferences) {
				const resource = await this.scratchpads.open(reference.resourceId);
				if (!resource) {
					missingReferences.push({
						resourceId: reference.resourceId,
						kind: "scratchpad",
					});
					continue;
				}
				await storage.scratchpads.save(resource);
				resources.push({
					resourceId: reference.resourceId,
					kind: "scratchpad",
					checksum: scratchpadResourceChecksum(resource),
				});
				copiedScratchpads += 1;
			}
			await storage.flush();
			await writeJournal("verifying");
			// Read every copied resource back out of the target stores and compare
			// content checksums, then confirm the target holds exactly the copied
			// reference set.
			await verifyMigratedResources(storage, resources);
			// The source is never mutated by a migration, so a digest change means
			// somebody else wrote to the project while we were copying.
			const digestAfterCopy = await this.computeSourceDigest();
			if (digestAfterCopy !== sourceDigest)
				throw new MacroProjectConflictError(
					"Project source changed during migration",
					{ expectedDigest: sourceDigest, actualDigest: digestAfterCopy },
				);
			const context: ProjectMigrationContext = {
				projectRoot: this.rootPath,
				sourceBackend: this.currentManifest.backend,
				targetBackend: target,
				sourceHistory: this.history,
				sourceScratchpads: this.scratchpads,
				targetHistory: storage.history,
				targetScratchpads: storage.scratchpads,
			};
			const orderedParticipants = orderParticipants(participants);
			try {
				for (const participant of orderedParticipants)
					await participant.migrate?.(context);
				for (const participant of orderedParticipants)
					await participant.verify?.(context);
			} catch (error) {
				for (const participant of [...orderedParticipants].reverse()) {
					try {
						await participant.rollback?.(context);
					} catch {
						/* best effort */
					}
				}
				throw error;
			}
			await writeJournal("finalizing");
			const manifest = {
				...this.currentManifest,
				backend: { kind: target.kind, path: target.path },
				migration: {
					...(this.currentManifest.migration ?? {}),
					lastBackendMigration: {
						migrationId,
						from: this.currentManifest.backend,
						to: target,
						copiedHistory,
						copiedScratchpads,
						verifiedResources: resources.length,
						sourceDigest,
						...(missingReferences.length > 0
							? { missingReferences: [...missingReferences] }
							: {}),
						completedAt: new Date().toISOString(),
					},
				},
			};
			await this.saveManifest(manifest, expectedRevision);
			await rm(lockPath, { force: true });
			return { project: this, copiedHistory, copiedScratchpads };
		} catch (error) {
			await discardBackendArtifacts(target.kind, targetPath).catch(
				() => undefined,
			);
			await writeJournal("failed", {
				error: error instanceof Error ? error.message : String(error),
			}).catch(() => undefined);
			throw error;
		}
	}

	async readMigrationJournal(): Promise<ProjectMigrationJournal | null> {
		return readMigrationJournal(this.rootPath);
	}

	async recoverMigration(
		options: RecoverMigrationOptions = {},
	): Promise<ProjectMigrationRecoveryResult> {
		this.assertOpen();
		const journal = await this.readMigrationJournal();
		const sourceDigestMatches =
			journal && journal.sourceDigest
				? (await this.computeSourceDigest()) === journal.sourceDigest
				: undefined;
		const result = await reconcileMigrationJournal(
			this.rootPath,
			this.currentManifest,
			{ force: options.force ?? true },
		);
		return sourceDigestMatches === undefined
			? result
			: { ...result, sourceDigestMatches };
	}

	/**
	 * Stable content digest of the source project: manifest plus the resource
	 * summaries of both stores, ordered by resource id so backend list ordering
	 * cannot produce spurious mismatches.
	 */
	private async computeSourceDigest(): Promise<string> {
		const history = [...(await this.history.list())].sort((left, right) =>
			left.historyId.localeCompare(right.historyId),
		);
		const scratchpads = [...(await this.scratchpads.list())].sort(
			(left, right) => left.scratchpadId.localeCompare(right.scratchpadId),
		);
		return hashJson(
			canonicalJson({
				manifest: this.currentManifest,
				history,
				scratchpads,
			}),
		);
	}

	private async acquireMigrationJournal(lockPath: string): Promise<void> {
		if (!(await exists(lockPath))) return;
		const recovery = await reconcileMigrationJournal(
			this.rootPath,
			this.currentManifest,
			{ force: false },
		);
		if (recovery.action !== "activeMigrationRetained") return;
		throw new MacroProjectConflictError(
			"Another project migration is already in progress",
			{
				lockPath,
				status: recovery.journal?.status,
				resumable: recovery.journal?.resumable,
				startedAt: recovery.journal?.startedAt,
				updatedAt: recovery.journal?.updatedAt,
				owner: recovery.journal?.owner,
			},
		);
	}

	async close(): Promise<void> {
		if (!this.closed) {
			await this.flush();
			this.closed = true;
		}
	}

	private assertOpen(): void {
		if (this.closed) throw new Error("Macro project is closed");
	}
}

async function openHistoryStorage(
	kind: MacroProjectBackendKind,
	path: string,
): Promise<{
	history: HistoryResourceStore;
	scratchpads: ScratchpadResourceStore;
	flush: () => Promise<void>;
}> {
	if (kind === "jsonl") {
		const backend = new JsonlKvBackend({ dataFilePath: path });
		return {
			history: new KvHistoryResourceStore(backend),
			scratchpads: new KvScratchpadResourceStore(backend),
			flush: () => backend.save(),
		};
	}
	const backend = await SqlBackend.connect("sqlite", path);
	const executor = new SqlExecutor(backend);
	return {
		history: new SqlHistoryResourceStore(executor),
		scratchpads: new SqlScratchpadResourceStore(executor),
		flush: async () => undefined,
	};
}

function hashJson(value: unknown): string {
	let hash = 2166136261;
	for (const character of JSON.stringify(value)) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `fnv1a:${(hash >>> 0).toString(16)}`;
}

/**
 * Normalizes a value into a deterministic, backend-independent shape: object
 * keys sorted, `undefined` members dropped the way JSON would, dates rendered
 * as ISO strings. Required so a resource copied between the JSONL and SQLite
 * stores hashes identically.
 */
function canonicalJson(value: unknown): unknown {
	if (value === null || typeof value !== "object") {
		return typeof value === "undefined" ? null : value;
	}
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map((item) => canonicalJson(item));
	const source = value as Record<string, unknown>;
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(source).sort()) {
		const member = source[key];
		if (typeof member === "undefined") continue;
		result[key] = canonicalJson(member);
	}
	return result;
}

function migrationLockPath(rootPath: string): string {
	return join(rootPath, MACRO_DIRECTORY, MACRO_MIGRATION_LOCK_FILE);
}

export function isResumableMigrationStatus(
	status: ProjectMigrationJournalStatus,
): boolean {
	// `finalizing` may already have swapped the manifest, so it is never blindly
	// resumable: recovery must consult the manifest first.
	return status !== "finalizing";
}

function dedupeReferences(
	references: readonly MacroProjectResourceReference[],
): readonly MacroProjectResourceReference[] {
	const seen = new Set<string>();
	const result: MacroProjectResourceReference[] = [];
	for (const reference of references) {
		if (!reference?.resourceId || seen.has(reference.resourceId)) continue;
		seen.add(reference.resourceId);
		result.push(reference);
	}
	return result;
}

/** Content checksum for a history resource, excluding store-managed timestamps. */
export function historyResourceChecksum(resource: HistoryResource): string {
	return hashJson(
		canonicalJson({
			historyId: resource.historyId,
			formatVersion: resource.formatVersion,
			createdAt: resource.createdAt,
			metadata: resource.metadata ?? {},
			events: resource.events ?? [],
		}),
	);
}

/** Content checksum for a scratchpad resource, excluding store-managed timestamps. */
export function scratchpadResourceChecksum(
	resource: ScratchpadResource,
): string {
	return hashJson(
		canonicalJson({
			scratchpadId: resource.scratchpadId,
			formatVersion: resource.formatVersion,
			title: resource.title,
			createdAt: resource.createdAt,
			textRevision: resource.textRevision,
			rawText: resource.rawText,
			lines: resource.lines ?? [],
			executedLineIndices: resource.executedLineIndices ?? [],
			metadata: resource.metadata ?? {},
		}),
	);
}

/**
 * Reads every copied resource back out of the target stores, compares content
 * checksums, and verifies the target contains exactly the copied reference set.
 */
export async function verifyMigratedResources(
	target: {
		history: HistoryResourceStore;
		scratchpads: ScratchpadResourceStore;
	},
	expected: readonly ProjectMigrationResourceChecksum[],
): Promise<void> {
	const expectedHistory = new Map(
		expected
			.filter((entry) => entry.kind === "history")
			.map((entry) => [entry.resourceId, entry.checksum]),
	);
	const expectedScratchpads = new Map(
		expected
			.filter((entry) => entry.kind === "scratchpad")
			.map((entry) => [entry.resourceId, entry.checksum]),
	);
	const historyIds = (await target.history.list()).map(
		(item) => item.historyId,
	);
	const scratchpadIds = (await target.scratchpads.list()).map(
		(item) => item.scratchpadId,
	);
	for (const historyId of historyIds)
		if (!expectedHistory.has(historyId))
			throw new MacroProjectFormatError(
				`Migration target contains unexpected history resource '${historyId}'`,
			);
	for (const scratchpadId of scratchpadIds)
		if (!expectedScratchpads.has(scratchpadId))
			throw new MacroProjectFormatError(
				`Migration target contains unexpected scratchpad resource '${scratchpadId}'`,
			);
	for (const [historyId, checksum] of expectedHistory) {
		const copy = await target.history.open(historyId);
		if (!copy)
			throw new MacroProjectFormatError(
				`Migrated history resource '${historyId}' is missing from the target backend`,
			);
		if (historyResourceChecksum(copy) !== checksum)
			throw new MacroProjectFormatError(
				`Migrated history resource '${historyId}' failed checksum verification`,
			);
	}
	for (const [scratchpadId, checksum] of expectedScratchpads) {
		const copy = await target.scratchpads.open(scratchpadId);
		if (!copy)
			throw new MacroProjectFormatError(
				`Migrated scratchpad resource '${scratchpadId}' is missing from the target backend`,
			);
		if (scratchpadResourceChecksum(copy) !== checksum)
			throw new MacroProjectFormatError(
				`Migrated scratchpad resource '${scratchpadId}' failed checksum verification`,
			);
	}
}

/**
 * Every file a backend owns. The JSONL backend keeps a write-ahead log beside
 * its data file, and that log alone can hold a complete resource set, so it has
 * to be considered for both vacancy checks and target cleanup.
 */
function backendArtifactPaths(
	kind: MacroProjectBackendKind,
	path: string,
): readonly string[] {
	if (kind !== "jsonl") return [path];
	return [path, path.replace(/\.jsonl$/, ".wal.jsonl")];
}

async function existingBackendArtifact(
	kind: MacroProjectBackendKind,
	path: string,
): Promise<string | null> {
	for (const candidate of backendArtifactPaths(kind, path))
		if (await exists(candidate)) return candidate;
	return null;
}

async function discardBackendArtifacts(
	kind: MacroProjectBackendKind,
	path: string,
): Promise<void> {
	for (const candidate of backendArtifactPaths(kind, path))
		await rm(candidate, { force: true, recursive: true });
}

export async function readMigrationJournal(
	rootPath: string,
): Promise<ProjectMigrationJournal | null> {
	try {
		return parseMigrationJournal(
			await readFile(migrationLockPath(rootPath), "utf8"),
		);
	} catch {
		return null;
	}
}

/**
 * Parses a journal file, upgrading pre-versioned journals (which only carried
 * `status`, `startedAt`, `source` and `target`) into the explicit shape.
 * Returns `null` when the journal cannot be interpreted at all.
 */
function parseMigrationJournal(raw: string): ProjectMigrationJournal | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const record = parsed as Record<string, unknown>;
	const source = parseBackendDescriptor(record.source);
	const target = parseBackendDescriptor(record.target);
	if (!source || !target) return null;
	const status = parseMigrationStatus(record.status);
	if (!status) return null;
	const startedAt =
		typeof record.startedAt === "string" ? record.startedAt : "";
	const updatedAt =
		typeof record.updatedAt === "string"
			? record.updatedAt
			: typeof record.failedAt === "string"
				? record.failedAt
				: startedAt;
	const ownerRecord =
		record.owner && typeof record.owner === "object"
			? (record.owner as Record<string, unknown>)
			: {};
	return {
		journalVersion:
			typeof record.journalVersion === "number" ? record.journalVersion : 0,
		migrationId:
			typeof record.migrationId === "string" ? record.migrationId : "",
		status,
		resumable:
			typeof record.resumable === "boolean"
				? record.resumable
				: isResumableMigrationStatus(status),
		startedAt,
		updatedAt,
		owner: {
			pid: typeof ownerRecord.pid === "number" ? ownerRecord.pid : 0,
			hostname:
				typeof ownerRecord.hostname === "string" ? ownerRecord.hostname : "",
		},
		source,
		target,
		sourceDigest:
			typeof record.sourceDigest === "string" ? record.sourceDigest : "",
		expectedRevision:
			typeof record.expectedRevision === "string"
				? record.expectedRevision
				: "",
		resources: Array.isArray(record.resources)
			? record.resources.flatMap((entry) => {
					const item = entry as Record<string, unknown>;
					const kind = parseResourceKind(item?.kind);
					return typeof item?.resourceId === "string" &&
						typeof item?.checksum === "string" &&
						kind
						? [
								{
									resourceId: item.resourceId,
									kind,
									checksum: item.checksum,
								},
							]
						: [];
				})
			: [],
		missingReferences: Array.isArray(record.missingReferences)
			? record.missingReferences.flatMap((entry) => {
					const item = entry as Record<string, unknown>;
					const kind = parseResourceKind(item?.kind);
					return typeof item?.resourceId === "string" && kind
						? [{ resourceId: item.resourceId, kind }]
						: [];
				})
			: [],
		copiedHistory:
			typeof record.copiedHistory === "number" ? record.copiedHistory : 0,
		copiedScratchpads:
			typeof record.copiedScratchpads === "number"
				? record.copiedScratchpads
				: 0,
		...(typeof record.error === "string" ? { error: record.error } : {}),
	};
}

function parseMigrationStatus(
	value: unknown,
): ProjectMigrationJournalStatus | null {
	return value === "preparing" ||
		value === "copying" ||
		value === "verifying" ||
		value === "finalizing" ||
		value === "failed"
		? value
		: null;
}

function parseResourceKind(
	value: unknown,
): ProjectMigrationResourceKind | null {
	return value === "history" || value === "scratchpad" ? value : null;
}

function parseBackendDescriptor(
	value: unknown,
): { readonly kind: MacroProjectBackendKind; readonly path: string } | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (
		(record.kind !== "jsonl" && record.kind !== "sqlite") ||
		typeof record.path !== "string" ||
		record.path.length === 0
	)
		return null;
	return { kind: record.kind, path: record.path };
}

export function isMigrationJournalStale(
	journal: ProjectMigrationJournal,
	nowMs: number = Date.now(),
): boolean {
	// A failed journal is already finished with its target: nothing owns it.
	if (journal.status === "failed") return true;
	const stamp = Date.parse(journal.updatedAt || journal.startedAt);
	const expired =
		!Number.isFinite(stamp) || nowMs - stamp > MACRO_MIGRATION_LOCK_STALE_MS;
	const sameHost =
		journal.owner.hostname.length > 0 && journal.owner.hostname === hostname();
	if (sameHost && journal.owner.pid > 0 && !isProcessAlive(journal.owner.pid))
		return true;
	return expired;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process exists but belongs to another user.
		return (error as { code?: string })?.code === "EPERM";
	}
}

/**
 * Decides whether a journal's target may be deleted. A migration target is
 * always a freshly created path, so it is safe to remove — unless it is (or has
 * become) live project data.
 */
function canDiscardMigrationTarget(
	rootPath: string,
	manifest: MacroProjectManifest,
	journal: ProjectMigrationJournal,
): { readonly allowed: boolean; readonly reason?: string } {
	const targetPath = resolve(rootPath, journal.target.path);
	if (!isWithin(rootPath, targetPath))
		return { allowed: false, reason: "targetEscapesProjectRoot" };
	if (
		targetPath === rootPath ||
		targetPath === join(rootPath, MACRO_DIRECTORY) ||
		targetPath === join(rootPath, MACRO_DIRECTORY, MACRO_MANIFEST_FILE)
	)
		return { allowed: false, reason: "targetIsProjectMetadata" };
	if (targetPath === resolve(rootPath, manifest.backend.path))
		return { allowed: false, reason: "targetIsCurrentBackend" };
	if (targetPath === resolve(rootPath, journal.source.path))
		return { allowed: false, reason: "targetIsSourceBackend" };
	return { allowed: true };
}

/**
 * Guarded migration journal reconciliation shared by project open, explicit
 * recovery and migration lock acquisition.
 */
async function reconcileMigrationJournal(
	rootPath: string,
	manifest: MacroProjectManifest,
	options: { readonly force: boolean },
): Promise<ProjectMigrationRecoveryResult> {
	const lockPath = migrationLockPath(rootPath);
	let raw: string;
	try {
		raw = await readFile(lockPath, "utf8");
	} catch {
		return { action: "noJournal", journal: null };
	}
	const journal = parseMigrationJournal(raw);
	if (!journal) {
		// Nothing can be inferred about the target, so only the journal goes.
		await rm(lockPath, { force: true });
		return { action: "invalidJournalCleared", journal: null };
	}
	const stale = isMigrationJournalStale(journal);
	if (
		resolve(rootPath, journal.target.path) ===
		resolve(rootPath, manifest.backend.path)
	) {
		// The manifest swap landed: the target is live project data now and the
		// journal is the only leftover.
		await rm(lockPath, { force: true });
		return { action: "migrationCompleted", journal, stale };
	}
	if (!options.force && !stale)
		return { action: "activeMigrationRetained", journal, stale };
	const discardable = canDiscardMigrationTarget(rootPath, manifest, journal);
	if (!discardable.allowed) {
		await rm(lockPath, { force: true });
		return {
			action: "targetRetained",
			journal,
			stale,
			...(discardable.reason ? { retainedReason: discardable.reason } : {}),
		};
	}
	const targetPath = resolve(rootPath, journal.target.path);
	await discardBackendArtifacts(journal.target.kind, targetPath);
	await rm(lockPath, { force: true });
	return {
		action: "targetDiscarded",
		journal,
		stale,
		removedTargetPath: targetPath,
	};
}

function orderParticipants(
	participants: readonly ProjectMigrationParticipant[],
): readonly ProjectMigrationParticipant[] {
	const byId = new Map(
		participants.map((participant) => [participant.id, participant]),
	);
	const ordered: ProjectMigrationParticipant[] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visited.has(id)) return;
		if (visiting.has(id))
			throw new MacroProjectFormatError(
				`Migration participant dependency cycle at '${id}'`,
			);
		const participant = byId.get(id);
		if (!participant)
			throw new MacroProjectFormatError(
				`Missing migration participant '${id}'`,
			);
		visiting.add(id);
		for (const dependency of participant.dependsOn ?? []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
		ordered.push(participant);
	};
	for (const participant of participants) visit(participant.id);
	return ordered;
}

async function canonicalRoot(rootPath: string): Promise<string> {
	const path = resolve(rootPath);
	await mkdir(path, { recursive: true });
	return path;
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function isWithin(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function atomicWrite(path: string, content: string): Promise<void> {
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${content}\n`, "utf8");
	await rename(temporary, path);
}
