import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { resolveProjectExtensionGroup } from "@stateful-mcp/macro";
import type {
	LoadedMacroWorkspace,
	MacroProject,
} from "@stateful-mcp/macro-host";
import { createMacroHost, createMacroProject } from "@stateful-mcp/macro-host";
import { HostSessionManager } from "../src/server/host-session-manager";
import {
	applyExtensionGroupChange,
	createProjectExtensionGroupServiceContext,
	extensionGroupState,
	ProjectExtensionGroupService,
	resolverExtensionsForConfiguration,
} from "../src/server/project/project-extension-groups";
import {
	buildBackendMigrationPlan,
	createProjectMigrationServiceContext,
	getMigrationJournalStatus,
	ProjectMigrationService,
	previewBackendMigration,
} from "../src/server/project/project-migrations";
import { toProjectConfigurationDto } from "../src/server/project/project-projections";

/**
 * Differential harness: the extracted services are driven through a context
 * backed by the very same HostSessionManager session, then compared against the
 * manager's own inline implementations.
 */
async function harness(displayName?: string) {
	const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-eqv-"));
	await createMacroProject({
		rootPath: root,
		...(displayName ? { displayName } : {}),
	});
	const host = await createMacroHost({ defaults: {}, projectRoot: root });
	const sessions = new HostSessionManager(host, 60_000, root);
	const snapshot = await sessions.create();
	const sessionId = snapshot.sessionId;

	// The manager keeps `Session` private but exposes `get`/`getOrError`.
	const loaded = (): LoadedMacroWorkspace =>
		sessions.getOrError(sessionId).loaded;
	const requireProject = (): MacroProject => {
		const project = loaded().project;
		if (!project) throw new Error("PROJECT_REQUIRED");
		return project;
	};
	const getConfiguration = () =>
		toProjectConfigurationDto(requireProject(), loaded());

	let emitted = 0;
	const migrations = new ProjectMigrationService(
		createProjectMigrationServiceContext({
			loaded,
			requireProject,
			getConfiguration,
			reloadProject: (rootPath) => sessions.openProject(sessionId, rootPath),
		}),
	);
	const groups = new ProjectExtensionGroupService(
		createProjectExtensionGroupServiceContext({
			loaded: () => sessions.get(sessionId)?.loaded,
			requireProject,
			getConfiguration,
			reloadProject: (rootPath) => sessions.openProject(sessionId, rootPath),
			emitWorkspaceChanged: () => {
				emitted += 1;
			},
		}),
	);
	const dispose = async () => {
		await sessions.disposeAll();
		await host.dispose();
	};
	return {
		root,
		sessions,
		sessionId,
		migrations,
		groups,
		requireProject,
		getConfiguration,
		loaded,
		emittedCount: () => emitted,
		dispose,
	};
}

