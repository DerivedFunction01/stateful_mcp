import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { JsonlKvBackend, KvHistoryResourceStore } from "@stateful-mcp/core";
import { KvScratchpadResourceStore } from "@stateful-mcp/macro";
import {
	createMacroProject,
	historyResourceChecksum,
	MACRO_DEFAULT_HISTORY_ID,
	MacroProjectConflictError,
	openMacroProject,
	type ProjectMigrationJournal,
	scratchpadResourceChecksum,
	verifyMigratedResources,
} from "../src";

async function projectRoot(): Promise<string> {
	return mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-migration-"));
}

function lockPath(root: string): string {
	return join(root, ".macro", "migration.lock");
}

async function readJournal(root: string): Promise<ProjectMigrationJournal> {
	return JSON.parse(
		await readFile(lockPath(root), "utf8"),
	) as ProjectMigrationJournal;
}

async function fileExists(path: string): Promise<boolean> {
	return Bun.file(path).exists();
}

async function seedProject(
	root: string,
	backend: "jsonl" | "sqlite" = "jsonl",
): Promise<Awaited<ReturnType<typeof createMacroProject>>> {
	const project = await createMacroProject({ rootPath: root, backend });
	const history = await project.openHistory(MACRO_DEFAULT_HISTORY_ID);
	if (!history) throw new Error("Expected the default history resource");
	history.events.push({
		type: "seed",
		payload: { value: 1 },
	} as never);
	await project.saveHistory(history);
	await project.createScratchpad("note", "Note", "line one\nline two");
	return project;
}

