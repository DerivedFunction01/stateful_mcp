import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DictionaryStore } from "./uploads/sample/dictionary";
import { FilterStore } from "./uploads/sample/filter";
import { loadFilterConfig, loadDictionaryConfig } from "./uploads/sample/config/loader";
import { executeQuery } from "./uploads/sample/examples/memory-engine";

const server = new McpServer({
  name: "filter-dictionary-middleware",
  version: "1.0.0",
});

const dictionaryStore = new DictionaryStore();
const filterStore = new FilterStore();

// Wire up the mock query execution validation engine
filterStore.registerMockExecutor((tableName, mockData, query) => {
  return executeQuery(mockData, query);
});

// Zod schemas for input validation
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

// ─── REGISTER FILTER TOOLS ───────────────────────────────────────────────────

server.registerTool(
  "filter_parameters",
  {
    tool_name: z.string().describe("The target tool for filtering."),
    table_name: z.string().optional().describe("Specify a sub-table within the tool.")
  },
  async ({ tool_name, table_name }) => {
    try {
      const params = filterStore.getParameters(tool_name, table_name);
      if (!params) {
        return {
          content: [{ type: "text", text: `Tool "${tool_name}" not found in registered schemas.` }],
          isError: true
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(params, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_init",
  {
    tool_name: z.string().optional().describe("Optional target tool for schema binding."),
    table_name: z.string().optional().describe("Optional sub-table within the tool.")
  },
  async ({ tool_name, table_name }) => {
    try {
      const filterId = filterStore.init(tool_name, table_name);
      return { content: [{ type: "text", text: JSON.stringify({ filter_id: filterId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_add",
  {
    filter_id: z.string().describe("The current filter state ID."),
    operations: z.array(filterConditionSchema).describe("List of filter conditions to add.")
  },
  async ({ filter_id, operations }) => {
    try {
      const newFilterId = filterStore.add(filter_id, operations as any);
      return { content: [{ type: "text", text: JSON.stringify({ new_filter_id: newFilterId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_get_filter",
  {
    filter_id: z.string().describe("The filter ID to retrieve.")
  },
  async ({ filter_id }) => {
    try {
      const filter = filterStore.getFilter(filter_id);
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
    filter_id: z.string().describe("Filter ID chain to compress.")
  },
  async ({ filter_id }) => {
    try {
      const compressedId = filterStore.compress(filter_id);
      return { content: [{ type: "text", text: JSON.stringify({ compressed_filter_id: compressedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_combine",
  {
    operation: z.enum(["union", "intersection", "difference", "symmetric_difference"]).describe("Set operation type."),
    ids: z.array(z.string()).describe("List of filter or view IDs to combine.")
  },
  async ({ operation, ids }) => {
    try {
      const combinedId = filterStore.combine(operation, ids);
      return { content: [{ type: "text", text: JSON.stringify({ combined_id: combinedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_init_modifier",
  {
    filter_id: z.string().optional().describe("Optional filter ID to link this modifier to.")
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
    mod_id: z.string().describe("The modifier state ID."),
    columns: z.array(z.string()).describe("List of columns to group by."),
    aggregations: z.array(aggregationSchema).describe("List of aggregate rollups.")
  },
  async ({ mod_id, columns, aggregations }) => {
    try {
      const newModId = filterStore.modifierAdd(mod_id, columns, aggregations as any);
      return { content: [{ type: "text", text: JSON.stringify({ new_mod_id: newModId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "filter_init_view",
  {
    filter_id: z.string().describe("Filter ID."),
    mod_id: z.string().optional().describe("Optional aggregation modifier ID."),
    having_id: z.string().optional().describe("Optional having clause ID."),
    limit: z.number().optional().describe("Max rows to return."),
    offset: z.number().optional().describe("Pagination offset.")
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
  "filter_save_filter",
  {
    id: z.string().describe("Filter ID or View ID to persist."),
    tags: z.array(z.string()).describe("Searchable tags."),
    description: z.string().describe("Purpose description.")
  },
  async ({ id, tags, description }) => {
    try {
      const savedId = filterStore.saveFilter(id, tags, description);
      return { content: [{ type: "text", text: JSON.stringify({ saved_id: savedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

// ─── REGISTER DICTIONARY TOOLS ────────────────────────────────────────────────

server.registerTool(
  "dictionary_add",
  {
    term: z.string().describe("The user shortcut or alias."),
    canonical_concept: z.string().describe("Canonical value/code or display standard to map to."),
    tags: z.array(z.string()).optional().describe("Optional tags classifying the entry."),
    description: z.string().optional().describe("Reason/context for registration."),
    workspace_id: z.string().optional().describe("Optional workspace isolation context.")
  },
  async ({ term, canonical_concept, tags, description, workspace_id }) => {
    try {
      // Resolve or dynamically register concept standard under 'CUSTOM' if not explicitly defined
      let conceptId = `concept_dyn_${crypto.randomUUID().slice(0, 8)}`;
      dictionaryStore.addConcept({
        id: conceptId,
        namespaceCode: "CUSTOM",
        standardCode: canonical_concept,
        display: canonical_concept,
      });

      const entryId = dictionaryStore.addExpression({
        term,
        regexPattern: term,
        isCaseInsensitive: true,
        targetAssignment: "MAIN_TERM",
        conceptId,
        priorityWeight: 1,
        active: true,
        context: {
          tags: tags || [],
          workspace_id: workspace_id || "global",
          description
        }
      });

      return { content: [{ type: "text", text: JSON.stringify({ dict_entry_id: entryId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "dictionary_find",
  {
    query: z.string().optional().describe("Search term or pattern query."),
    tags: z.array(z.string()).optional().describe("Filter results by tags."),
    concept_type: z.string().optional().describe("Namespace code filter."),
    workspace_id: z.string().optional().describe("Target workspace partition.")
  },
  async ({ query, tags, concept_type, workspace_id }) => {
    try {
      const results = dictionaryStore.find(
        { term: query, tags, conceptType: concept_type },
        { workspace_id: workspace_id || "global" }
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "dictionary_resolve",
  {
    term: z.string().describe("Shorthand or alias to resolve."),
    workspace_id: z.string().optional().describe("Optional workspace identifier.")
  },
  async ({ term, workspace_id }) => {
    try {
      const res = dictionaryStore.resolve(term, { workspace_id: workspace_id || "global" });
      return { content: [{ type: "text", text: JSON.stringify({ resolved: res }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "dictionary_remove",
  {
    dict_entry_id: z.string().describe("ID of the expression entry to delete.")
  },
  async ({ dict_entry_id }) => {
    try {
      const removed = dictionaryStore.removeExpression(dict_entry_id);
      return { content: [{ type: "text", text: JSON.stringify({ removed }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

// ─── STARTUP CONFIG LOAD & INITIALIZATION ────────────────────────────────────

async function main() {
  const workspaceRoot = process.cwd();
  
  // Load configurations
  const filterConfig = await loadFilterConfig(workspaceRoot);
  const dictionaryConfig = await loadDictionaryConfig(workspaceRoot);

  // Initialize store states
  dictionaryStore.loadConfig(dictionaryConfig);
  if (filterConfig.tools) {
    for (const tool of filterConfig.tools) {
      filterStore.registerToolSchema(tool);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Filter & Dictionary Middleware MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});