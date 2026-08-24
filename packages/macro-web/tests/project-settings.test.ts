import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost } from "@stateful-mcp/macro-host";
import type { ProjectConfigurationDto } from "@stateful-mcp/macro-protocol";
import { HostSessionManager } from "../src/server/host-session-manager";

async function createProjectSession() {
	const root = await mkdtemp(
		join(process.env.TMPDIR ?? "/tmp", "macro-project-settings-"),
	);
	const host = await createMacroHost({ defaults: {} });
	const sessions = new HostSessionManager(host, 60_000);
	const snapshot = await sessions.create();
	await sessions.initProject(snapshot.sessionId, root, "Settings Project");
	return { host, sessions, root, sessionId: snapshot.sessionId };
}

describe("project configuration", () => {
	test("reads and persists editable manifest fields", async () => {
		const context = await createProjectSession();
		const current = context.sessions.getProjectConfiguration(context.sessionId);
		const updated = {
			...current,
			displayName: "Updated Project",
			uiLocale: "es",
		};
		const result = await context.sessions.updateProjectConfiguration(
			context.sessionId,
			{
				configuration: updated,
				expectedRevision: current.revision,
			},
		);
		expect(result.status).toBe("accepted");
		expect(
			context.sessions.getProjectConfiguration(context.sessionId).displayName,
		).toBe("Updated Project");
		const manifest = JSON.parse(
			await readFile(join(context.root, ".macro", "project.json"), "utf8"),
		) as { displayName: string };
		expect(manifest.displayName).toBe("Updated Project");
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("rejects stale revisions without overwriting", async () => {
		const context = await createProjectSession();
		const current = context.sessions.getProjectConfiguration(context.sessionId);
		const result = await context.sessions.updateProjectConfiguration(
			context.sessionId,
			{
				configuration: { ...current, displayName: "Stale" },
				expectedRevision: "stale-revision",
			},
		);
		expect(result.status).toBe("conflict");
		expect(
			context.sessions.getProjectConfiguration(context.sessionId).displayName,
		).toBe("Settings Project");
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("rejects an unknown active extension profile", async () => {
		const context = await createProjectSession();
		const current = context.sessions.getProjectConfiguration(context.sessionId);
		const result = await context.sessions.updateProjectConfiguration(
			context.sessionId,
			{
				configuration: { ...current, activeExtensionProfileId: "ghost" },
				expectedRevision: current.revision,
			},
		);
		expect(result.status).toBe("rejected");
		expect(
			context.sessions.getProjectConfiguration(context.sessionId)
				.activeExtensionProfileId,
		).toBeUndefined();
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("rejects a locale that is not available", async () => {
		const context = await createProjectSession();
		const current = context.sessions.getProjectConfiguration(context.sessionId);
		const result = await context.sessions.updateProjectConfiguration(
			context.sessionId,
			{
				configuration: { ...current, uiLocale: "fr" },
				expectedRevision: current.revision,
			},
		);
		expect(result.status).toBe("rejected");
		expect(
			context.sessions.getProjectConfiguration(context.sessionId).uiLocale,
		).toBeUndefined();
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("requires migration before changing backend", async () => {
		const context = await createProjectSession();
		const current = context.sessions.getProjectConfiguration(context.sessionId);
		const target: ProjectConfigurationDto = {
			...current,
			backend: { kind: "sqlite", path: ".macro/state.sqlite" },
		};
		const result = await context.sessions.updateProjectConfiguration(
			context.sessionId,
			{
				configuration: target,
				expectedRevision: current.revision,
			},
		);
		expect(result.status).toBe("migrationRequired");
		expect(
			context.sessions.getProjectConfiguration(context.sessionId).backend.kind,
		).toBe(current.backend.kind);
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("migrates history and scratchpads between project backends", async () => {
		const context = await createProjectSession();
		const session = context.sessions.get(context.sessionId)!;
		const project = session.loaded.project!;
		const history = await project.openHistory("default-history");
		if (!history) throw new Error("Expected default history resource");
		history.events.push({ type: "test", payload: { value: 1 } } as never);
		await project.saveHistory(history);
		await project.createScratchpad(
			"migration-note",
			"Migration Note",
			"line one\nline two",
		);
		const current = context.sessions.getProjectConfiguration(context.sessionId);
		const target = { kind: "sqlite" as const, path: ".macro/migration.sqlite" };
		const result = await context.sessions.applyBackendMigration(
			context.sessionId,
			target,
			current.revision,
		);
		expect(result.status).toBe("migrated");
		const migrated = context.sessions.get(context.sessionId)!.loaded.project!;
		expect(migrated.manifest.backend.kind).toBe("sqlite");
		expect(
			(await migrated.openHistory("default-history"))?.events,
		).toHaveLength(1);
		expect((await migrated.openScratchpad("migration-note"))?.rawText).toBe(
			"line one\nline two",
		);
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("runs migration participants and rolls them back on verification failure", async () => {
		const context = await createProjectSession();
		const project = context.sessions.get(context.sessionId)!.loaded.project!;
		const calls: string[] = [];
		const participant = {
			id: "test-participant",
			plan: () => ({
				participantId: "test-participant",
				extensionId: "test",
				status: "ready" as const,
			}),
			migrate: () => {
				calls.push("migrate");
			},
			verify: () => {
				calls.push("verify");
				throw new Error("verification failed");
			},
			rollback: () => {
				calls.push("rollback");
			},
		};
		await expect(
			project.migrateBackend(
				{ kind: "sqlite", path: ".macro/failure.sqlite" },
				project.descriptor.revision,
				[participant],
			),
		).rejects.toThrow("verification failed");
		expect(calls).toEqual(["migrate", "verify", "rollback"]);
		expect(project.manifest.backend.kind).toBe("jsonl");
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("orders migration participants by declared dependencies", async () => {
		const context = await createProjectSession();
		const project = context.sessions.get(context.sessionId)!.loaded.project!;
		const calls: string[] = [];
		const makeParticipant = (id: string, dependsOn?: string[]) => ({
			id,
			dependsOn,
			migrate: () => {
				calls.push(id);
			},
		});
		await project.migrateBackend(
			{ kind: "sqlite", path: ".macro/order.sqlite" },
			project.descriptor.revision,
			[makeParticipant("dependent", ["base"]), makeParticipant("base")],
		);
		expect(calls).toEqual(["base", "dependent"]);
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("provides source and target stores to migration participants", async () => {
		const context = await createProjectSession();
		const project = context.sessions.get(context.sessionId)!.loaded.project!;
		let targetScratchpadId = "";
		const participant = {
			id: "store-participant",
			migrate: async (
				migrationContext: import("@stateful-mcp/macro").ProjectMigrationContext,
			) => {
				const source =
					await migrationContext.sourceScratchpads.open("migration-note");
				if (source) {
					const targetScratchpads = migrationContext.targetScratchpads;
					if (!targetScratchpads)
						throw new Error(
							"Expected a target scratchpad store during migration",
						);
					await targetScratchpads.save(source);
					targetScratchpadId = source.scratchpadId;
				}
			},
		};
		await project.createScratchpad(
			"migration-note",
			"Migration Note",
			"participant data",
		);
		await project.migrateBackend(
			{ kind: "sqlite", path: ".macro/stores.sqlite" },
			project.descriptor.revision,
			[participant],
		);
		expect(targetScratchpadId).toBe("migration-note");
		await context.sessions.disposeAll();
		await context.host.dispose();
	});

	test("rejects a pre-existing migration target and preserves the source", async () => {
		const context = await createProjectSession();
		const project = context.sessions.get(context.sessionId)!.loaded.project!;
		await Bun.write(
			join(context.root, ".macro", "existing.sqlite"),
			"occupied",
		);
		await expect(
			project.migrateBackend(
				{ kind: "sqlite", path: ".macro/existing.sqlite" },
				project.descriptor.revision,
			),
		).rejects.toThrow("already exists");
		expect(project.manifest.backend.kind).toBe("jsonl");
		await context.sessions.disposeAll();
		await context.host.dispose();
	});
});
