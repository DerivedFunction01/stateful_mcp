import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost, createMacroProject } from "@stateful-mcp/macro-host";
import { HostSessionManager } from "../src/server/host-session-manager";

describe("host project session projection", () => {
	test("projects safe project identity without backend paths", async () => {
		const root = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-web-"),
		);
		const project = await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		const snapshot = await sessions.create();
		expect(snapshot.project?.projectId).toBe(project.manifest.projectId);
		expect(snapshot.project?.ephemeral).toBe(false);
		expect(snapshot.project).not.toHaveProperty("rootPath");
		expect(snapshot.project).not.toHaveProperty("backend");
		await sessions.disposeAll();
		await host.dispose();
	});

	test("projects ephemeral session identity when no projectRoot is configured", async () => {
		const host = await createMacroHost({ defaults: {} });
		const sessions = new HostSessionManager(host, 60_000);
		const snapshot = await sessions.create();
		expect(snapshot.project?.ephemeral).toBe(true);
		expect(snapshot.project?.displayName).toBe("In-Memory Session");
		expect(snapshot.project?.projectId).toBe("in-memory");
		await sessions.disposeAll();
		await host.dispose();
	});

	test("opens, inits, and saves as project lifecycle smoothly", async () => {
		const host = await createMacroHost({ defaults: {} });
		const sessions = new HostSessionManager(host, 60_000);
		const initialSnapshot = await sessions.create();
		const sessionId = initialSnapshot.sessionId;
		expect(initialSnapshot.project?.ephemeral).toBe(true);

		// 1. Init project
		const dir1 = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-web-init-"),
		);
		const initSnapshot = await sessions.initProject(
			sessionId,
			dir1,
			"Test Init Project",
		);
		expect(initSnapshot.project?.ephemeral).toBe(false);
		expect(initSnapshot.project?.displayName).toBe("Test Init Project");

		// 2. Close project
		const closedSnapshot = await sessions.closeProject(sessionId);
		expect(closedSnapshot.project?.ephemeral).toBe(true);

		// 3. Save as project
		const dir2 = await mkdtemp(
			join(process.env.TMPDIR ?? "/tmp", "macro-web-saveas-"),
		);
		const saveAsSnapshot = await sessions.saveAsProject(
			sessionId,
			dir2,
			"Test Saved Project",
		);
		expect(saveAsSnapshot.project?.ephemeral).toBe(false);
		expect(saveAsSnapshot.project?.displayName).toBe("Test Saved Project");

		await sessions.disposeAll();
		await host.dispose();
	});
});
