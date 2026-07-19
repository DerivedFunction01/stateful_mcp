import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveSource, resolveAboutOrExamples } from "../config/loader";
import { validateMiddlewareConfig } from "../config/validator";
import { MemorySessionFilterStore, MemoryPersistentFilterStore } from "../adapters/storage/memory-repo";
import { SqliteFilterStore } from "../adapters/storage/sqlite-repo";
import { JsonlSessionFilterStore, JsonlPersistentFilterStore } from "../adapters/storage/jsonl-repo";
import { FilterStore } from "../middleware/filter/store";
import type { TableSchema, MiddlewareConfig, PaginationLimitsConfig } from "../config/types";
import { clampLimit } from "../config/pagination";

const server = new McpServer({
  name: "filter-service",
  version: "1.0.0",
});

let filterStore: FilterStore;
let config: MiddlewareConfig;
let paginationLimits: PaginationLimitsConfig | undefined;

const filterConditionSchema = z.object({
  property: z.string().describe("The property to filter on."),
  operator: z.enum([
    "eq", "neq", "gt", "geq", "lt", "leq", "like", "not_like",
    "in_set", "not_in_set", "between", "not_between"
  ]).describe("The comparison operator."),
  value: z.any().describe("The value(s) to match.")
});

const aggregationSchema = z.object({
  function: z.enum([
    "count", "count_distinct", "sum", "avg", "min", "max",
    "std_dev", "median", "q1", "q3", "range", "stat"
  ]).describe("The mathematical function to apply."),
  property: z.string().describe("The property to aggregate (or '*' for count)."),
  alias: z.string().describe("Output column name for the aggregated value.")
});

