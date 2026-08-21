import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost } from "@stateful-mcp/macro-host";
import { HostSessionManager } from "../src/server/host-session-manager";

describe("filesystem directory creation", () => {
	let root: string;
	let host: Awaited<ReturnType<typeof createMacroHost>>;
	let sessions: HostSessionManager;

	beforeAll(async () => {
		root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-mkdir-"));
		host = await createMacroHost({ defaults: {}, projectRoot: root });
		sessions = new HostSessionManager(host, 60_000, root);
	});

	afterAll(async () => {
		await sessions.disposeAll();
		await host.dispose();
		await rm(root, { recursive: true, force: true });
	});

	const createDirectory = (
		parentPath: string,
		name: string,
	): Promise<{ path: string }> => sessions.createDirectory(parentPath, name);

	test("creates a child directory and reports the resolved path", async () => {
		const name = "created-folder";
		const result = await createDirectory(root, name);
		expect(result.path).toBe(join(root, name));
		const entries = await readdir(root);
		expect(entries).toContain(name);
	});

	test("rejects invalid names without creating anything", async () => {
		await expect(createDirectory(root, "")).rejects.toBeDefined();
		await expect(createDirectory(root, ".")).rejects.toBeDefined();
		await expect(createDirectory(root, "..")).rejects.toBeDefined();
		await expect(createDirectory(root, "a/b")).rejects.toBeDefined();
		await expect(createDirectory(root, "a\\b")).rejects.toBeDefined();
		const entries = await readdir(root);
		expect(entries).not.toContain("a");
	});

	test("fails when the target already exists", async () => {
		const name = "existing-folder";
		await mkdir(join(root, name));
		await expect(createDirectory(root, name)).rejects.toBeDefined();
	});
});
