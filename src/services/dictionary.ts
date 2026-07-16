import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveSource } from "../config/loader";
import { validateMiddlewareConfig } from "../config/validator";
import { DictionaryStore } from "../middleware/dictionary/store";
import { InMemoryConceptResolver } from "../middleware/dictionary/resolver";

const server = new McpServer({
  name: "dictionary-service",
  version: "1.0.0",
});

let dictionaryStore: DictionaryStore;

server.registerTool(
  "dictionary_add",
  {
    description: "Add a shortcut mapping to canonical concept displays",
    inputSchema: {
      term: z.string().describe("The alias shortcut."),
      canonical_concept: z.string().describe("Canonical value/code or display name standard to map to."),
      tags: z.array(z.string()).optional().describe("Tags classifying the entry."),
      description: z.string().optional().describe("Reason/context for registration."),
      workspace_id: z.string().optional().describe("Optional workspace isolation context.")
    }
  },
  async ({ term, canonical_concept, tags, description, workspace_id }) => {
    try {
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
  "dictionary_resolve",
  {
    description: "Match and resolve shorthand terms to canonical concepts",
    inputSchema: {
      term: z.string().describe("Shorthand or alias to resolve."),
      workspace_id: z.string().optional().describe("Optional workspace identifier.")
    }
  },
  async ({ term, workspace_id }) => {
    try {
      const res = await dictionaryStore.resolve(term, { workspace_id: workspace_id || "global" });
      return { content: [{ type: "text", text: JSON.stringify({ resolved: res }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "dictionary_find",
  {
    description: "Search expression mappings by term, tags, concept type, or workspace",
    inputSchema: {
      query: z.string().optional().describe("Search term query."),
      tags: z.array(z.string()).optional().describe("Filter by tags."),
      concept_type: z.string().optional().describe("Namespace code filter."),
      workspace_id: z.string().optional().describe("Target workspace partition.")
    }
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
  "dictionary_remove",
  {
    description: "Remove an expression entry by ID",
    inputSchema: {
      dict_entry_id: z.string().describe("ID of the expression entry to delete.")
    }
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

async function main() {
  const workspaceRoot = process.cwd();
  const config = await loadMiddlewareConfig(workspaceRoot);
  validateMiddlewareConfig(config);

  const dictResolver = new InMemoryConceptResolver();
  dictionaryStore = new DictionaryStore(dictResolver);

  if (config.dictionary_state) {
    try {
      const dictionaryConfig = await resolveSource(config.dictionary_state, workspaceRoot) as any;
      if (dictionaryConfig) {
        dictionaryStore.loadConfig(dictionaryConfig);
      }
    } catch (_) {}
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Dictionary MCP Service running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Dictionary Service:", err);
  process.exit(1);
});