server.registerTool(
  "filter_init",
  {
    description: "Initialize a new filter session",
    inputSchema: {
      session_id: z.string().describe("The session identifier."),
      tool_name: z.string().optional().describe("Optional target tool for schema binding."),
      table_name: z.string().optional().describe("Optional sub-table within the tool."),
      alias: z.string().optional().describe("Optional descriptive alias to tag the initial state."),
      rules: z.array(filterConditionSchema).optional().describe("Optional initial list of filter rules to apply.")
    }
  },
  async ({ session_id, tool_name, table_name, alias, rules }) => {
    try {
      const filterId = await filterStore.init(session_id, tool_name, table_name, undefined, alias, rules);
      return { content: [{ type: "text", text: JSON.stringify({ filter_id: filterId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_add",
  {
    description: "Add conditions to a filter",
    inputSchema: {
      filter_id: z.string().describe("The current filter state ID or alias."),
      operations: z.array(filterConditionSchema).describe("List of filter conditions to add."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier."),
      new_alias: z.string().optional().describe("Optional new descriptive alias to point to the mutated head, leaving the old alias at the parent checkpoint.")
    }
  },
  async ({ filter_id, operations, session_id, user_id, new_alias }) => {
    try {
      const newFilterId = await filterStore.add(filter_id, operations as any, session_id, user_id, new_alias);
      return { content: [{ type: "text", text: JSON.stringify({ new_filter_id: newFilterId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_get_filter",
  {
    description: "Retrieve rules for a filter",
    inputSchema: {
      filter_id: z.string().describe("The filter ID to retrieve."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ filter_id, session_id, user_id }) => {
    try {
      const filter = await filterStore.getFilter(filter_id, session_id, user_id);
      if (!filter) {
        return { content: [{ type: "text", text: `Filter ID "${filter_id}" not found.` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(filter, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_compress",
  {
    description: "Compress filter rules hierarchy into a flat rule set",
    inputSchema: {
      filter_id: z.string().describe("Filter ID chain to compress."),
      session_id: z.string().describe("The session identifier.")
    }
  },
  async ({ filter_id, session_id }) => {
    try {
      const compressedId = await filterStore.compress(filter_id, session_id);
      return { content: [{ type: "text", text: JSON.stringify({ compressed_filter_id: compressedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_combine",
  {
    description: "Combine multiple filters using set operations",
    inputSchema: {
      operation: z.enum(["union", "intersection", "difference", "symmetric_difference"]).describe("Set operation type."),
      ids: z.array(z.string()).describe("List of filter or view IDs to combine."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ operation, ids, session_id, user_id }) => {
    try {
      const combinedId = await filterStore.combine(operation, ids, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify({ combined_id: combinedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_save_filter",
  {
    description: "Promote and persist a filter to user/global scope",
    inputSchema: {
      filter_id: z.string().describe("Filter ID to persist."),
      tags: z.array(z.string()).describe("Searchable tags."),
      description: z.string().describe("Purpose description."),
      scope: z.enum(["session", "user", "global"]).describe("Ownership level."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ filter_id, tags, description, scope, session_id, user_id }) => {
    try {
      const ownerScope = scope === "global" ? { level: "global" as const } : { level: "user" as const, userId: user_id || "" };
      const savedId = await filterStore.save(
        filter_id,
        tags,
        description,
        ownerScope,
        session_id,
        () => true
      );
      return { content: [{ type: "text", text: JSON.stringify({ saved_id: savedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_parameters",
  {
    description: "Discover what properties and operations a specific tool or table supports filtering on",
    inputSchema: {
      tool_name: z.string().describe("The target tool for filtering."),
      table_name: z.string().optional().describe("Specify a sub-table within the tool.")
    }
  },
  async ({ tool_name, table_name }) => {
    try {
      const params = filterStore.getParameters(tool_name, table_name);
      if (!params) {
        return { content: [{ type: "text", text: `Tool "${tool_name}" not found in registered schemas.` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(params, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_init_modifier",
  {
    description: "Create a modifier (GROUP BY + SELECT projection schema)",
    inputSchema: {
      filter_id: z.string().optional().describe("Optional filter to apply modifier to")
    }
  },
  async ({ filter_id }) => {
    try {
      const modId = filterStore.initModifier(filter_id);
      return { content: [{ type: "text", text: JSON.stringify({ mod_id: modId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_modifier_add",
  {
    description: "Add or refine GROUP BY columns and aggregation functions",
    inputSchema: {
      mod_id: z.string().describe("Reference to existing modifier"),
      columns: z.array(z.string()).describe("Columns to group by"),
      aggregations: z.array(aggregationSchema).describe("Mathematical roll-ups to apply to grouped data")
    }
  },
  async ({ mod_id, columns, aggregations }) => {
    try {
      const newModId = filterStore.modifierAdd(mod_id, columns, aggregations);
      return { content: [{ type: "text", text: JSON.stringify({ new_mod_id: newModId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_init_view",
  {
    description: "Materialize a view: combine filter + modifier + pagination + sorting",
    inputSchema: {
      filter_id: z.string().describe("Which filter data to operate on"),
      mod_id: z.string().optional().describe("How to aggregate/project"),
      having_id: z.string().optional().describe("Which having clause to apply"),
      limit: z.number().optional().describe("Result limit"),
      offset: z.number().optional().describe("Pagination offset")
    }
  },
  async ({ filter_id, mod_id, having_id, limit, offset }) => {
    try {
      const viewId = filterStore.initView(filter_id, mod_id, having_id, limit, offset);
      return { content: [{ type: "text", text: JSON.stringify({ view_id: viewId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_remove_rule",
  {
    description: "Remove specific query conditions by property name and operator, returning a new filter state ID",
    inputSchema: {
      filter_id: z.string().describe("The filter ID to edit."),
      property: z.string().describe("The property matching the target rule."),
      operator: z.string().describe("The operator matching the target rule."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ filter_id, property, operator, session_id, user_id }) => {
    try {
      const newFilterId = await filterStore.removeRule(filter_id, property, operator, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify({ new_filter_id: newFilterId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_diff",
  {
    description: "Compare two filter states in the session to find added/removed rules",
    inputSchema: {
      session_id: z.string().describe("The session identifier."),
      filter_id_a: z.string().describe("The first filter state ID or alias."),
      filter_id_b: z.string().describe("The second filter state ID or alias."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ session_id, filter_id_a, filter_id_b, user_id }) => {
    try {
      const diffResult = await filterStore.diff(filter_id_a, filter_id_b, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify(diffResult, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_alias",
  {
    description: "Tag an existing filter checkpoint with a new descriptive alias",
    inputSchema: {
      session_id: z.string().describe("The session identifier."),
      id_or_alias: z.string().describe("The existing filter ID or alias."),
      alias: z.string().describe("The new alias pointer name to assign.")
    }
  },
  async ({ session_id, id_or_alias, alias }) => {
    try {
      const resolved = await filterStore["resolveId"](id_or_alias, session_id);
      const node = await filterStore.getFilter(resolved, session_id);
      if (!node) {
        throw new Error(`Filter "${id_or_alias}" not found`);
      }
      await filterStore["session"].setAlias(session_id, alias, resolved);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, alias, target_id: resolved }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_gc",
  {
    description: "Prune intermediate filter checkpoints in the current session that are not in the ancestry of the specified active/keep filters or active aliases",
    inputSchema: {
      session_id: z.string().describe("The session identifier."),
      keep: z.array(z.string()).describe("Ancestors of these filter IDs or aliases will be preserved."),
      confirm: z.boolean().optional().describe("Explicit confirmation required if keep array is empty."),
      keep_aliases: z.array(z.string()).optional().describe("Whitelist: only keep these aliases (delete all others)."),
      delete_aliases: z.array(z.string()).optional().describe("Blacklist: explicitly delete these aliases.")
    }
  },
  async ({ session_id, keep, confirm, keep_aliases, delete_aliases }) => {
    try {
      if (keep.length === 0 && !confirm) {
        throw new Error("Pruning the entire session requires confirm: true");
      }
      const result = await filterStore.gc(session_id, keep, keep_aliases, delete_aliases);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
  "filter_about",
  {
    description: "Get meta-documentation explaining how to design and compose stateful filter queries optimal for LLM context windows",
    inputSchema: {}
  },
  async () => {
    try {
      const workspaceRoot = process.cwd();
      const content = await resolveAboutOrExamples(
        config.about_and_examples?.filter_about,
        "config/about/filter.md",
        workspaceRoot
      );
      return { content: [{ type: "text", text: content }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_examples",
  {
    description: "Get worked conversation transcript examples showing ideal multi-turn interaction with the stateful filter service",
    inputSchema: {
      page: z.number().optional().describe("Page number for pagination"),
      limit: z.number().optional().describe("Limit number of examples returned")
    }
  },
  async ({ page, limit }) => {
    try {
      const workspaceRoot = process.cwd();
      let content = await resolveAboutOrExamples(
        config.about_and_examples?.filter_examples,
        "config/examples/filter.md",
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

async function main() {
  const workspaceRoot = process.cwd();
  config = await loadMiddlewareConfig(workspaceRoot);
  validateMiddlewareConfig(config);

  const path = require("path");

  const getUrl = (locator: any) => {
    if (locator?._type === "adapter") return locator.options?.url?.toString();
    return undefined;
  };

  const sessUrl = getUrl(config.filter_session_state);
  const sessionFilterStore =
    config.filter_session_state?._type === "file" && config.filter_session_state.path.endsWith(".jsonl")
      ? new JsonlSessionFilterStore(path.resolve(workspaceRoot, config.filter_session_state.path))
      : sessUrl && sessUrl.startsWith("sqlite://")
      ? new SqliteFilterStore(sessUrl.replace("sqlite://", ""))
      : new MemorySessionFilterStore();

  const globUrl = getUrl(config.filter_persistent_state?.global);
  const persistentFilterStore =
    config.filter_persistent_state?.global?._type === "file" && config.filter_persistent_state.global.path.endsWith(".jsonl")
      ? new JsonlPersistentFilterStore(path.resolve(workspaceRoot, config.filter_persistent_state.global.path))
      : globUrl && globUrl.startsWith("sqlite://")
      ? new SqliteFilterStore(globUrl.replace("sqlite://", ""))
      : new MemoryPersistentFilterStore();

  const toolSchemas = new Map<string, Record<string, TableSchema>>();
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

  const pinnedSchemas = new Map<string, TableSchema>();
  const threshold = config.auto_compression?.filter_chain_threshold ?? 20;
  filterStore = new FilterStore(sessionFilterStore, persistentFilterStore, toolSchemas, pinnedSchemas, threshold);

  paginationLimits = config.pagination_limits;

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Filter MCP Service running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Filter Service:", err);
  process.exit(1);
});
