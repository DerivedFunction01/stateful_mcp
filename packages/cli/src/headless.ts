import type { HeadlessRequest } from "./lib/headless/command-contracts";
import { HeadlessDispatcher } from "./lib/headless/dispatcher";
import { responseExitCode, stableJson } from "./lib/output";

export async function runHeadless(
	args: string[],
	dispatcher = new HeadlessDispatcher(),
): Promise<number> {
	const request = parseHeadlessArgs(args);
	if (!request) {
		const response = {
			ok: false as const,
			version: 1 as const,
			command: "",
			error: {
				code: "USAGE_ERROR",
				message: "Usage: clinical notebook --headless <command> [options]",
			},
			diagnostics: [],
		};
		console.log(stableJson(response));
		return 2;
	}
	const response = await dispatcher.dispatch(request);
	console.log(stableJson(response));
	return responseExitCode(response);
}

export function parseHeadlessArgs(
	args: readonly string[],
): HeadlessRequest | undefined {
	if (args[0] !== "notebook" || args[1] !== "--headless") return undefined;
	const positional: string[] = [];
	const options: Record<string, string | boolean> = {};
	for (const arg of args.slice(2)) {
		if (arg.startsWith("--") && arg.includes("=")) {
			const index = arg.indexOf("=");
			options[arg.slice(2, index)] = arg.slice(index + 1);
		} else if (arg.startsWith("--")) options[arg.slice(2)] = true;
		else positional.push(arg);
	}
	if (!positional.length) return undefined;
	return { command: positional.join(" "), options };
}
