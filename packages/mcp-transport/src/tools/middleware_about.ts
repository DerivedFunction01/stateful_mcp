import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiddlewareConfig } from "@stateful-mcp/core";
import { resolveAboutOrExamples } from "@stateful-mcp/core";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localAboutDir = path.resolve(__dirname, "../about");

/**
 * Register the cross-cutting `middleware_about` tool on an MCP server.
 * This tool explains how all stateful middleware services orchestrate together
 * and is independent of any single service (filter, object, form, event, etc.).
 *
 * Call this once per server, after all service-specific tools have been registered.
 */
export function registerMiddlewareAboutTool(
	server: McpServer,
	config: MiddlewareConfig,
	workspaceRoot: string,
): void {
	server.registerTool(
		"middleware_about",
		{
			description:
				"Get meta-documentation explaining the orchestration of all stateful middleware services",
			inputSchema: {},
		},
		async () => {
			try {
				const content = await resolveAboutOrExamples(
					config.about_and_examples?.middleware_about,
					path.join(localAboutDir, "middleware.md"),
					workspaceRoot,
				);
				return { content: [{ type: "text" as const, text: content }] };
			} catch (err: any) {
				return {
					content: [
						{ type: "text" as const, text: err.message || String(err) },
					],
					isError: true,
				};
			}
		},
	);
}
