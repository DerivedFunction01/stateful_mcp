import "@opentui/react/runtime-plugin-support";
import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { createElement, createRoot } from "@opentui/react";
import { MacroCliApp } from "./app";
import { ComponentLabApp } from "./lab/ComponentLabApp";
import {
	type LoadMacroCliOptions,
	loadMacroCliWorkspace,
} from "./workspace-loader";

export {
	registerMacroLocales,
	resolveLabel,
	t,
	translate,
} from "@stateful-mcp/macro";
export * from "./lab/index";
export * from "./renderer";
export * from "./terminal-dispatcher";
export * from "./ui/index";
export * from "./workspace-loader";

export async function main(args = process.argv.slice(2)): Promise<void> {
	if (args.includes("--headless")) {
		console.error(
			"macro-cli --headless is reserved for a future run/batch interface",
		);
		process.exitCode = 2;
		return;
	}

	const options = parseArgs(args);

	if (options.inspect) {
		const renderer = await createCliRenderer({
			exitOnCtrlC: false,
			useMouse: true,
			autoFocus: true,
			useKittyKeyboard: {},
		});
		renderer.start();

		createRoot(renderer).render(
			createElement(ComponentLabApp, {
				renderer,
				initialStoryId: options.inspectTarget,
			}),
		);

		await new Promise<void>((resolve) => {
			if (!renderer.isRunning) {
				resolve();
				return;
			}
			renderer.once(CliRenderEvents.DESTROY, resolve);
		});
		return;
	}

	const loaded = await loadMacroCliWorkspace(options);
	const renderer = await createCliRenderer({
		exitOnCtrlC: false,
		useMouse: true,
		autoFocus: true,
		useKittyKeyboard: {},
		onDestroy: () => {
			void loaded.workspace.dispose();
		},
	});
	renderer.start();

	createRoot(renderer).render(
		createElement(MacroCliApp, {
			workspace: loaded.workspace,
			keymap: loaded.keymap,
			renderer,
		}),
	);

	await new Promise<void>((resolve) => {
		if (!renderer.isRunning) {
			resolve();
			return;
		}
		renderer.once(CliRenderEvents.DESTROY, resolve);
	});
}

export function parseArgs(args: readonly string[]): LoadMacroCliOptions {
	const get = (name: string): string | undefined => {
		const prefix = `--${name}=`;
		const value = args.find((arg) => arg.startsWith(prefix));
		return value?.slice(prefix.length);
	};

	let inspect = false;
	let inspectTarget: string | undefined;

	const inspectArg = args.find(
		(arg) => arg === "--inspect" || arg.startsWith("--inspect="),
	);
	if (inspectArg) {
		inspect = true;
		if (inspectArg.startsWith("--inspect=")) {
			const rawValue = inspectArg.slice("--inspect=".length);
			if (rawValue === "gallery") {
				inspectTarget = undefined;
			} else if (rawValue.startsWith("component=")) {
				inspectTarget = rawValue.slice("component=".length);
			} else if (rawValue.startsWith("view=")) {
				inspectTarget = rawValue.slice("view=".length);
			} else if (rawValue.startsWith("tab=")) {
				inspectTarget = rawValue.slice("tab=".length);
			} else {
				inspectTarget = rawValue;
			}
		}
	} else if (args[0] === "inspect") {
		inspect = true;
		const sub1 = args[1];
		const sub2 = args[2];
		if (!sub1 || sub1 === "gallery") {
			inspectTarget = undefined;
		} else if (sub1 === "component" || sub1 === "view" || sub1 === "tab") {
			inspectTarget = sub2;
		} else {
			inspectTarget = sub1;
		}
	}

	return {
		workspacePath: get("workspace"),
		profilePath: get("profile"),
		keymapPath: get("keymap"),
		locale: get("locale"),
		initialText: get("text"),
		...(inspect ? { inspect, inspectTarget } : {}),
	};
}

if (import.meta.main) await main();