describe("project-migrations equivalence with HostSessionManager", () => {
	test("plan and preview match the manager's projection", async () => {
		const h = await harness();
		const target = { kind: "sqlite" as const, path: ".macro/state.sqlite" };

		const managerPreview = await h.sessions.previewBackendMigration(
			h.sessionId,
			target,
		);
		const servicePreview = await h.migrations.preview(target);
		expect(servicePreview).toEqual(managerPreview);

		// The plan itself, including the source digest, must be identical.
		const plan = await h.migrations.plan(target);
		expect(managerPreview.status).toBe("plan");
		if (managerPreview.status === "plan")
			expect(plan).toEqual(managerPreview.plan);

		// Standalone function form must agree with the service facade.
		const context = createProjectMigrationServiceContext({
			loaded: h.loaded,
			requireProject: h.requireProject,
			getConfiguration: h.getConfiguration,
			reloadProject: (rootPath) =>
				h.sessions.openProject(h.sessionId, rootPath),
		});
		expect(await buildBackendMigrationPlan(context, target)).toEqual(plan);
		expect(await previewBackendMigration(context, target)).toEqual(
			servicePreview,
		);
		await h.dispose();
	});

	test("uses explicit message keys for participants, never extension prose", async () => {
		const h = await harness();
		const target = { kind: "sqlite" as const, path: ".macro/state.sqlite" };
		const context = createProjectMigrationServiceContext({
			loaded: h.loaded,
			requireProject: h.requireProject,
			getConfiguration: h.getConfiguration,
			reloadProject: (rootPath) =>
				h.sessions.openProject(h.sessionId, rootPath),
			listParticipants: () => [
				{
					extensionId: "ext-a",
					participant: {
						id: "p1",
						plan: async () => ({
							participantId: "p1",
							extensionId: "ext-a",
							status: "missing",
							// Extension-authored prose; must never become a key.
							message: "boom from extension",
						}),
					},
				},
				{
					extensionId: "ext-b",
					participant: {
						id: "p2",
						plan: async () => ({
							participantId: "p2",
							extensionId: "ext-b",
							status: "incompatible",
							message: "also prose",
						}),
					},
				},
				{
					extensionId: "ext-c",
					participant: {
						id: "p3",
						plan: async () => ({
							participantId: "p3",
							extensionId: "ext-c",
							status: "ready",
						}),
					},
				},
			],
		});

		const plan = await buildBackendMigrationPlan(context, target);

		expect(plan.participants).toHaveLength(3);
		const missing = plan.participants[0]!;
		const incompatible = plan.participants[1]!;
		const ready = plan.participants[2]!;
		expect(missing.status).toBe("missing");
		expect(missing.messageKey).toBe("project.migration.participant.missing");
		expect(missing.messageParams).toEqual({
			participantId: "p1",
			extensionId: "ext-a",
		});
		expect(incompatible.status).toBe("incompatible");
		expect(incompatible.messageKey).toBe(
			"project.migration.participant.incompatible",
		);
		expect(ready.status).toBe("ready");
		expect(ready.messageKey).toBeUndefined();
		// Extension prose never leaks into a translation key.
		for (const participant of plan.participants)
			expect(participant.messageKey).not.toBe("boom from extension");
		await h.dispose();
	});

	test("journal status matches the manager on a clean project", async () => {
		const h = await harness();
		expect(await h.migrations.journalStatus()).toEqual(
			await h.sessions.getMigrationJournal(h.sessionId),
		);
		expect(await h.migrations.journalStatus()).toEqual({
			journal: null,
			stale: false,
			resumable: false,
		});
		// Standalone function form agrees with the facade.
		const context = createProjectMigrationServiceContext({
			loaded: h.loaded,
			requireProject: h.requireProject,
			getConfiguration: h.getConfiguration,
			reloadProject: (rootPath) =>
				h.sessions.openProject(h.sessionId, rootPath),
		});
		expect(await getMigrationJournalStatus(context)).toEqual(
			await h.sessions.getMigrationJournal(h.sessionId),
		);
		await h.dispose();
	});

	test("recover and discard match the manager", async () => {
		const h = await harness();
		expect(await h.migrations.recover()).toEqual(
			await h.sessions.recoverBackendMigration(h.sessionId),
		);
		expect(await h.migrations.discard()).toEqual(
			await h.sessions.discardBackendMigration(h.sessionId),
		);
		await h.dispose();
	});

	test("resume rejects with the manager's message when no journal exists", async () => {
		const h = await harness();
		const managerResult = await h.sessions.resumeBackendMigration(h.sessionId);
		const serviceResult = await h.migrations.resume();
		expect(serviceResult).toEqual(managerResult);
		expect(serviceResult.status).toBe("rejected");
		if (serviceResult.status === "rejected")
			expect(serviceResult.messageKey).toBe(
				"project.migration.resume.noJournal",
			);
		await h.dispose();
	});

	test("apply rejects an identical backend and a stale revision like the manager", async () => {
		const h = await harness();
		const current = h.getConfiguration();
		const revision = current.revision;

		const sameBackend = await h.migrations.apply(current.backend, revision);
		expect(sameBackend).toEqual(
			await h.sessions.applyBackendMigration(
				h.sessionId,
				current.backend,
				revision,
			),
		);
		expect(sameBackend.status).toBe("rejected");
		if (sameBackend.status === "rejected")
			expect(sameBackend.messageKey).toBe(
				"project.migration.apply.identicalBackend",
			);

		const target = { kind: "sqlite" as const, path: ".macro/state.sqlite" };
		const stale = await h.migrations.apply(target, "not-the-revision");
		expect(stale).toEqual(
			await h.sessions.applyBackendMigration(
				h.sessionId,
				target,
				"not-the-revision",
			),
		);
		expect(stale.status).toBe("conflict");
		await h.dispose();
	});

	test("apply actually migrates the backend and reloads", async () => {
		const h = await harness();
		const target = { kind: "sqlite" as const, path: ".macro/state.sqlite" };
		const result = await h.migrations.apply(
			target,
			h.getConfiguration().revision,
		);
		expect(result.status).toBe("migrated");
		if (result.status === "migrated") {
			expect(result.configuration.backend.kind).toBe("sqlite");
			expect(result.snapshot.sessionId).toBe(h.sessionId);
		}
		// Post-reload configuration is re-read, matching the manager.
		expect(h.getConfiguration().backend.kind).toBe("sqlite");
		await h.dispose();
	});
});

