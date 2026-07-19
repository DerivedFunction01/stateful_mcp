import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveSource, resolveAboutOrExamples } from "../config/loader";
import { validateMiddlewareConfig } from "../config/validator";
import { MemorySessionEventStore, MemoryPersistentEventStore } from "../adapters/storage/memory-repo";
import { JsonlSessionEventStore, JsonlPersistentEventStore } from "../adapters/storage/jsonl-repo";
import { EventStore } from "../middleware/event/store";
import type { MiddlewareConfig } from "../config/types";

const server = new McpServer({
  name: "event-service",
  version: "1.0.0",
});

let eventStore: EventStore;
let config: MiddlewareConfig;

server.registerTool(
  "event_init",
  {
    description: "Initialize a new event log DAG chain",
    inputSchema: {
      schema_name: z.string().describe("The name of the registered event schema definition."),
      session_id: z.string().describe("The session identifier."),
      alias: z.string().optional().describe("Optional descriptive alias to tag the initial checkpoint."),
      data: z.array(z.record(z.string(), z.any())).optional().describe("Optional initial list of event records to pre-populate.")
    }
  },
  async ({ schema_name, session_id, alias, data }) => {
    try {
      const commitId = await eventStore.init(schema_name, session_id, alias, data);
      return { content: [{ type: "text", text: JSON.stringify({ commit_id: commitId }) }] };
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
      session_id: z.string().describe("The session identifier."),
      id_or_alias: z.string().describe("The tip commit ID or alias being appended to."),
      data: z.record(z.string(), z.any()).describe("Event parameter values satisfying the schema."),
      alias: z.string().optional().describe("Optional alias to tag the new tip checkpoint.")
    }
  },
  async ({ session_id, id_or_alias, data, alias }) => {
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
      session_id: z.string().describe("The session identifier."),
      id_or_alias: z.string().describe("The tip commit ID or alias to patch."),
      event_id: z.string().describe("The unique event ID of the record in the array."),
      patch_data: z.record(z.string(), z.any()).describe("Sparse parameter key-value pairs to update."),
      alias: z.string().optional().describe("Optional alias to tag the new checkpoint.")
    }
  },
  async ({ session_id, id_or_alias, event_id, patch_data, alias }) => {
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
      session_id: z.string().describe("The session identifier."),
      id_or_alias: z.string().describe("The tip commit ID or alias to delete from."),
      event_id: z.string().describe("The unique event ID of the record to remove."),
      alias: z.string().optional().describe("Optional alias to tag the new checkpoint.")
    }
  },
  async ({ session_id, id_or_alias, event_id, alias }) => {
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
    description: "Merge multiple parallel commit streams into a target commit",
    inputSchema: {
      session_id: z.string().describe("The session identifier."),
      source_ids_or_aliases: z.array(z.string()).describe("List of source branches or commit IDs to merge in."),
      target_id_or_alias: z.string().describe("The target branch or commit ID receiving the merge.")
    }
  },
  async ({ session_id, source_ids_or_aliases, target_id_or_alias }) => {
    try {
      const res = await eventStore.merge(session_id, source_ids_or_aliases, target_id_or_alias);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "event_merge_inspect",
  {
    description: "Inspect the status of a stateful merge resolution session",
    inputSchema: {
      merge_session_id: z.string().describe("The identifier of the merge session.")
    }
  },
  async ({ merge_session_id }) => {
    try {
      const info = await eventStore.mergeInspect(merge_session_id);
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
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
      session_id: z.string().describe("The session identifier.")
    }
  },
  async ({ merge_session_id, session_id }) => {
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
      session_id: z.string().describe("The session identifier."),
      keep_ids: z.array(z.string()).describe("Explicit commit IDs to whitelist."),
      whitelist_aliases: z.array(z.string()).describe("Alias whitelists."),
      blacklist_aliases: z.array(z.string()).optional().describe("Alias blacklists.")
    }
  },
  async ({ session_id, keep_ids, whitelist_aliases, blacklist_aliases }) => {
    try {
      const res = await eventStore.gc(session_id, keep_ids, whitelist_aliases, blacklist_aliases);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
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
      const workspaceRoot = process.cwd();
      const content = await resolveAboutOrExamples(
        config.about_and_examples?.middleware_about,
        "config/about/middleware.md",
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
      const workspaceRoot = process.cwd();
      const content = await resolveAboutOrExamples(
        config.about_and_examples?.event_about,
        "config/about/event.md",
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
      limit: z.number().optional().describe("Limit number of examples returned")
    }
  },
  async ({ page, limit }) => {
    try {
      const workspaceRoot = process.cwd();
      let content = await resolveAboutOrExamples(
        config.about_and_examples?.event_examples,
        "config/examples/event.md",
        workspaceRoot
      );
      if (page !== undefined || limit !== undefined) {
        const parts = content.split("\n\n---\n\n");
        const p = page ?? 1;
        const l = limit ?? 1;
        const paginated = parts.slice((p - 1) * l, p * l);
        content = paginated.join("\n\n---\n\n");
      }
      return { content: [{ type: "text", text: content }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

async function main() {
  const workspaceRoot = process.cwd();
  config = await loadMiddlewareConfig(workspaceRoot);
  validateMiddlewareConfig(config);

  const path = require("path");

  const sessionStore =
    config.event_session_state?._type === "file" && config.event_session_state.path.endsWith(".jsonl")
      ? new JsonlSessionEventStore(path.resolve(workspaceRoot, config.event_session_state.path))
      : new MemorySessionEventStore();

  const persistentStore =
    config.event_persistent_state?.global?._type === "file" && config.event_persistent_state.global.path.endsWith(".jsonl")
      ? new JsonlPersistentEventStore(path.resolve(workspaceRoot, config.event_persistent_state.global.path))
      : new MemoryPersistentEventStore();

  const objectSchemas = new Map<string, any>();
  const validationEngines = new Map<string, import("../config/types").ResourceLocator>();
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Event Service MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
