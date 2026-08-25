import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { createMacroHost, createMacroProject } from "@stateful-mcp/macro-host";
import type { SettingsUiOperation } from "@stateful-mcp/macro-protocol";
import { HostSessionManager } from "../src/server/host-session-manager";
import { SessionError } from "../src/server/session-error";

describe("session error message keys", () => {
	let root: string;
	let host: Awaited<ReturnType<typeof createMacroHost>>;
	let sessions: HostSessionManager;
	let sessionId: string;

	beforeAll(async () => {
		root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "macro-err-"));
		await createMacroProject({ rootPath: root });
		host = await createMacroHost({ defaults: {}, projectRoot: root });
		sessions = new HostSessionManager(host, 60_000, root);
		const snapshot = await sessions.create();
		sessionId = snapshot.sessionId;
	});

	afterAll(async () => {
		await sessions.disposeAll();
		await host.dispose();
	});

	test("maps ProjectPathError from path resolution to a semantic key", async () => {
		// "../" forces resolveProjectRelativePath to reject with a ProjectPathError.
		let caught: unknown;
		try {
			await sessions.createFile(sessionId, "../outside", "file.txt");
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(SessionError);
		const error = caught as SessionError;
		expect(error.messageKey).toBe("project.path.outsideEditableArea");
	});

	test("maps ProjectPathError from segment validation to a semantic key", async () => {
		let caught: unknown;
		try {
			await sessions.createFile(sessionId, ".", "bad/name");
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(SessionError);
		const error = caught as SessionError;
		expect(error.messageKey).toBe("project.path.segmentInvalid");
		expect(error.messageKey).not.toMatch(/name must be a single path segment/i);
	});

	test("propagates a settings error with its canonical semantic key", async () => {
		let caught: unknown;
		try {
			await sessions.settingsUi(sessionId, {
				operation: "settings.ui.unknown",
			} as unknown as SettingsUiOperation);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(SessionError);
		const error = caught as SessionError;
		expect(error.code).toBe("SETTINGS_OPERATION_UNKNOWN");
		expect(error.messageKey).toBe("settings.operation.unknown");
	});

	test("does not expose raw exception text at the settings boundary", async () => {
		let caught: unknown;
		try {
			await sessions.settingsUi(sessionId, {
				operation: "settings.ui.unknown",
			} as unknown as SettingsUiOperation);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(SessionError);
		const error = caught as SessionError;
		expect(error.message).toBe("settings.operation.unknown");
		expect(error.message).not.toMatch(
			/settings are unavailable|unknown operation/i,
		);
	});
});