describe("project-extension-groups equivalence with HostSessionManager", () => {
	test("preview matches the manager, including the empty request", async () => {
		const h = await harness();
		expect(h.groups.preview()).toEqual(
			h.sessions.previewExtensionGroup(h.sessionId),
		);
		expect(h.groups.preview({ extensionIds: [] })).toEqual(
			h.sessions.previewExtensionGroup(h.sessionId, { extensionIds: [] }),
		);
		expect(h.groups.preview({ groupId: "missing", setActive: true })).toEqual(
			h.sessions.previewExtensionGroup(h.sessionId, {
				groupId: "missing",
				setActive: true,
			}),
		);
		await h.dispose();
	});

	test("create/update/duplicate/setActive/delete match the manager step for step", async () => {
		// Two independent projects differ only in per-project identity, so those
		// fields (and the manifest hash derived from them) are normalized away.
		const service = await harness("Equivalence Fixture");
		const manager = await harness("Equivalence Fixture");
		const normalize = (value: unknown): unknown =>
			JSON.parse(
				JSON.stringify(value, (key, inner) =>
					key === "projectId" || key === "revision" || key === "sessionId"
						? `<${key}>`
						: inner,
				),
			);

		const run = async <T>(
			viaService: () => Promise<T>,
			viaManager: () => Promise<T>,
		) => {
			const a = await viaService();
			const b = await viaManager();
			expect(normalize(a)).toEqual(normalize(b));
			return a;
		};

		await run(
			() =>
				service.groups.create({
					group: { displayName: "Alpha", extensionIds: [] },
					expectedRevision: service.getConfiguration().revision,
				}),
			() =>
				manager.sessions.createExtensionGroup(manager.sessionId, {
					group: { displayName: "Alpha", extensionIds: [] },
					expectedRevision: manager.getConfiguration().revision,
				}),
		);

		await run(
			() =>
				service.groups.update({
					patch: { groupId: "alpha", displayName: "Alpha Renamed" },
					expectedRevision: service.getConfiguration().revision,
				}),
			() =>
				manager.sessions.updateExtensionGroup(manager.sessionId, {
					patch: { groupId: "alpha", displayName: "Alpha Renamed" },
					expectedRevision: manager.getConfiguration().revision,
				}),
		);

		await run(
			() =>
				service.groups.duplicate({
					sourceGroupId: "alpha",
					expectedRevision: service.getConfiguration().revision,
				}),
			() =>
				manager.sessions.duplicateExtensionGroup(manager.sessionId, {
					sourceGroupId: "alpha",
					expectedRevision: manager.getConfiguration().revision,
				}),
		);

		await run(
			() =>
				service.groups.setActive({
					groupId: "alpha",
					expectedRevision: service.getConfiguration().revision,
				}),
			() =>
				manager.sessions.setActiveExtensionGroup(manager.sessionId, {
					groupId: "alpha",
					expectedRevision: manager.getConfiguration().revision,
				}),
		);

		// Deleting the active group without a decision must be rejected.
		await run(
			() =>
				service.groups.delete({
					groupId: "alpha",
					expectedRevision: service.getConfiguration().revision,
				}),
			() =>
				manager.sessions.deleteExtensionGroup(manager.sessionId, {
					groupId: "alpha",
					expectedRevision: manager.getConfiguration().revision,
				}),
		);

		// ... and accepted when the caller clears it explicitly.
		const deleted = await run(
			() =>
				service.groups.delete({
					groupId: "alpha",
					clearActive: true,
					expectedRevision: service.getConfiguration().revision,
				}),
			() =>
				manager.sessions.deleteExtensionGroup(manager.sessionId, {
					groupId: "alpha",
					clearActive: true,
					expectedRevision: manager.getConfiguration().revision,
				}),
		);
		expect(deleted.status).toBe("accepted");

		await service.dispose();
		await manager.dispose();
	});

	test("malformed patch is rejected before the stale-revision conflict", async () => {
		const h = await harness();
		const result = await h.groups.update({
			patch: { groupId: "does-not-exist", displayName: "x" },
			expectedRevision: "definitely-stale",
		});
		expect(result).toEqual(
			await h.sessions.updateExtensionGroup(h.sessionId, {
				patch: { groupId: "does-not-exist", displayName: "x" },
				expectedRevision: "definitely-stale",
			}),
		);
		expect(result.status).toBe("rejected");
		await h.dispose();
	});

	test("conflict is reported for a valid change with a stale revision", async () => {
		const h = await harness();
		const result = await h.groups.create({
			group: { displayName: "Beta", extensionIds: [] },
			expectedRevision: "definitely-stale",
		});
		expect(result).toEqual(
			await h.sessions.createExtensionGroup(h.sessionId, {
				group: { displayName: "Beta", extensionIds: [] },
				expectedRevision: "definitely-stale",
			}),
		);
		expect(result.status).toBe("conflict");
		await h.dispose();
	});

	test("accepted changes emit workspace.changed exactly once", async () => {
		const h = await harness();
		expect(h.emittedCount()).toBe(0);
		await h.groups.create({
			group: { displayName: "Gamma", extensionIds: [] },
			expectedRevision: h.getConfiguration().revision,
		});
		expect(h.emittedCount()).toBe(1);
		// Rejections must not emit.
		await h.groups.create({
			group: { displayName: "", extensionIds: [] },
			expectedRevision: h.getConfiguration().revision,
		});
		expect(h.emittedCount()).toBe(1);
		await h.dispose();
	});

	test("pure helpers agree with the manager's private derivations", async () => {
		const h = await harness();
		await h.groups.create({
			group: { displayName: "Delta", extensionIds: [], setActive: true },
			expectedRevision: h.getConfiguration().revision,
		});
		const project = h.requireProject();
		expect(extensionGroupState(project)).toEqual({
			groups: project.manifest.extensionGroups ?? {},
			activeGroupId: "delta",
		});
		const configuration = h.getConfiguration();
		expect(resolverExtensionsForConfiguration(configuration)).toEqual(
			configuration.extensions.map((extension) => ({
				id: extension.id,
				...(extension.requires === undefined
					? {}
					: { requires: [...extension.requires] }),
				availability: "available" as const,
			})),
		);
		await h.dispose();
	});

	test("a failed activation rolls the manifest back and reports the rollback", async () => {
		const h = await harness();
		// Force `impact.requiresReload` by claiming the running workspace has an
		// extension activated that the proposed state does not.
		const running = resolveProjectExtensionGroup({
			extensions: [{ id: "ghost" }],
		});
		expect(running.activationOrder).toEqual(["ghost"]);

		let reloads = 0;
		let failNextReload = true;
		const context = createProjectExtensionGroupServiceContext({
			loaded: () => h.sessions.get(h.sessionId)?.loaded,
			requireProject: h.requireProject,
			getConfiguration: h.getConfiguration,
			reloadProject: async (rootPath) => {
				reloads += 1;
				if (failNextReload) {
					failNextReload = false;
					throw new Error("boom");
				}
				return h.sessions.openProject(h.sessionId, rootPath);
			},
			emitWorkspaceChanged: () => undefined,
		});
		// Override only the loader resolution, keeping everything else real.
		const rollbackContext = { ...context, loadedResolution: () => running };

		const before = h.requireProject().manifest;
		const result = await applyExtensionGroupChange(rollbackContext, {
			change: {
				kind: "create",
				group: { displayName: "Zeta", extensionIds: [], setActive: true },
			},
			expectedRevision: h.getConfiguration().revision,
			apply: true,
		});

		expect(result.status).toBe("rejected");
		if (result.status === "rejected") {
			expect(result.messageKey).toBe(
				"project.extensionGroup.activation.rolledBack",
			);
			// The raw reload error is never forwarded; only the host-authored
			// key is reported, with no exception text in the params.
			expect(result.messageParams).toBeUndefined();
			// A project is still open, so the configuration is reported.
			expect(result.configuration).toBeDefined();
		}
		// Two reloads: the failed activation, then the rollback restore.
		expect(reloads).toBe(2);
		// The manifest was restored: the new group is gone again.
		const after = h.requireProject().manifest;
		expect(after.extensionGroups ?? {}).toEqual(before.extensionGroups ?? {});
		expect(after.activeExtensionGroupId).toBe(before.activeExtensionGroupId);
		await h.dispose();
	});

	test("persists without reloading when apply is not requested", async () => {
		const h = await harness();
		let reloads = 0;
		const context = createProjectExtensionGroupServiceContext({
			loaded: () => h.sessions.get(h.sessionId)?.loaded,
			requireProject: h.requireProject,
			getConfiguration: h.getConfiguration,
			reloadProject: async (rootPath) => {
				reloads += 1;
				return h.sessions.openProject(h.sessionId, rootPath);
			},
			emitWorkspaceChanged: () => undefined,
		});
		const result = await applyExtensionGroupChange(
			{
				...context,
				loadedResolution: () =>
					resolveProjectExtensionGroup({ extensions: [{ id: "ghost" }] }),
			},
			{
				change: {
					kind: "create",
					group: { displayName: "Eta", extensionIds: [], setActive: true },
				},
				expectedRevision: h.getConfiguration().revision,
				// apply omitted: persist only.
			},
		);
		expect(result.status).toBe("accepted");
		if (result.status === "accepted") {
			expect(result.impact.requiresReload).toBe(true);
			expect(result.applied).toBe(false);
			expect(result.snapshot).toBeUndefined();
			expect(result.group?.displayName).toBe("Eta");
		}
		expect(reloads).toBe(0);
		// Persistence still happened.
		expect(h.requireProject().manifest.activeExtensionGroupId).toBe("eta");
		await h.dispose();
	});
});