describe("project migration journal", () => {
	test("keeps one journal entry per state and never drops the source digest", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		const observed: ProjectMigrationJournal[] = [];
		const store = project.history as unknown as {
			open: (historyId: string) => Promise<unknown>;
		};
		const originalOpen = store.open.bind(store);
		store.open = async (historyId: string) => {
			observed.push(await readJournal(root));
			return originalOpen(historyId);
		};
		await project.migrateBackend(
			{ kind: "sqlite", path: ".macro/journal.sqlite" },
			project.descriptor.revision,
			[
				{
					id: "journal-observer",
					migrate: async () => {
						observed.push(await readJournal(root));
					},
				},
			],
		);
		store.open = originalOpen;
		expect(observed).toHaveLength(2);
		// The journal seen while resources are copied must still carry the digest
		// captured before the copy started.
		const copying = observed[0]!;
		expect(copying.status).toBe("copying");
		expect(copying.resumable).toBe(true);
		expect(copying.sourceDigest).toStartWith("fnv1a:");
		const journal = observed[1]!;
		expect(journal.status).toBe("verifying");
		expect(journal.resumable).toBe(true);
		expect(journal.journalVersion).toBe(1);
		expect(journal.sourceDigest).toBe(copying.sourceDigest);
		expect(journal.migrationId).toBe(copying.migrationId);
		expect(journal.startedAt).toBe(copying.startedAt);
		expect(journal.expectedRevision).toBeString();
		expect(journal.owner).toEqual({ pid: process.pid, hostname: hostname() });
		expect(journal.source).toEqual({
			kind: "jsonl",
			path: ".macro/state.jsonl",
		});
		expect(journal.target).toEqual({
			kind: "sqlite",
			path: ".macro/journal.sqlite",
		});
		expect(journal.copiedHistory).toBe(1);
		expect(journal.copiedScratchpads).toBe(1);
		expect(journal.missingReferences).toEqual([]);
		expect(
			journal.resources
				.map((entry) => `${entry.kind}:${entry.resourceId}`)
				.sort(),
		).toEqual(["history:default-history", "scratchpad:note"]);
		for (const entry of journal.resources)
			expect(entry.checksum).toStartWith("fnv1a:");
		expect(await fileExists(lockPath(root))).toBe(false);
		await project.close();
	});

	test("records verification metadata and removes the journal on success", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		const sourceHistory = await project.openHistory(MACRO_DEFAULT_HISTORY_ID);
		const sourceScratchpad = await project.openScratchpad("note");
		const result = await project.migrateBackend(
			{ kind: "sqlite", path: ".macro/verified.sqlite" },
			project.descriptor.revision,
		);
		expect(result.copiedHistory).toBe(1);
		expect(result.copiedScratchpads).toBe(1);
		const record = (
			project.manifest.migration as {
				lastBackendMigration: Record<string, unknown>;
			}
		).lastBackendMigration;
		expect(record.migrationId).toBeString();
		expect(record.verifiedResources).toBe(2);
		expect(record.sourceDigest).toStartWith("fnv1a:");
		expect(record.missingReferences).toBeUndefined();
		expect(await fileExists(lockPath(root))).toBe(false);
		await project.close();

		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.manifest.backend.kind).toBe("sqlite");
		expect(reopened.openMigrationRecovery.action).toBe("noJournal");
		const migratedHistory = await reopened.openHistory(
			MACRO_DEFAULT_HISTORY_ID,
		);
		const migratedScratchpad = await reopened.openScratchpad("note");
		// Content checksums are backend independent, so a faithful copy hashes
		// identically even though the store rewrites `updatedAt`.
		expect(historyResourceChecksum(migratedHistory!)).toBe(
			historyResourceChecksum(sourceHistory!),
		);
		expect(scratchpadResourceChecksum(migratedScratchpad!)).toBe(
			scratchpadResourceChecksum(sourceScratchpad!),
		);
		await reopened.close();
	});

	test("checksums ignore store timestamps but track content", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		const history = await project.openHistory(MACRO_DEFAULT_HISTORY_ID)!;
		const baseline = historyResourceChecksum(history!);
		expect(
			historyResourceChecksum({
				...history!,
				updatedAt: new Date(Date.now() + 60_000).toISOString(),
			}),
		).toBe(baseline);
		expect(
			historyResourceChecksum({
				...history!,
				events: [...history!.events, { type: "extra", payload: {} } as never],
			}),
		).not.toBe(baseline);
		await project.close();
	});

	test("skips duplicate references and reports missing ones", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		await project.saveManifest(
			{
				...project.manifest,
				historyResources: [
					{ resourceId: MACRO_DEFAULT_HISTORY_ID, kind: "history" },
					{ resourceId: MACRO_DEFAULT_HISTORY_ID, kind: "history" },
					{ resourceId: "ghost-history", kind: "history" },
				],
			},
			project.descriptor.revision,
		);
		const result = await project.migrateBackend(
			{ kind: "sqlite", path: ".macro/references.sqlite" },
			project.descriptor.revision,
		);
		expect(result.copiedHistory).toBe(1);
		const record = (
			project.manifest.migration as {
				lastBackendMigration: {
					verifiedResources: number;
					missingReferences: readonly {
						resourceId: string;
						kind: string;
					}[];
				};
			}
		).lastBackendMigration;
		expect(record.verifiedResources).toBe(2);
		expect(record.missingReferences).toEqual([
			{ resourceId: "ghost-history", kind: "history" },
		]);
		await project.close();
	});

	test("verifies copied resources against the manifest references", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		const store = project.history as unknown as {
			open: (historyId: string) => Promise<{ historyId: string } | null>;
		};
		const originalOpen = store.open.bind(store);
		// A resource that does not answer to the id it was referenced by must not
		// silently land in the target under a different key.
		store.open = async (historyId: string) => {
			const resource = await originalOpen(historyId);
			return resource ? { ...resource, historyId: "spoofed" } : resource;
		};
		await expect(
			project.migrateBackend(
				{ kind: "sqlite", path: ".macro/spoofed.sqlite" },
				project.descriptor.revision,
			),
		).rejects.toThrow("unexpected history resource 'spoofed'");
		store.open = originalOpen;
		expect(project.manifest.backend.kind).toBe("jsonl");
		expect(await fileExists(join(root, ".macro", "spoofed.sqlite"))).toBe(
			false,
		);
		expect((await readJournal(root)).status).toBe("failed");
		await project.close();
	});

	test("aborts and discards the target when the source changes mid-copy", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		const store = project.history as unknown as {
			open: (historyId: string) => Promise<unknown>;
		};
		const originalOpen = store.open.bind(store);
		let intruded = false;
		store.open = async (historyId: string) => {
			if (!intruded) {
				intruded = true;
				await project.createScratchpad("intruder", "Intruder", "mid-copy");
			}
			return originalOpen(historyId);
		};
		await expect(
			project.migrateBackend(
				{ kind: "sqlite", path: ".macro/raced.sqlite" },
				project.descriptor.revision,
			),
		).rejects.toBeInstanceOf(MacroProjectConflictError);
		store.open = originalOpen;
		expect(project.manifest.backend.kind).toBe("jsonl");
		expect(await fileExists(join(root, ".macro", "raced.sqlite"))).toBe(false);
		const journal = await readJournal(root);
		expect(journal.status).toBe("failed");
		expect(journal.resumable).toBe(true);
		expect(journal.error).toBe("project.migration.error.conflict");
		await project.close();
	});

	test("retries the same target after a failed migration without manual recovery", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		const target = { kind: "sqlite" as const, path: ".macro/retry.sqlite" };
		await expect(
			project.migrateBackend(target, project.descriptor.revision, [
				{
					id: "failing",
					verify: () => {
						throw new Error("verification failed");
					},
				},
			]),
		).rejects.toThrow("verification failed");
		expect((await readJournal(root)).status).toBe("failed");
		const result = await project.migrateBackend(
			target,
			project.descriptor.revision,
		);
		expect(result.copiedHistory).toBe(1);
		expect(project.manifest.backend).toEqual(target);
		expect(await fileExists(lockPath(root))).toBe(false);
		await project.close();
	});

	test("explicit recovery reports a matching source digest and clears the journal", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		await expect(
			project.migrateBackend(
				{ kind: "sqlite", path: ".macro/recovered.sqlite" },
				project.descriptor.revision,
				[
					{
						id: "failing",
						verify: () => {
							throw new Error("verification failed");
						},
					},
				],
			),
		).rejects.toThrow("verification failed");
		const recovery = await project.recoverMigration();
		expect(recovery.action).toBe("targetDiscarded");
		expect(recovery.stale).toBe(true);
		expect(recovery.sourceDigestMatches).toBe(true);
		expect(recovery.removedTargetPath).toBe(
			join(root, ".macro", "recovered.sqlite"),
		);
		expect(await fileExists(lockPath(root))).toBe(false);
		expect(await project.readMigrationJournal()).toBeNull();
		expect(project.manifest.backend.kind).toBe("jsonl");
		expect(await project.openHistory(MACRO_DEFAULT_HISTORY_ID)).not.toBeNull();
		await project.close();
	});

	test("recovery on a project without a journal is a no-op", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		const recovery = await project.recoverMigration();
		expect(recovery.action).toBe("noJournal");
		expect(recovery.journal).toBeNull();
		await project.close();
	});
});

