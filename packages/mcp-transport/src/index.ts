#!/usr/bin/env bun
import { resolveConfigDir } from "@stateful-mcp/core";

const serviceType = process.env.SERVICE_TYPE || process.argv[2] || "filter";

// Expose the resolved config dir so child services read config from the
// intended location (CLI flag / env / cwd fallback, in that order).
const configDir = resolveConfigDir();
process.env.STATEFUL_MCP_CONFIG_DIR = configDir;

console.error(
	`[Monolith Router] Starting service: ${serviceType} (config: ${configDir})`,
);

async function start(service: string): Promise<void> {
	switch (service) {
		case "filter":
			await import("./tools/filter.js");
			break;
		case "object":
			await import("./tools/object.js");
			break;
		case "dictionary":
			await import("./tools/dictionary.js");
			break;
		case "log":
			await import("./tools/log.js");
			break;
		case "event":
			await import("./tools/event.js");
			break;
		case "form":
			await import("./tools/form.js");
			break;
		case "trace":
			await import("./tools/trace.js");
			break;
		case "variable":
			await import("./tools/variable.js");
			break;
		default:
			console.error(
				`[Error] Unknown SERVICE_TYPE: "${service}". Must be: "filter", "object", "dictionary", "log", "event", "form", "trace", or "variable"`,
			);
			process.exit(1);
	}
}

void start(serviceType);
