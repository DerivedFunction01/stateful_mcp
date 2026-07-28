import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	buildLimitField,
	clampLimit,
	type FilterStore,
	loadMiddlewareConfig,
	type ObjectStore,
	resolveConfigDir,
	validateMiddlewareConfig,
} from "@stateful-mcp/core";
import type { PaginationLimitsConfig } from "@stateful-mcp/core/src/config/types";
import * as crypto from "crypto";
import { z } from "zod";
import { getFilterStore, getObjectStore } from "./helper";

const server = new McpServer({
	name: "log-service",
	version: "1.0.0",
});

const SECRET =
	process.env.LOG_SERVICE_SECRET || crypto.randomBytes(32).toString("hex");

interface LogPageToken {
	type: "filter" | "object";
	sessionId: string;
	currentNodeId: string | null;
	pageSize: number;
	userId?: string;
}

function createToken(payload: LogPageToken): string {
	const data = JSON.stringify(payload);
	const signature = crypto
		.createHmac("sha256", SECRET)
		.update(data)
		.digest("base64url");
	return Buffer.from(JSON.stringify({ data, signature })).toString("base64url");
}

function verifyToken(token: string): LogPageToken {
	try {
		const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
		const expectedSignature = crypto
			.createHmac("sha256", SECRET)
			.update(parsed.data)
			.digest("base64url");
		if (parsed.signature !== expectedSignature) {
			throw new Error("Invalid token signature");
		}
		return JSON.parse(parsed.data);
	} catch (err) {
		throw new Error("Invalid page token");
	}
}

let filterStore: FilterStore;
let objectStore: ObjectStore;

function registerLogTools(
	paginationLimits: PaginationLimitsConfig | undefined,
) {
	(server as any).registerTool(
		"log_open",
		{
			description:
				"Start a stateful log traversal session for a filter or object",
			inputSchema: {
				type: z
					.enum(["filter", "object"])
					.describe("Whether to log a filter or an object history."),
				id_or_alias: z.string().describe("The starting ID or alias."),
				limit: buildLimitField("log_page_size", paginationLimits),
			},
		},
		async (
			{
				type,
				id_or_alias,
				limit,
			}: { type: "filter" | "object"; id_or_alias: string; limit?: number },
			extra: any,
		) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			const user_id = extra?._metadata?.user_id;
			try {
				const pageSize = clampLimit(limit, "log_page_size", paginationLimits);
				let resolvedId = "";
				if (type === "filter") {
					resolvedId = await filterStore["resolveId"](id_or_alias, session_id);
				} else {
					resolvedId = await objectStore["resolveId"](id_or_alias, session_id);
				}

				const entries: any[] = [];
				let currentNodeId: string | null = resolvedId;
				let count = 0;

				while (currentNodeId && count < pageSize) {
					if (type === "filter") {
						const node = await filterStore.getFilter(
							currentNodeId,
							session_id,
							user_id,
						);
						if (!node) break;
						entries.push({
							id: node.filterId,
							parent_id: node.parentFilterId ?? null,
							created_at: node.createdAt,
							rules: node.rules,
						});
						currentNodeId = node.parentFilterId ?? null;
					} else {
						const node = await objectStore.getObject(
							currentNodeId,
							session_id,
							user_id,
						);
						if (!node) break;
						const parentNode = node.parentObjectId
							? await objectStore.getObject(
									node.parentObjectId,
									session_id,
									user_id,
								)
							: null;

						const delta: Record<string, any> = {};
						const currData = node.data || {};
						const parentData = parentNode ? parentNode.data || {} : {};
						for (const key of Object.keys(currData)) {
							if (
								!parentNode ||
								JSON.stringify(currData[key]) !==
									JSON.stringify(parentData[key])
							) {
								delta[key] = currData[key];
							}
						}

						entries.push({
							id: node.objectId,
							parent_id: node.parentObjectId ?? null,
							created_at: node.createdAt,
							delta,
						});
						currentNodeId = node.parentObjectId ?? null;
					}
					count++;
				}

				const token = currentNodeId
					? createToken({
							type,
							sessionId: session_id,
							currentNodeId,
							pageSize,
							userId: user_id,
						})
					: null;

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									entries,
									next_page_token: token,
									has_more: !!token,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"log_next",
		{
			description:
				"Fetch the next page of log entries using a signed page token",
			inputSchema: {
				page_token: z
					.string()
					.describe(
						"The signed cryptographic page token returned from a previous call.",
					),
			},
		},
		async ({ page_token }) => {
			try {
				const payload = verifyToken(page_token);
				const {
					type,
					sessionId,
					currentNodeId: startNodeId,
					pageSize: limit,
					userId: user_id,
				} = payload;

				const entries: any[] = [];
				let currentNodeId: string | null = startNodeId;
				let count = 0;

				while (currentNodeId && count < limit) {
					if (type === "filter") {
						const node = await filterStore.getFilter(
							currentNodeId,
							sessionId,
							user_id,
						);
						if (!node) break;
						entries.push({
							id: node.filterId,
							parent_id: node.parentFilterId ?? null,
							created_at: node.createdAt,
							rules: node.rules,
						});
						currentNodeId = node.parentFilterId ?? null;
					} else {
						const node = await objectStore.getObject(
							currentNodeId,
							sessionId,
							user_id,
						);
						if (!node) break;
						const parentNode = node.parentObjectId
							? await objectStore.getObject(
									node.parentObjectId,
									sessionId,
									user_id,
								)
							: null;

						const delta: Record<string, any> = {};
						const currData = node.data || {};
						const parentData = parentNode ? parentNode.data || {} : {};
						for (const key of Object.keys(currData)) {
							if (
								!parentNode ||
								JSON.stringify(currData[key]) !==
									JSON.stringify(parentData[key])
							) {
								delta[key] = currData[key];
							}
						}

						entries.push({
							id: node.objectId,
							parent_id: node.parentObjectId ?? null,
							created_at: node.createdAt,
							delta,
						});
						currentNodeId = node.parentObjectId ?? null;
					}
					count++;
				}

				const nextToken = currentNodeId
					? createToken({
							type,
							sessionId,
							currentNodeId,
							pageSize: limit,
							userId: user_id,
						})
					: null;

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									entries,
									next_page_token: nextToken,
									has_more: !!nextToken,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);
}

async function main() {
	const workspaceRoot = resolveConfigDir();
	const config = await loadMiddlewareConfig(workspaceRoot);
	validateMiddlewareConfig(config);

	[filterStore, objectStore] = await Promise.all([
		getFilterStore(config, workspaceRoot),
		getObjectStore(config, workspaceRoot),
	]);

	registerLogTools(config.pagination_limits);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("Log Service MCP Server running on stdio");
}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
