import { relative, resolve, sep } from "node:path";
import { createMacroHost } from "../../macro-host/src/index";

const packageRoot = resolve(import.meta.dir, "..");
const buildRoot = resolve(packageRoot, "dist/dev");
const assetsRoot = resolve(buildRoot, "assets");
const port = Number(Bun.env.PORT ?? 3000);

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

const host = await createMacroHost({ defaults: {} });
const loaded = await host.createWorkspace();
const sockets = new Set<unknown>();

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b1020" />
    <title>Macro Web</title>
    <link rel="stylesheet" href="/assets/macro-web.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/macro-web.js"></script>
  </body>
</html>`;

function isWithinRoot(path: string, root: string): boolean {
	const resolved = resolve(path);
	const rootRelative = relative(root, resolved);
	return rootRelative === "" || (!rootRelative.startsWith(`..${sep}`) && rootRelative !== "..");
}

async function serveAsset(pathname: string): Promise<Response | undefined> {
	const assetPath = resolve(assetsRoot, pathname.slice("/assets/".length));
	if (!isWithinRoot(assetPath, assetsRoot)) return new Response("Forbidden", { status: 403 });
	const file = Bun.file(assetPath);
	if (!(await file.exists())) return undefined;
	return new Response(file);
}

function workspaceSnapshot() {
	return {
		workspaceId: "macro-web-workspace",
		sessionId: "macro-web-session",
		profileId: loaded.profile?.id ?? "base",
		enabledExtensionIds: loaded.resolvedExtensionIds,
		diagnostics: [],
	};
}

const server = Bun.serve({
	port,
	fetch: async (request, server) => {
		const url = new URL(request.url);

		if (url.pathname === "/api/workspace/snapshot") {
			return Response.json(workspaceSnapshot());
		}

		if (url.pathname === "/api/workspace/events" && server.upgrade(request)) {
			return undefined;
		}

		if (url.pathname.startsWith("/assets/")) {
			return (await serveAsset(url.pathname)) ?? new Response("Not found", { status: 404 });
		}

		return new Response(indexHtml, {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	},
	websocket: {
		open(socket) {
			sockets.add(socket);
			socket.send(JSON.stringify({ type: "workspace.changed", snapshot: workspaceSnapshot() }));
		},
		close(socket) {
			sockets.delete(socket);
		},
		message() {},
	},
});

console.log(`Macro Web listening at http://localhost:${server.port}`);

const shutdown = async () => {
	server.stop(true);
	await host.dispose();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
