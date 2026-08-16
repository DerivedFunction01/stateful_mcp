import { render } from "ink";
import React from "react";
import { MacroCliApp } from "./app";
import { loadMacroCliWorkspace, type LoadMacroCliOptions } from "./workspace-loader";

export * from "./terminal-dispatcher";
export * from "./workspace-loader";
export * from "./renderer";

export async function main(args = process.argv.slice(2)): Promise<void> {
	if (args.includes("--headless")) {
		console.error("macro-cli --headless is reserved for a future run/batch interface");
		process.exitCode = 2;
		return;
	}
	const options = parseArgs(args);
	const loaded = await loadMacroCliWorkspace(options);
	const app = render(React.createElement(MacroCliApp, {
		workspace: loaded.workspace,
		keymap: loaded.keymap,
	}));
	await app.waitUntilExit();
}

export function parseArgs(args: readonly string[]): LoadMacroCliOptions {
	const get = (name: string): string | undefined => {
		const prefix = `--${name}=`;
		const value = args.find((arg) => arg.startsWith(prefix));
		return value?.slice(prefix.length);
	};
	return {
		workspacePath: get("workspace"),
		profilePath: get("profile"),
		keymapPath: get("keymap"),
		locale: get("locale"),
		initialText: get("text"),
	};
}

if (import.meta.main) await main();
