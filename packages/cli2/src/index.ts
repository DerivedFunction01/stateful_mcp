async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "help" || command === "--help") {
		console.log(`Usage:
  clinical notebook              Open the  notebook editor

Legacy init/eval/session/profile commands are disabled in cli2.`);
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

	if (["init", "eval", "session", "profile"].includes(command)) {
		console.error(
			`cli2: '${command}' is disabled until its  implementation is wired.`,
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
