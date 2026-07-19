import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as crypto from "crypto";
import { loadMiddlewareConfig, resolveSource, resolveConfigDir } from "../config/loader";
import { validateMiddlewareConfig } from "../config/validator";
import { MemorySessionFilterStore, MemoryPersistentFilterStore, MemorySessionObjectStore, MemoryPersistentObjectStore } from "../adapters/storage/memory-repo";
import { SqliteFilterStore } from "../adapters/storage/sqlite-repo";
import { FilterStore } from "../middleware/filter/store";
import { ObjectStore } from "../middleware/object/store";
import type { TableSchema, PaginationLimitsConfig } from "../config/types";
import { clampLimit, buildLimitField } from "../config/pagination";

const server = new McpServer({
  name: "log-service",
  version: "1.0.0",
});

const SECRET = process.env.LOG_SERVICE_SECRET || crypto.randomBytes(32).toString("hex");

interface LogPageToken {
  type: "filter" | "object";
  sessionId: string;
  currentNodeId: string | null;
  pageSize: number;
  userId?: string;
}

function createToken(payload: LogPageToken): string {
  const data = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64url");
}

function verifyToken(token: string): LogPageToken {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const expectedSignature = crypto.createHmac("sha256", SECRET).update(parsed.data).digest("base64url");
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

function registerLogTools(paginationLimits: PaginationLimitsConfig | undefined) {
  server.registerTool(
    "log_open",
    {
      description: "Start a stateful log traversal session for a filter or object",
      inputSchema: {
        type: z.enum(["filter", "object"]).describe("Whether to log a filter or an object history."),
        session_id: z.string().describe("The session identifier."),
        id_or_alias: z.string().describe("The starting ID or alias."),
        limit: buildLimitField("log_page_size", paginationLimits),
        user_id: z.string().optional().describe("Optional user identifier.")
      }
    },
    async ({ type, session_id, id_or_alias, limit, user_id }) => {
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
          const node = await filterStore.getFilter(currentNodeId, session_id, user_id);
          if (!node) break;
          entries.push({
            id: node.filterId,
            parent_id: node.parentFilterId ?? null,
            created_at: node.createdAt,
            rules: node.rules
          });
          currentNodeId = node.parentFilterId ?? null;
        } else {
          const node = await objectStore.getObject(currentNodeId, session_id, user_id);
          if (!node) break;
          const parentNode = node.parentObjectId ? await objectStore.getObject(node.parentObjectId, session_id, user_id) : null;
          
          const delta: Record<string, any> = {};
          const currData = node.data || {};
          const parentData = parentNode ? (parentNode.data || {}) : {};
          for (const key of Object.keys(currData)) {
            if (!parentNode || JSON.stringify(currData[key]) !== JSON.stringify(parentData[key])) {
              delta[key] = currData[key];
            }
          }

          entries.push({
            id: node.objectId,
            parent_id: node.parentObjectId ?? null,
            created_at: node.createdAt,
            delta
          });
          currentNodeId = node.parentObjectId ?? null;
        }
        count++;
      }

      const token = currentNodeId ? createToken({
        type,
        sessionId: session_id,
        currentNodeId,
        pageSize,
        userId: user_id
      }) : null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            entries,
            next_page_token: token,
            has_more: !!token
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "log_next",
  {
    description: "Fetch the next page of log entries using a signed page token",
    inputSchema: {
      page_token: z.string().describe("The signed cryptographic page token returned from a previous call.")
    }
  },
  async ({ page_token }) => {
    try {
      const payload = verifyToken(page_token);
      const { type, sessionId, currentNodeId: startNodeId, pageSize: limit, userId: user_id } = payload;

      const entries: any[] = [];
      let currentNodeId: string | null = startNodeId;
      let count = 0;

      while (currentNodeId && count < limit) {
        if (type === "filter") {
          const node = await filterStore.getFilter(currentNodeId, sessionId, user_id);
          if (!node) break;
          entries.push({
            id: node.filterId,
            parent_id: node.parentFilterId ?? null,
            created_at: node.createdAt,
            rules: node.rules
          });
          currentNodeId = node.parentFilterId ?? null;
        } else {
          const node = await objectStore.getObject(currentNodeId, sessionId, user_id);
          if (!node) break;
          const parentNode = node.parentObjectId ? await objectStore.getObject(node.parentObjectId, sessionId, user_id) : null;
          
          const delta: Record<string, any> = {};
          const currData = node.data || {};
          const parentData = parentNode ? (parentNode.data || {}) : {};
          for (const key of Object.keys(currData)) {
            if (!parentNode || JSON.stringify(currData[key]) !== JSON.stringify(parentData[key])) {
              delta[key] = currData[key];
            }
          }

          entries.push({
            id: node.objectId,
            parent_id: node.parentObjectId ?? null,
            created_at: node.createdAt,
            delta
          });
          currentNodeId = node.parentObjectId ?? null;
        }
        count++;
      }

      const nextToken = currentNodeId ? createToken({
        type,
        sessionId,
        currentNodeId,
        pageSize: limit,
        userId: user_id
      }) : null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            entries,
            next_page_token: nextToken,
            has_more: !!nextToken
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
  );
}

async function main() {
  const workspaceRoot = resolveConfigDir();
  const config = await loadMiddlewareConfig(workspaceRoot);
  validateMiddlewareConfig(config);

  const getUrl = (locator: any) => {
    if (locator?._type === "adapter") return locator.options?.url?.toString();
    return undefined;
  };

  const sessUrl = getUrl(config.filter_session_state) as string | undefined;
  const sessionFilterStore = sessUrl && sessUrl.startsWith("sqlite://")
    ? new SqliteFilterStore(sessUrl.replace("sqlite://", ""))
    : new MemorySessionFilterStore();

  const globUrl = getUrl(config.filter_persistent_state?.global) as string | undefined;
  const persistentFilterStore = globUrl && globUrl.startsWith("sqlite://")
    ? new SqliteFilterStore(globUrl.replace("sqlite://", ""))
    : new MemoryPersistentFilterStore();

  const toolSchemas = new Map<string, Record<string, TableSchema>>();
  const pinnedSchemas = new Map<string, TableSchema>();

  if (config.tools) {
    for (const [toolName, toolConfig] of Object.entries(config.tools)) {
      try {
        const schemaData = await resolveSource(toolConfig.schema, workspaceRoot) as any;
        if (schemaData && schemaData.table_schemas) {
          toolSchemas.set(toolName, schemaData.table_schemas);
        }
      } catch (_) {}
    }
  }

  const threshold = config.auto_compression?.filter_chain_threshold ?? 20;
  filterStore = new FilterStore(
    sessionFilterStore,
    persistentFilterStore,
    toolSchemas,
    pinnedSchemas,
    threshold
  );

  const sessionObjectStore = new MemorySessionObjectStore();
  const persistentObjectStore = new MemoryPersistentObjectStore();
  const objectSchemas = new Map<string, any>();
  if (config.object_schemas) {
    for (const [schemaName, locator] of Object.entries(config.object_schemas)) {
      try {
        const schemaLocator = "schema" in locator ? locator.schema : locator;
        const schemaData = await resolveSource(schemaLocator, workspaceRoot) as any;
        if (schemaData) {
          if ("schema" in locator && locator.validation_engine) {
            schemaData.validation_engine = await resolveSource(locator.validation_engine, workspaceRoot);
          }
          objectSchemas.set(schemaName, schemaData);
        }
      } catch (_) {}
    }
  }

  const limits = config.object_schema_limits;
  const objectThreshold = config.auto_compression?.object_chain_threshold ?? 15;
  objectStore = new ObjectStore(
    sessionObjectStore,
    persistentObjectStore,
    objectSchemas,
    limits?.max_fields_per_def ?? 7,
    limits?.max_ref_depth ?? 5,
    objectThreshold
  );

  registerLogTools(config.pagination_limits);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Log Service MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