describe("project migration recovery on open", () => {
	async function stageJournal(
		root: string,
		journal: Partial<ProjectMigrationJournal> & {
			target: ProjectMigrationJournal["target"];
		},
	): Promise<void> {
		const now = new Date().toISOString();
		await writeFile(
			lockPath(root),
			JSON.stringify({
				journalVersion: 1,
				migrationId: "staged",
				status: "copying",
				resumable: true,
				startedAt: now,
				updatedAt: now,
				owner: { pid: process.pid, hostname: hostname() },
				source: { kind: "jsonl", path: ".macro/state.jsonl" },
				sourceDigest: "fnv1a:deadbeef",
				expectedRevision: "fnv1a:0",
				resources: [],
				missingReferences: [],
				copiedHistory: 0,
				copiedScratchpads: 0,
				...journal,
			}),
			"utf8",
		);
	}

	test("discards the partial target of an abandoned migration", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		await project.close();
		const target = join(root, ".macro", "abandoned.sqlite");
		await writeFile(target, "partial", "utf8");
		await stageJournal(root, {
			status: "copying",
			updatedAt: "2020-01-01T00:00:00.000Z",
			startedAt: "2020-01-01T00:00:00.000Z",
			target: { kind: "sqlite", path: ".macro/abandoned.sqlite" },
		});
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.openMigrationRecovery.action).toBe("targetDiscarded");
		expect(reopened.openMigrationRecovery.stale).toBe(true);
		expect(reopened.openMigrationRecovery.removedTargetPath).toBe(target);
		expect(await fileExists(target)).toBe(false);
		expect(await fileExists(lockPath(root))).toBe(false);
		expect(reopened.manifest.backend.kind).toBe("jsonl");
		expect(await reopened.openHistory(MACRO_DEFAULT_HISTORY_ID)).not.toBeNull();
		await reopened.close();
	});

	test("also discards the JSONL write-ahead log of an abandoned target", async () => {
		const root = await projectRoot();
		const project = await seedProject(root, "sqlite");
		await project.close();
		const data = join(root, ".macro", "abandoned.jsonl");
		const wal = join(root, ".macro", "abandoned.wal.jsonl");
		await writeFile(wal, '{"key":"a","value":1}\n', "utf8");
		await stageJournal(root, {
			updatedAt: "2020-01-01T00:00:00.000Z",
			startedAt: "2020-01-01T00:00:00.000Z",
			source: { kind: "sqlite", path: ".macro/state.sqlite" },
			target: { kind: "jsonl", path: ".macro/abandoned.jsonl" },
		});
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.openMigrationRecovery.action).toBe("targetDiscarded");
		expect(await fileExists(data)).toBe(false);
		expect(await fileExists(wal)).toBe(false);
		await reopened.close();
	});

	test("retains a live journal and blocks a concurrent migration", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		await project.close();
		const target = join(root, ".macro", "inflight.sqlite");
		await writeFile(target, "partial", "utf8");
		await stageJournal(root, {
			target: { kind: "sqlite", path: ".macro/inflight.sqlite" },
		});
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.openMigrationRecovery.action).toBe(
			"activeMigrationRetained",
		);
		expect(reopened.openMigrationRecovery.stale).toBe(false);
		expect(await fileExists(target)).toBe(true);
		expect(await fileExists(lockPath(root))).toBe(true);
		await expect(
			reopened.migrateBackend(
				{ kind: "sqlite", path: ".macro/other.sqlite" },
				reopened.descriptor.revision,
			),
		).rejects.toThrow("Another project migration is already in progress");
		expect(await fileExists(target)).toBe(true);
		await reopened.close();
	});

	test("clears the journal of a completed migration without touching live data", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		await project.close();
		await stageJournal(root, {
			status: "finalizing",
			resumable: false,
			source: { kind: "sqlite", path: ".macro/previous.sqlite" },
			target: { kind: "jsonl", path: ".macro/state.jsonl" },
		});
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.openMigrationRecovery.action).toBe("migrationCompleted");
		expect(await fileExists(lockPath(root))).toBe(false);
		expect(await reopened.openHistory(MACRO_DEFAULT_HISTORY_ID)).not.toBeNull();
		expect(await reopened.openScratchpad("note")).not.toBeNull();
		await reopened.close();
	});

	test("refuses to discard a target that is the migration source", async () => {
		const root = await projectRoot();
		const project = await seedProject(root, "sqlite");
		await project.close();
		await stageJournal(root, {
			updatedAt: "2020-01-01T00:00:00.000Z",
			startedAt: "2020-01-01T00:00:00.000Z",
			source: { kind: "jsonl", path: ".macro/shared.jsonl" },
			target: { kind: "jsonl", path: ".macro/shared.jsonl" },
		});
		await writeFile(join(root, ".macro", "shared.jsonl"), "", "utf8");
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.openMigrationRecovery.action).toBe("targetRetained");
		expect(reopened.openMigrationRecovery.retainedReason).toBe(
			"targetIsSourceBackend",
		);
		expect(await fileExists(join(root, ".macro", "shared.jsonl"))).toBe(true);
		expect(await fileExists(lockPath(root))).toBe(false);
		await reopened.close();
	});

	test("clears an unreadable journal and leaves project data alone", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		await project.close();
		await writeFile(lockPath(root), "not-json", "utf8");
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.openMigrationRecovery.action).toBe("invalidJournalCleared");
		expect(await fileExists(lockPath(root))).toBe(false);
		expect(await reopened.openHistory(MACRO_DEFAULT_HISTORY_ID)).not.toBeNull();
		await reopened.close();
	});

	test("recovers a pre-versioned journal written by an older host", async () => {
		const root = await projectRoot();
		const project = await seedProject(root);
		await project.close();
		const target = join(root, ".macro", "legacy.sqlite");
		await writeFile(target, "partial", "utf8");
		await writeFile(
			lockPath(root),
			JSON.stringify({
				status: "verifying",
				startedAt: "2020-01-01T00:00:00.000Z",
				source: { kind: "jsonl", path: ".macro/state.jsonl" },
				target: { kind: "sqlite", path: ".macro/legacy.sqlite" },
				copiedHistory: 1,
				copiedScratchpads: 1,
			}),
			"utf8",
		);
		const reopened = await openMacroProject({ rootPath: root });
		expect(reopened.openMigrationRecovery.action).toBe("targetDiscarded");
		expect(reopened.openMigrationRecovery.journal?.journalVersion).toBe(0);
		expect(reopened.openMigrationRecovery.journal?.resumable).toBe(true);
		expect(await fileExists(target)).toBe(false);
		expect(await fileExists(lockPath(root))).toBe(false);
		await reopened.close();
	});
});

