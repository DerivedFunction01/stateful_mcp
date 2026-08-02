import { ClinicalEngineBuilder } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import { handleEval } from "./commands/eval";
import { handleInit } from "./commands/init";
import { handleProfile } from "./commands/profile";
import { handleSession } from "./commands/session";

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "help" || command === "--help") {
		console.log(`Usage:
  clinical init                  Bootstrap and print readiness
  clinical eval <cdsl-text>      Parse CDSL and print result
  clinical session create <name> Create a new session
  clinical profile list          List parser profiles
  clinical profile get <id>      Get profile details
  clinical notebook              Open the interactive notebook editor`);
		process.exit(0);
	}

	// ── notebook command — boot the Ink TUI ─────────────────────────
	if (command === "notebook") {
		const { render } = await import("ink");
		const { NotebookApp } = await import("./app");
		const { default: React } = await import("react");
		const useV2 = args.includes("--v2");
		const { waitUntilExit } = render(
			React.createElement(NotebookApp, { variant: useV2 ? "v2" : "v1" }),
		);
		await waitUntilExit();
		return;
	}

	// Commands that need a runtime but no engine/session
	if (command === "init") {
		const { runtime } =
			await ClinicalEngineBuilder.withDefaultBackend("memory");
		await handleInit(runtime);
		return;
	}
	if (command === "profile") {
		const { runtime } =
			await ClinicalEngineBuilder.withDefaultBackend("memory");
		await handleProfile(runtime, args.slice(1));
		return;
	}

	// Commands that need a full engine
	const { engine } = await ClinicalEngineBuilder.withDefaultBackend("memory");

	if (command === "eval") {
		const sessionId = `cli-${Date.now()}`;
		await handleEval(engine, sessionId, args.slice(1));
		return;
	}
	if (command === "session") {
		await handleSession(engine, args.slice(1));
		return;
	}

	console.error(`unknown command: ${command}`);
	process.exit(1);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
