import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveSource, resolveAboutOrExamples, resolveConfigDir } from "@stateful-mcp/core";
import { validateMiddlewareConfig } from "@stateful-mcp/core";
import { MemorySessionEventStore, MemoryPersistentEventStore } from "@stateful-mcp/core";
import { JsonlSessionEventStore, JsonlPersistentEventStore } from "@stateful-mcp/core";
import { EventStore } from "@stateful-mcp/core";
import type { MiddlewareConfig, PaginationLimitsConfig } from "@stateful-mcp/core";
import { clampLimit, buildLimitField } from "@stateful-mcp/core";
import { getFilterStore, getObjectStore, getFormStore } from "./helper";
import { registerStateInitTool } from "./state_init.js";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localAboutDir = path.resolve(__dirname, "../about");
const localExamplesDir = path.resolve(__dirname, "../examples");


const server = new McpServer({
  name: "event-service",
  version: "1.0.0",
});

let eventStore: EventStore;
let config: MiddlewareConfig;
let configDir: string = process.cwd();

function registerEventTools(paginationLimits: PaginationLimitsConfig | undefined) {
  server.registerTool(
    "event_init",
  {
    description: "Initialize a new event log DAG chain",
    inputSchema: {
      schema_name: z.string().describe("The name of the registered event schema definition."),
      alias: z.string().optional().describe("Optional descriptive alias to tag the initial checkpoint."),
      data: z.array(z.record(z.string(), z.any())).optional().describe("Optional initial list of event records to pre-populate."),
      get_schema_hint: z.boolean().optional().describe("If true, returns the JSON schema definition in the response to guide parameter population.")
    }
  },
    async ({ schema_name, alias, data, get_schema_hint }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const commitId = await eventStore.init(schema_name, session_id, alias, data);
      const res: Record<string, any> = { commit_id: commitId };
      if (get_schema_hint) {
        res.schema_hint = eventStore.getSchema(schema_name);
      }
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_append",
  {
    description: "Append a new event instance to the log",
    inputSchema: {
      id_or_alias: z.string().describe("The tip commit ID or alias being appended to."),
      data: z.record(z.string(), z.any()).describe("Event parameter values satisfying the schema."),
      alias: z.string().optional().describe("Optional alias to tag the new tip checkpoint.")
    }
  },
    async ({ id_or_alias, data, alias }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const commitId = await eventStore.append(session_id, id_or_alias, data, alias);
      return { content: [{ type: "text", text: JSON.stringify({ commit_id: commitId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_patch",
  {
    description: "Patch an existing event instance within the log using a sparse delta",
    inputSchema: {
      id_or_alias: z.string().describe("The tip commit ID or alias to patch."),
      event_id: z.string().describe("The unique event ID of the record in the array."),
      patch_data: z.record(z.string(), z.any()).describe("Sparse parameter key-value pairs to update."),
      alias: z.string().optional().describe("Optional alias to tag the new checkpoint.")
    }
  },
    async ({ id_or_alias, event_id, patch_data, alias }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const commitId = await eventStore.patch(session_id, id_or_alias, event_id, patch_data, alias);
      return { content: [{ type: "text", text: JSON.stringify({ commit_id: commitId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_delete",
  {
    description: "Delete an existing event instance within the log",
    inputSchema: {
      id_or_alias: z.string().describe("The tip commit ID or alias to delete from."),
      event_id: z.string().describe("The unique event ID of the record to remove."),
      alias: z.string().optional().describe("Optional alias to tag the new checkpoint.")
    }
  },
    async ({ id_or_alias, event_id, alias }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const commitId = await eventStore.delete(session_id, id_or_alias, event_id, alias);
      return { content: [{ type: "text", text: JSON.stringify({ commit_id: commitId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_merge",
  {
    description: "Merge multiple parallel commit streams into a target commit. On conflict, returns summary counts only — use event_merge_inspect to page through individual conflicts.",
    inputSchema: {
      source_ids_or_aliases: z.array(z.string()).describe("List of source branches or commit IDs to merge in."),
      target_id_or_alias: z.string().describe("The target branch or commit ID receiving the merge.")
    }
  },
    async ({ source_ids_or_aliases, target_id_or_alias }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const res = await eventStore.merge(session_id, source_ids_or_aliases, target_id_or_alias);
      if (res.status === "conflict") {
        const total = res.conflicts?.length ?? 0;
        const pending = res.conflicts?.filter((c: any) => c.status === "pending").length ?? total;
        return {
          content: [{ type: "text", text: JSON.stringify({
            status: "conflict",
            merge_session_id: res.merge_session_id,
            total_conflicts: total,
            pending_count: pending,
            resolved_count: total - pending
          }) }]
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_merge_inspect",
  {
    description: "Inspect the status of a stateful merge resolution session, paging through conflicts",
    inputSchema: {
      merge_session_id: z.string().describe("The identifier of the merge session."),
      offset: z.number().optional().describe("Zero-based index of the first conflict to return (default 0)."),
      limit: buildLimitField("merge_conflicts_page_size", paginationLimits)
    }
  },
  async ({ merge_session_id, offset, limit }) => {
    try {
      const session = await eventStore.mergeInspect(merge_session_id);
      const pageSize = clampLimit(limit, "merge_conflicts_page_size", paginationLimits);
      const start = offset ?? 0;
      const all = session.conflicts;
      const page = all.slice(start, start + pageSize);
      const nextOffset = start + pageSize < all.length ? start + pageSize : null;
      const pendingCount = all.filter((c: any) => c.status === "pending").length;
      return {
        content: [{ type: "text", text: JSON.stringify({
          merge_session_id: session.mergeSessionId,
          conflicts: page,
          total_conflicts: all.length,
          pending_count: pendingCount,
          resolved_count: all.length - pendingCount,
          has_more: nextOffset !== null,
          next_offset: nextOffset
        }, null, 2) }]
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_merge_resolve",
  {
    description: "Resolve a specific conflict in a stateful merge session",
    inputSchema: {
      merge_session_id: z.string().describe("The current merge session identifier."),
      event_id: z.string().describe("The event ID with the conflict."),
      resolution: z.object({
        strategy: z.enum(["accept_source", "accept_target", "patch"]).describe("Strategy resolution."),
        source_id: z.string().optional().describe("Required if accept_source, identifying which source branch value to keep."),
        values: z.record(z.string(), z.any()).optional().describe("Required if patch, supplying custom merge parameter values.")
      }).describe("The resolution configuration.")
    }
  },
  async ({ merge_session_id, event_id, resolution }) => {
    try {
      const newSessionId = await eventStore.mergeResolve(merge_session_id, event_id, resolution);
      return { content: [{ type: "text", text: JSON.stringify({ merge_session_id: newSessionId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_merge_commit",
  {
    description: "Finalize and commit a merge session after resolving all conflicts",
    inputSchema: {
      merge_session_id: z.string().describe("The resolved merge session identifier."),
    }
  },
    async ({ merge_session_id }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const commitId = await eventStore.mergeCommit(merge_session_id, session_id);
      return { content: [{ type: "text", text: JSON.stringify({ commit_id: commitId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_gc",
  {
    description: "Run whitelisting garbage collection on event commits",
    inputSchema: {
      keep_ids: z.array(z.string()).describe("Explicit commit IDs to whitelist."),
      whitelist_aliases: z.array(z.string()).describe("Alias whitelists."),
      blacklist_aliases: z.array(z.string()).optional().describe("Alias blacklists.")
    }
  },
    async ({ keep_ids, whitelist_aliases, blacklist_aliases }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const res = await eventStore.gc(session_id, keep_ids, whitelist_aliases, blacklist_aliases);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_save",
  {
    description: "Promote and persist an event commit to user/global scope",
    inputSchema: {
      commit_id: z.string().describe("The event commit ID to persist."),
      tags: z.array(z.string()).describe("Searchable tags."),
      description: z.string().describe("Purpose description."),
      scope: z.enum(["session", "user", "global"]).describe("Ownership level."),
    }
  },
    async ({ commit_id, tags, description, scope }, extra: any) => {
      const session_id = extra?._metadata?.session_id ?? "default";
    try {
      const ownerScope = scope === "global" ? { level: "global" as const } : { level: "user" as const, userId: "" };
      const savedId = await eventStore.save(commit_id, tags, description, ownerScope, session_id);
      return { content: [{ type: "text", text: JSON.stringify({ saved_id: savedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "middleware_about",
  {
    description: "Get meta-documentation explaining the orchestration of all stateful middleware services",
    inputSchema: {}
  },
  async () => {
    try {
      const workspaceRoot = configDir;
      const content = await resolveAboutOrExamples(
        config.about_and_examples?.middleware_about,
        path.join(localAboutDir, "middleware.md"),
        workspaceRoot
      );
      return { content: [{ type: "text", text: content }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_about",
  {
    description: "Get meta-documentation explaining how to compose and merge stateful event log streams optimal for LLM context windows",
    inputSchema: {}
  },
  async () => {
    try {
      const workspaceRoot = configDir;
      const content = await resolveAboutOrExamples(
        config.about_and_examples?.event_about,
        path.join(localAboutDir, "event.md"),
        workspaceRoot
      );
      return { content: [{ type: "text", text: content }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_examples",
  {
    description: "Get worked conversation transcript examples showing ideal multi-turn interaction with the stateful event service",
    inputSchema: {
      page: z.number().optional().describe("Page number for pagination"),
      limit: buildLimitField("examples_page_size", paginationLimits)
    }
  },
  async ({ page, limit }) => {
    try {
      const workspaceRoot = configDir;
      let content = await resolveAboutOrExamples(
        config.about_and_examples?.event_examples,
        path.join(localExamplesDir, "event.md"),
        workspaceRoot
      );
      const parts = content.split("\n\n---\n\n");
      const p = page ?? 1;
      const l = clampLimit(limit, "examples_page_size", paginationLimits);
      const paginated = parts.slice((p - 1) * l, p * l);
      content = paginated.join("\n\n---\n\n");
      return { content: [{ type: "text", text: content }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);
}

async function main() {
  const workspaceRoot = resolveConfigDir();
  configDir = workspaceRoot;
  config = await loadMiddlewareConfig(workspaceRoot);
  validateMiddlewareConfig(config);


  const sessionStore =
    config.event_session_state?._type === "file" && config.event_session_state.path.endsWith(".jsonl")
      ? new JsonlSessionEventStore(path.resolve(workspaceRoot, config.event_session_state.path))
      : new MemorySessionEventStore();

  const persistentStore =
    config.event_persistent_state?.global?._type === "file" && config.event_persistent_state.global.path.endsWith(".jsonl")
      ? new JsonlPersistentEventStore(path.resolve(workspaceRoot, config.event_persistent_state.global.path))
      : new MemoryPersistentEventStore();

  const objectSchemas = new Map<string, any>();
  const validationEngines = new Map<string, import("@stateful-mcp/core").ResourceLocator>();
  if (config.object_schemas) {
    for (const [schemaName, entry] of Object.entries(config.object_schemas)) {
      try {
        // Support both plain ResourceLocator and { schema, validation_engine } form
        const locator = (entry as any).schema ?? entry;
        const schemaData = await resolveSource(locator, workspaceRoot) as any;
        objectSchemas.set(schemaName, schemaData);
        if ((entry as any).validation_engine) {
          validationEngines.set(schemaName, (entry as any).validation_engine);
        }
      } catch (_) {}
    }
  }

  const threshold = config.auto_compression?.object_chain_threshold ?? 15;
  eventStore = new EventStore(sessionStore, persistentStore, objectSchemas, threshold, validationEngines, workspaceRoot);

  const filterStore = getFilterStore(config, workspaceRoot);
  const objectStore = getObjectStore(config, workspaceRoot);
  const formStore = getFormStore(config, workspaceRoot);
  eventStore.setReferences({ filter: filterStore, object: objectStore, form: formStore });

  registerEventTools(config.pagination_limits);
  await registerStateInitTool(server, config, workspaceRoot);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Event Service MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});