describe("migrated resource verification", () => {
	async function targetStores(): Promise<{
		history: KvHistoryResourceStore;
		scratchpads: KvScratchpadResourceStore;
	}> {
		const root = await projectRoot();
		const backend = new JsonlKvBackend({
			dataFilePath: join(root, "verify.jsonl"),
		});
		return {
			history: new KvHistoryResourceStore(backend),
			scratchpads: new KvScratchpadResourceStore(backend),
		};
	}

	test("accepts a faithful copy", async () => {
		const stores = await targetStores();
		const history = await stores.history.create("h1", { seeded: true });
		const scratchpad = await stores.scratchpads.create("s1", "S", "text");
		await expect(
			verifyMigratedResources(stores, [
				{
					resourceId: "h1",
					kind: "history",
					checksum: historyResourceChecksum(history),
				},
				{
					resourceId: "s1",
					kind: "scratchpad",
					checksum: scratchpadResourceChecksum(scratchpad),
				},
			]),
		).resolves.toBeUndefined();
	});

	test("rejects a history copy whose content drifted", async () => {
		const stores = await targetStores();
		const history = await stores.history.create("h1");
		const checksum = historyResourceChecksum(history);
		history.events.push({ type: "corrupted", payload: {} } as never);
		await stores.history.save(history);
		await expect(
			verifyMigratedResources(stores, [
				{ resourceId: "h1", kind: "history", checksum },
			]),
		).rejects.toThrow("failed checksum verification");
	});

	test("rejects a scratchpad copy whose content drifted", async () => {
		const stores = await targetStores();
		const scratchpad = await stores.scratchpads.create("s1", "S", "text");
		const checksum = scratchpadResourceChecksum(scratchpad);
		scratchpad.rawText = "tampered";
		await stores.scratchpads.save(scratchpad);
		await expect(
			verifyMigratedResources(stores, [
				{ resourceId: "s1", kind: "scratchpad", checksum },
			]),
		).rejects.toThrow("failed checksum verification");
	});

	test("rejects a missing reference", async () => {
		const stores = await targetStores();
		await expect(
			verifyMigratedResources(stores, [
				{ resourceId: "h1", kind: "history", checksum: "fnv1a:0" },
			]),
		).rejects.toThrow("is missing from the target backend");
	});

	test("rejects resources the migration did not copy", async () => {
		const stores = await targetStores();
		const history = await stores.history.create("h1");
		await stores.history.create("stowaway");
		await expect(
			verifyMigratedResources(stores, [
				{
					resourceId: "h1",
					kind: "history",
					checksum: historyResourceChecksum(history),
				},
			]),
		).rejects.toThrow("unexpected history resource 'stowaway'");
	});
});

