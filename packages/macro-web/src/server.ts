import { access, readdir } from "node:fs/promises";
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

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

interface SocketData {
	readonly sessionId: string;
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
	throw new Error("Macro Web browser build failed");
}

const host = await createMacroHost({
	defaults: {},
	...(projectRoot ? { projectRoot } : {}),
});
const sessions = new HostSessionManager(host, 30 * 60 * 1000, projectRoot);
const sockets = new Map<WebSocket, () => void>();

const indexHtml = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#0b1020" /><title>Macro Web</title><link rel="stylesheet" href="/assets/macro-web.css" /></head>
<body><div id="root"></div><script type="module" src="/assets/macro-web.js"></script></body></html>`;

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
			"Request envelope is invalid",
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
			: hostError(
					"HOST_REQUEST_FAILED",
					error instanceof Error ? error.message : "Host request failed",
				);
	const status =
		hostErrorValue.code === "SESSION_NOT_FOUND"
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
				"Request session does not match URL",
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
		if (url.pathname === "/api/fs/browse" && request.method === "GET") {
			const id = requestId(request);
			const targetPath = url.searchParams.get("path") || process.cwd();
			try {
				const resolvedPath = resolve(targetPath);
				const parentPath =
					dirname(resolvedPath) !== resolvedPath ? dirname(resolvedPath) : null;
				const dirEntries = await readdir(resolvedPath, { withFileTypes: true });
				const entries = await Promise.all(
					dirEntries
						.filter((entry) => entry.isDirectory())
						.map(async (entry) => {
							const entryPath = join(resolvedPath, entry.name);
							const isMacroProject = await fileExists(
								join(entryPath, ".macro", "project.json"),
							);
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
		const sessionMatch = url.pathname.match(
			/^\/api\/sessions\/([^/]+)(?:\/(events|snapshot|commands|settings|settings\.ui|settings\.bundle|editor|project))?$/,
		);
		if (url.pathname === "/api/sessions" && request.method === "POST") {
			return handleJson(request, undefined, async (envelope) => {
				const payload = (envelope.payload ?? {}) as {
					profileId?: string;
					locale?: string;
					initialText?: string;
					keymap?: Record<string, unknown>;
				};
				const snapshot = await sessions.create({
					profileId: payload.profileId,
					locale: payload.locale,
					initialText: payload.initialText,
					keymap: payload.keymap as never,
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
							"Editor operation is required",
							false,
						);
					return sessions.editor(sessionId, payload);
				});
			if (operation === "project" && request.method === "POST")
				return handleJson(request, sessionId, async (envelope) => {
					const payload = envelope.payload as {
						action: "open" | "init" | "saveAs" | "close";
						path?: string;
						displayName?: string;
					};
					if (payload.action === "open") {
						if (!payload.path)
							throw new SessionError(
								"INVALID_REQUEST",
								"Project path required",
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
								"Project path required",
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
								"Project path required",
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
						"Unknown project action",
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
			const key = socket as unknown as WebSocket;
			sockets.get(key)?.();
			sockets.delete(key);
		},
		message(socket, message) {
			if (message === "snapshot")
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
