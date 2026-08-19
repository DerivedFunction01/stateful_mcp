import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost, createMacroProject } from "@stateful-mcp/macro-host";
import { HostSessionManager } from "../src/server/host-session-manager";

describe("host project session projection", () => {
	test("projects safe project identity without backend paths", async () => {
		const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-web-"));
		const project = await createMacroProject({ rootPath: root });
		const host = await createMacroHost({ defaults: {}, projectRoot: root });
		const sessions = new HostSessionManager(host, 60_000, root);
		const snapshot = await sessions.create();
		expect(snapshot.project?.projectId).toBe(project.manifest.projectId);
		expect(snapshot.project).not.toHaveProperty("rootPath");
		expect(snapshot.project).not.toHaveProperty("backend");
		await sessions.disposeAll();
		await host.dispose();
	});
});