describe("project migration target vacancy", () => {
	test("rejects a target whose JSONL write-ahead log already exists", async () => {
		const root = await projectRoot();
		const project = await seedProject(root, "sqlite");
		const wal = join(root, ".macro", "leftover.wal.jsonl");
		await writeFile(wal, '{"key":"stale","value":1}\n', "utf8");
		await expect(
			project.migrateBackend(
				{ kind: "jsonl", path: ".macro/leftover.jsonl" },
				project.descriptor.revision,
			),
		).rejects.toThrow("already exists");
		expect(project.manifest.backend.kind).toBe("sqlite");
		expect(await fileExists(wal)).toBe(true);
		await project.close();
	});

	test("removes both JSONL artifacts when a migration fails", async () => {
		const root = await projectRoot();
		const project = await seedProject(root, "sqlite");
		await expect(
			project.migrateBackend(
				{ kind: "jsonl", path: ".macro/failed.jsonl" },
				project.descriptor.revision,
				[
					{
						id: "failing",
						verify: () => {
							throw new Error("verification failed");
						},
					},
				],
			),
		).rejects.toThrow("verification failed");
		expect(await fileExists(join(root, ".macro", "failed.jsonl"))).toBe(false);
		expect(await fileExists(join(root, ".macro", "failed.wal.jsonl"))).toBe(
			false,
		);
		expect(project.manifest.backend.kind).toBe("sqlite");
		await project.close();
	});
});
