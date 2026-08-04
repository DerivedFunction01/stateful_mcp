async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "help" || command === "--help") {
		console.log(`Usage:
  clinical notebook              Open the  notebook editor

  clinical init [--backend=memory|sqlite|jsonl] [--path=PATH]
                                 Initialize clinical bootstrap stores

Legacy eval/session/profile commands are disabled in cli2.`);
		process.exit(0);
	}

	// ── notebook command — boot the Ink TUI ─────────────────────────
	if (command === "notebook") {
		const { render } = await import("ink");
		const { NotebookApp } = await import("./app");
		const { default: React } = await import("react");
		const { waitUntilExit } = render(React.createElement(NotebookApp));
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
		const { ClinicalBootstrap } = await import(
			"@stateful-mcp/clinical/bootstrap/bootstrap"
		);
		await ClinicalBootstrap.fromConfig({
			backend,
			dbPath: pathArg?.slice("--path=".length),
		});
		console.log(`clinical bootstrap initialized (${backend})`);
		return;
	}

	if (["eval", "session", "profile"].includes(command)) {
		console.error(
			`cli2: '${command}' is disabled until its V2 implementation is wired.`,
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
