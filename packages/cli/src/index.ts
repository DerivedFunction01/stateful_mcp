import { Cli2BootstrapBuilder } from "./lib/session/cli2-bootstrap";

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "help" || command === "--help") {
		console.log(`Usage:
  clinical notebook [--session=<id>]  Open the notebook editor

	  clinical init [--backend=memory|sqlite|jsonl] [--path=PATH]
                                 Initialize clinical bootstrap stores

  clinical profile list|get <id>  Inspect unified V2 profiles
  clinical session create|list    Manage notebook sessions

Legacy eval/session/profile commands are disabled in cli2.`);
		process.exit(0);
	}

	// ── notebook command — boot the Ink TUI ─────────────────────────
	if (command === "notebook") {
		const sessionArg = args.find((arg) => arg.startsWith("--session="));
		const preferredSessionId = sessionArg?.slice("--session=".length);
		const { render } = await import("ink");
		const { NotebookApp } = await import("./app");
		const { default: React } = await import("react");
		const { waitUntilExit } = render(
			React.createElement(NotebookApp, { preferredSessionId }),
		);
		await waitUntilExit();
		return;
	}

	if (command === "init") {
		const backendArg = args.find((arg) => arg.startsWith("--backend="));
		const pathArg = args.find((arg) => arg.startsWith("--path="));
		const backend = (backendArg?.slice("--backend=".length) ?? "memory") as
			| "memory"
			| "sqlite"
			| "jsonl";
		if (!["memory", "sqlite", "jsonl"].includes(backend)) {
			console.error(`cli2: unsupported init backend '${backend}'`);
			process.exitCode = 2;
			return;
		}
		const result = await Cli2BootstrapBuilder.withDefaultBackend(backend, {
			dbPath: pathArg?.slice("--path=".length),
		});
		const profiles = await result.profileStore.list();
		console.log(
			JSON.stringify({
				readiness: "bootstrap-ready",
				profiles: profiles.map((p) => p.profileId),
				storeCount: Object.keys(result.engine.getRuntime().stores).length + 1,
			}),
		);
		return;
	}

	if (command === "profile" || command === "session") {
		const { bootstrapSession } = await import(
			"./lib/session/bootstrap-session"
		);
		const result = await bootstrapSession({
			sessionId: `cli2-command-${Date.now()}`,
		});
		if (command === "profile") {
			const sub = args[1] ?? "list";
			const store = result.profileStore;
			if (sub === "list") console.log(JSON.stringify(await store.list()));
			else if (sub === "get" && args[2])
				console.log(JSON.stringify(await store.get(args[2])));
			else throw new Error("usage: clinical profile list | get <profileId>");
		} else {
			const sub = args[1] ?? "list";
			if (sub === "list")
				console.log(JSON.stringify(await result.notebookSessionStore.list()));
			else if (sub === "create")
				console.log(
					JSON.stringify({
						sessionId: result.sessionId,
						documentId: result.caseIdentity.documentId,
						workspaceId: result.caseIdentity.workspaceId,
					}),
				);
			else throw new Error("usage: clinical session create | list");
		}
		return;
	}

	if (command === "eval") {
		console.error(
			"cli2: eval is unavailable because V2 no longer uses a CDSL engine.",
		);
		process.exitCode = 2;
		return;
	}

	console.error(`unknown command: ${command}`);
	process.exit(1);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
