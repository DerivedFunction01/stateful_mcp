import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createMacroHost } from "@stateful-mcp/macro-host";
import {
	type EditorOperation,
	failure,
	type HostRequest,
	hostError,
	isProtocolVersion,
	MACRO_PROTOCOL_VERSION,
	response,
	type SettingsBundleOperation,
	type SettingsOperation,
	type SettingsUiOperation,
} from "@stateful-mcp/macro-protocol";
import {
	HostSessionManager,
	SessionError,
} from "./server/host-session-manager";
import { parseKeymapProfile } from "./server/keymap-guards";
import { isValidMacroProjectDirectory } from "./server/project-detection";
import {
	parseCreateExtensionGroup,
	parseDeleteExtensionGroup,
	parseDuplicateExtensionGroup,
	parsePreviewExtensionGroup,
	parseSetActiveExtensionGroup,
	parseUpdateExtensionGroup,
} from "./server/project-extension-group-guards";
import {
	parseApplyBackendMigration,
	parseDiscardBackendMigration,
	parseGetMigrationJournal,
	parsePreviewBackendMigration,
	parseProjectAction,
	parseProjectDeletePayload,
	parseProjectPathPayload,
	parseProjectRenamePayload,
	parseProjectUpdateConfiguration,
	parseResumeBackendMigration,
} from "./server/project-operation-guards";

interface SocketData {
	readonly sessionId?: string;
	readonly isDevReload?: boolean;
}
interface JsonRequest extends HostRequest<string, unknown> {
	readonly requestId: string;
}

const packageRoot = resolve(import.meta.dir, "..");
const buildRoot = resolve(packageRoot, "dist/dev");
const assetsRoot = resolve(buildRoot, "assets");
const port = Number(argument("port") ?? Bun.env.PORT ?? 3000);
const hostname = argument("host") ?? Bun.env.HOST ?? "127.0.0.1";
const projectRoot = argument("project") ?? Bun.env.MACRO_PROJECT_ROOT;

async function buildClientBundle(): Promise<boolean> {
	const build = await Bun.build({
		entrypoints: [resolve(packageRoot, "src/main.tsx")],
		outdir: assetsRoot,
		target: "browser",
		sourcemap: "inline",
		naming: {
			entry: "macro-web.[ext]",
			chunk: "[name]-[hash].[ext]",
			asset: "[name].[ext]",
		},
	});
	if (!build.success) {
		for (const log of build.logs) console.error(log);
		return false;
	}
	return true;
}

const initialBuildSuccess = await buildClientBundle();
if (!initialBuildSuccess) {
	throw new Error("Macro Web browser initial build failed");
}

const devReloadSockets = new Set<unknown>();
let rebuildDebounce: ReturnType<typeof setTimeout> | null = null;

function triggerDevRebuild() {
	if (rebuildDebounce) clearTimeout(rebuildDebounce);
	rebuildDebounce = setTimeout(async () => {
		const ok = await buildClientBundle();
		if (ok) {
			for (const socket of devReloadSockets) {
				try {
					(socket as { send: (data: string) => void }).send("reload");
				} catch {
					// Client socket will clean up on close
				}
			}
		}
	}, 100);
}

// Watch workspace sources for automatic client rebuild and hot reload
try {
	watch(resolve(packageRoot, "src"), { recursive: true }, () =>
		triggerDevRebuild(),
	);
	watch(resolve(packageRoot, "../macro/src"), { recursive: true }, () =>
		triggerDevRebuild(),
	);
} catch (err) {
	console.warn("Dev file watcher warning:", err);
}

const host = await createMacroHost({
	defaults: {},
	...(projectRoot ? { projectRoot } : {}),
});
const sessions = new HostSessionManager(host, 30 * 60 * 1000, projectRoot);
const sockets = new Map<WebSocket, () => void>();

const indexHtml = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#0b1020" /><title>Macro Web</title><link rel="stylesheet" href="/assets/macro-web.css" /></head>
<body><div id="root"></div><script type="module" src="/assets/macro-web.js"></script><script>
(() => {
	const protocol = location.protocol === "https:" ? "wss:" : "ws:";
	function connect() {
		const ws = new WebSocket(\`\${protocol}//\${location.host}/api/dev-reload\`);
		ws.onmessage = (e) => {
			if (e.data === "reload") location.reload();
		};
		ws.onclose = () => setTimeout(connect, 1000);
	}
	connect();
})();
</script></body></html>`;

function isWithinRoot(path: string, root: string): boolean {
	const rootRelative = relative(root, resolve(path));
	return (
		rootRelative === "" ||
		(!rootRelative.startsWith(`..${sep}`) && rootRelative !== "..")
	);
}

async function serveAsset(pathname: string): Promise<Response | undefined> {
	const assetPath = resolve(assetsRoot, pathname.slice("/assets/".length));
	if (!isWithinRoot(assetPath, assetsRoot))
		return new Response("Forbidden", { status: 403 });
	const file = Bun.file(assetPath);
	if (!(await file.exists())) {
		await buildClientBundle();
	}
	return (await file.exists()) ? new Response(file) : undefined;
}

async function jsonBody(request: Request): Promise<JsonRequest> {
	const value = (await request.json()) as Partial<JsonRequest>;
	if (
		!isProtocolVersion(value.version) ||
		typeof value.requestId !== "string" ||
		typeof value.type !== "string"
	) {
		throw new SessionError(
			"INVALID_REQUEST",
			"request.envelope.invalid",
			false,
		);
	}
	return value as JsonRequest;
}

function requestId(request: Request): string {
	return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function errorResponse(id: string, error: unknown): Response {
		const hostErrorValue =
			error instanceof SessionError
				? error.toHostError()
				: hostError("HOST_REQUEST_FAILED", { messageKey: "host.requestFailed" });
	const status =
		hostErrorValue.code === "SESSION_NOT_FOUND" ||
		hostErrorValue.code === "COMMAND_NOT_FOUND" ||
		hostErrorValue.code.endsWith("_NOT_FOUND")
			? 404
			: hostErrorValue.code === "PROJECT_NOT_CONFIGURED"
				? 503
				: hostErrorValue.code === "STALE_REVISION"
					? 409
					: hostErrorValue.code === "INVALID_REQUEST"
						? 400
						: 500;
	return Response.json(failure(id, hostErrorValue), { status });
}

async function handleJson(
	request: Request,
	sessionId: string | undefined,
	handler: (envelope: JsonRequest) => Promise<unknown>,
): Promise<Response> {
	const id = requestId(request);
	try {
		const envelope = await jsonBody(request);
		if (sessionId && envelope.sessionId !== sessionId)
			throw new SessionError(
				"SESSION_MISMATCH",
				"session.mismatch",
				false,
			);
		const payload = await handler(envelope);
		return Response.json(response(envelope.requestId || id, payload));
	} catch (error) {
		return errorResponse(id, error);
	}
}

const server = Bun.serve<SocketData>({
	hostname,
	port,
	fetch: async (request, serverInstance) => {
		const url = new URL(request.url);

		if (url.pathname === "/api/dev-reload" && request.method === "GET") {
			if (serverInstance.upgrade(request, { data: { isDevReload: true } })) {
				return undefined;
			}
			return new Response("WebSocket upgrade required", { status: 426 });
		}

		if (url.pathname === "/api/fs/browse" && request.method === "GET") {
			const id = requestId(request);
			const targetPath = url.searchParams.get("path") || process.cwd();
			try {
				const resolvedPath = resolve(targetPath);
				const parentPath =
					dirname(resolvedPath) !== resolvedPath ? dirname(resolvedPath) : null;
				const dirEntries = await readdir(resolvedPath, { withFileTypes: true });
				const IGNORED_BROWSE_DIRS = new Set([".macro", ".macro-user", ".git"]);
				const entries = await Promise.all(
					dirEntries
						.filter(
							(entry) =>
								entry.isDirectory() && !IGNORED_BROWSE_DIRS.has(entry.name),
						)
						.map(async (entry) => {
							const entryPath = join(resolvedPath, entry.name);
							const isMacroProject =
								await isValidMacroProjectDirectory(entryPath);
							return {
								name: entry.name,
								isDirectory: true,
								isMacroProject,
							};
						}),
				);
				entries.sort((a, b) => a.name.localeCompare(b.name));
				return Response.json(
					response(id, {
						currentPath: resolvedPath,
						parentPath,
						entries,
					}),
				);
			} catch (error) {
				return errorResponse(id, error);
			}
		}
		if (url.pathname === "/api/fs/directory" && request.method === "POST") {
			const id = requestId(request);
			try {
				const envelope = await jsonBody(request);
				const payload = (envelope.payload ?? {}) as {
					parentPath?: unknown;
					name?: unknown;
				};
				if (typeof payload.parentPath !== "string" || !payload.parentPath) {
				throw new SessionError(
					"INVALID_REQUEST",
					"request.parentPath.required",
					false,
				);
				}
				if (typeof payload.name !== "string") {
				throw new SessionError(
					"INVALID_REQUEST",
					"request.directoryName.required",
					false,
				);
				}
				const created = await sessions.createDirectory(
					payload.parentPath,
					payload.name,
				);
				return Response.json(
					response(envelope.requestId || id, { path: created.path }),
				);
			} catch (error) {
				return errorResponse(id, error);
			}
		}
		if (url.pathname === "/api/project/file-tree" && request.method === "POST")
			return handleJson(request, undefined, async (envelope) => ({
				tree: await sessions.getFileTree(envelope.sessionId),
			}));
		if (url.pathname === "/api/project/file" && request.method === "POST")
			return handleJson(request, undefined, async (envelope) => {
				const payload = parseProjectPathPayload(envelope.payload);
				if (!payload)
					throw new SessionError(
						"INVALID_REQUEST",
						"request.filePath.required",
						false,
					);
				return sessions.createFile(
					envelope.sessionId,
					payload.parentPath,
					payload.name,
				);
			});
		if (url.pathname === "/api/project/directory" && request.method === "POST")
			return handleJson(request, undefined, async (envelope) => {
				const payload = parseProjectPathPayload(envelope.payload);
				if (!payload)
					throw new SessionError(
						"INVALID_REQUEST",
						"request.directoryPath.required",
						false,
					);
				return sessions.createProjectDirectory(
					envelope.sessionId,
					payload.parentPath,
					payload.name,
				);
			});
		if (url.pathname === "/api/project/rename" && request.method === "POST")
			return handleJson(request, undefined, async (envelope) => {
				const payload = parseProjectRenamePayload(envelope.payload);
				if (!payload)
					throw new SessionError(
						"INVALID_REQUEST",
						"request.renamePaths.required",
						false,
					);
				await sessions.renamePath(
					envelope.sessionId,
					payload.source,
					payload.destination,
				);
				return { renamed: true };
			});
		if (url.pathname === "/api/project/delete" && request.method === "POST")
			return handleJson(request, undefined, async (envelope) => {
				const payload = parseProjectDeletePayload(envelope.payload);
				if (!payload)
					throw new SessionError(
						"INVALID_REQUEST",
						"request.deletePath.required",
						false,
					);
				await sessions.deletePath(envelope.sessionId, payload.path);
				return { deleted: true };
			});
		const artifactMatch = url.pathname.match(
			/^\/api\/sessions\/([^/]+)\/artifacts\/([^/]+)$/,
		);
		if (artifactMatch && request.method === "GET") {
			const artifact = sessions.getArtifact(
				decodeURIComponent(artifactMatch[2]!),
			);
			if (
				!artifact ||
				(artifact.owner !== undefined &&
					artifact.owner !== decodeURIComponent(artifactMatch[1]!))
			)
				return new Response("Artifact not found", { status: 404 });
			return new Response(new Blob([artifact.data as BlobPart]), {
				headers: {
					"Content-Type": artifact.mimeType,
					"Content-Disposition": `attachment; filename="${artifact.name.replace(/["\\\r\n]/g, "_")}"`,
				},
			});
		}
		const sessionMatch = url.pathname.match(
			/^\/api\/sessions\/([^/]+)(?:\/(events|snapshot|commands|settings|settings\.ui|settings\.bundle|editor|project))?$/,
		);
		if (url.pathname === "/api/sessions" && request.method === "POST") {
			return handleJson(request, undefined, async (envelope) => {
				const raw = (envelope.payload ?? {}) as Record<string, unknown>;
				const profileId =
					typeof raw.profileId === "string" ? raw.profileId : undefined;
				const locale = typeof raw.locale === "string" ? raw.locale : undefined;
				const initialText =
					typeof raw.initialText === "string" ? raw.initialText : undefined;
				const keymap =
					raw.keymap === undefined ? undefined : parseKeymapProfile(raw.keymap);
				if (raw.keymap !== undefined && !keymap)
					throw new SessionError(
						"INVALID_REQUEST",
						"request.keymap.malformed",
						false,
					);
				const snapshot = await sessions.create({
					profileId,
					locale,
					initialText,
					keymap,
				});
				return {
					sessionId: snapshot.sessionId,
					workspaceId: snapshot.workspaceId,
					protocolVersion: MACRO_PROTOCOL_VERSION,
					snapshot,
				};
			});
		}
		if (sessionMatch) {
			const sessionId = decodeURIComponent(sessionMatch[1]!);
			const operation = sessionMatch[2];
			if (operation === "events" && request.method === "GET") {
				if (!sessions.get(sessionId))
					return new Response("Session not found", { status: 404 });
				if (serverInstance.upgrade(request, { data: { sessionId } }))
					return undefined;
				return new Response("WebSocket upgrade required", { status: 426 });
			}
			if (operation === "snapshot" && request.method === "GET") {
				try {
					return Response.json(
						response(requestId(request), sessions.snapshotFor(sessionId)),
					);
				} catch (error) {
					return errorResponse(requestId(request), error);
				}
			}
			if (operation === "commands" && request.method === "POST")
				return handleJson(request, sessionId, async (envelope) => {
					const payload = envelope.payload as {
						operation?: string;
						command?: string;
						args?: readonly unknown[];
						expectedRevision?: number;
						profileId?: string;
						chord?: string;
						context?: Record<string, string | boolean | undefined>;
					};
					if (!payload)
						throw new SessionError(
							"INVALID_COMMAND",
							"errors.commandOperationRequired",
							false,
						);
					if (envelope.type === "keymap.profile.select") {
						if (typeof payload.profileId !== "string")
							throw new SessionError(
								"INVALID_COMMAND",
								"errors.keymapProfileRequired",
								false,
							);
						const snapshot = await sessions.selectKeymap(
							sessionId,
							payload.profileId,
						);
						return { profileId: payload.profileId, snapshot };
					}
					if (envelope.type === "keymap.binding.resolve") {
						if (
							typeof payload.chord !== "string" ||
							!payload.context ||
							typeof payload.context !== "object"
						)
							throw new SessionError(
								"INVALID_COMMAND",
								"errors.bindingContextRequired",
								false,
							);
						const resolution = await sessions.resolveBinding(
							sessionId,
							payload.chord,
							payload.context,
						);
						return { resolution };
					}
					if (envelope.type !== "command.execute")
						throw new SessionError(
							"INVALID_COMMAND",
							"errors.unsupportedCommandOperation",
							false,
						);
					if (typeof payload.command !== "string")
						throw new SessionError(
							"INVALID_COMMAND",
							"errors.canonicalCommandRequired",
							false,
						);
					const execution = await sessions.executeCommand(
						sessionId,
						payload.command,
						payload.args ?? [],
						payload.expectedRevision,
					);
					return { command: payload.command, ...execution };
				});
			if (operation === "settings" && request.method === "POST")
				return handleJson(request, sessionId, async (envelope) =>
					sessions.settings(sessionId, envelope.payload as SettingsOperation),
				);
			if (operation === "settings.ui" && request.method === "POST")
				return handleJson(request, sessionId, async (envelope) =>
					sessions.settingsUi(
						sessionId,
						envelope.payload as SettingsUiOperation,
					),
				);
			if (operation === "settings.bundle" && request.method === "POST")
				return handleJson(request, sessionId, async (envelope) =>
					sessions.settingsBundle(
						sessionId,
						envelope.payload as SettingsBundleOperation,
					),
				);
			if (operation === "editor" && request.method === "POST")
				return handleJson(request, sessionId, async (envelope) => {
					const payload = envelope.payload as EditorOperation;
					if (!payload || typeof payload.operation !== "string")
						throw new SessionError(
							"INVALID_EDITOR_OPERATION",
							"editor.operation.required",
							false,
						);
					return sessions.editor(sessionId, payload);
				});
			if (operation === "project" && request.method === "POST")
				return handleJson(request, sessionId, async (envelope) => {
					const payload = parseProjectAction(envelope.payload);
					if (!payload)
						throw new SessionError(
							"INVALID_REQUEST",
							"request.payload.malformed",
							false,
						);
					if (payload.operation === "project.getConfiguration")
						return sessions.getProjectConfiguration(sessionId);
					if (payload.operation === "project.updateConfiguration") {
						const parsed = parseProjectUpdateConfiguration(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.configuration.update.malformed",
								false,
							);
						if (parsed.unsupportedFields?.length)
							return sessions.rejectUnsupportedProjectConfigurationFields(
								sessionId,
								parsed.unsupportedFields,
							);
						return sessions.updateProjectConfiguration(sessionId, parsed);
					}
					if (payload.operation === "project.previewBackendMigration") {
						const parsed = parsePreviewBackendMigration(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.migration.preview.malformed",
								false,
							);
						return sessions.previewBackendMigration(sessionId, parsed.target);
					}
					if (payload.operation === "project.applyBackendMigration") {
						const parsed = parseApplyBackendMigration(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.migration.apply.malformed",
								false,
							);
						return sessions.applyBackendMigration(
							sessionId,
							parsed.target,
							parsed.expectedRevision,
						);
					}
					if (payload.operation === "project.recoverBackendMigration")
						return sessions.recoverBackendMigration(sessionId);
					if (payload.operation === "project.getMigrationJournal") {
						const parsed = parseGetMigrationJournal(payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.migration.journal.malformed",
								false,
							);
						return sessions.getMigrationJournal(sessionId);
					}
					if (payload.operation === "project.discardBackendMigration") {
						const parsed = parseDiscardBackendMigration(payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.migration.discard.malformed",
								false,
							);
						return sessions.discardBackendMigration(sessionId);
					}
					if (payload.operation === "project.resumeBackendMigration") {
						const parsed = parseResumeBackendMigration(payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.migration.resume.malformed",
								false,
							);
						return sessions.resumeBackendMigration(sessionId);
					}
					if (payload.operation === "project.previewExtensionGroup") {
						const parsed = parsePreviewExtensionGroup(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.extensionGroup.preview.malformed",
								false,
							);
						return sessions.previewExtensionGroup(sessionId, parsed);
					}
					if (payload.operation === "project.updateExtensionGroup") {
						const parsed = parseUpdateExtensionGroup(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.extensionGroup.update.malformed",
								false,
							);
						return sessions.updateExtensionGroup(sessionId, parsed);
					}
					if (payload.operation === "project.createExtensionGroup") {
						const parsed = parseCreateExtensionGroup(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.extensionGroup.create.malformed",
								false,
							);
						return sessions.createExtensionGroup(sessionId, parsed);
					}
					if (payload.operation === "project.duplicateExtensionGroup") {
						const parsed = parseDuplicateExtensionGroup(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.extensionGroup.duplicate.malformed",
								false,
							);
						return sessions.duplicateExtensionGroup(sessionId, parsed);
					}
					if (payload.operation === "project.deleteExtensionGroup") {
						const parsed = parseDeleteExtensionGroup(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.extensionGroup.delete.malformed",
								false,
							);
						return sessions.deleteExtensionGroup(sessionId, parsed);
					}
					if (payload.operation === "project.setActiveExtensionGroup") {
						const parsed = parseSetActiveExtensionGroup(envelope.payload);
						if (!parsed)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.extensionGroup.activate.malformed",
								false,
							);
						return sessions.setActiveExtensionGroup(sessionId, parsed);
					}
					if (payload.action === "open") {
						if (!payload.path)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.path.required",
								false,
							);
						const snapshot = await sessions.openProject(
							sessionId,
							payload.path,
						);
						return { snapshot };
					}
					if (payload.action === "init") {
						if (!payload.path)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.path.required",
								false,
							);
						const snapshot = await sessions.initProject(
							sessionId,
							payload.path,
							payload.displayName,
						);
						return { snapshot };
					}
					if (payload.action === "saveAs") {
						if (!payload.path)
							throw new SessionError(
								"INVALID_REQUEST",
								"project.path.required",
								false,
							);
						const snapshot = await sessions.saveAsProject(
							sessionId,
							payload.path,
							payload.displayName,
						);
						return { snapshot };
					}
					if (payload.action === "close") {
						const snapshot = await sessions.closeProject(sessionId);
						return { snapshot };
					}
					throw new SessionError(
						"INVALID_REQUEST",
						"project.action.unknown",
						false,
					);
				});
			if (!operation && request.method === "DELETE") {
				try {
					await sessions.dispose(sessionId);
					return Response.json(
						response(requestId(request), { disposed: true }),
					);
				} catch (error) {
					return errorResponse(requestId(request), error);
				}
			}
		}
		if (url.pathname.startsWith("/assets/"))
			return (
				(await serveAsset(url.pathname)) ??
				new Response("Not found", { status: 404 })
			);
		return new Response(indexHtml, {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	},
	websocket: {
		open(socket) {
			if (socket.data.isDevReload) {
				devReloadSockets.add(socket);
				return;
			}
			if (!socket.data.sessionId) return;
			const unsubscribe = sessions.subscribe(socket.data.sessionId, (event) =>
				socket.send(JSON.stringify(event)),
			);
			sockets.set(socket as unknown as WebSocket, unsubscribe);
			socket.send(
				JSON.stringify({
					version: MACRO_PROTOCOL_VERSION,
					type: "session.ready",
					sessionId: socket.data.sessionId,
					sequence: 0,
					revision: sessions.snapshotFor(socket.data.sessionId).revision,
					eventId: crypto.randomUUID(),
					payload: { snapshot: sessions.snapshotFor(socket.data.sessionId) },
				}),
			);
		},
		close(socket) {
			if (socket.data.isDevReload) {
				devReloadSockets.delete(socket);
				return;
			}
			const key = socket as unknown as WebSocket;
			sockets.get(key)?.();
			sockets.delete(key);
		},
		message(socket, message) {
			if (message === "snapshot" && socket.data.sessionId)
				socket.send(
					JSON.stringify({
						type: "workspace.changed",
						version: MACRO_PROTOCOL_VERSION,
						sessionId: socket.data.sessionId,
						eventId: crypto.randomUUID(),
						sequence: 0,
						revision: sessions.snapshotFor(socket.data.sessionId).revision,
						payload: { snapshot: sessions.snapshotFor(socket.data.sessionId) },
					}),
				);
		},
	},
});

console.log(`Macro Web listening at http://${hostname}:${server.port}`);
const cleanupTimer = setInterval(
	() => void sessions.disposeAbandoned(),
	60_000,
);
const shutdown = async () => {
	clearInterval(cleanupTimer);
	server.stop(true);
	await sessions.disposeAll();
	await host.dispose();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function argument(name: string): string | undefined {
	const prefix = `--${name}=`;
	return process.argv
		.find((value) => value.startsWith(prefix))
		?.slice(prefix.length);
}
