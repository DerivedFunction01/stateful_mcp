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

function registerAllTools(store: DictionaryStore) {
  const workspaces = store.getWorkspaces().map((w) => w.id);
  const allowedTags = store.getAllowedTags();
  const exposeTags = store.shouldExposeTagsAsEnum();
  const exposeWorkspace = store.shouldExposeWorkspaceAsEnum();
  const defaultNamespace = store.getDefaultDynamicNamespace();

  const workspaceSchema = (exposeWorkspace && workspaces.length > 0)
    ? z.enum(workspaces as [string, ...string[]]).optional().describe("The target workspace isolation context.")
    : undefined;

  const tagEnumSchema = (exposeTags && allowedTags.length > 0)
    ? z.enum(allowedTags as [string, ...string[]])
    : z.string();

  const tagsSchema = z.array(tagEnumSchema).optional().describe("Tags classifying the entry.");

  server.registerTool(
    "dictionary_add_concept",
    {
      description: `Add a canonical concept. Default dynamic namespace is "${defaultNamespace}".`,
      inputSchema: {
        standard_code: z.string().describe("The standard coordinate code."),
        display: z.string().describe("Human-readable concept display name."),
        namespace_code: z.string().optional().describe("Target namespace code. Defaults to config dynamic default."),
        description: z.string().optional().describe("Description of the concept.")
      }
    },
    async ({ standard_code, display, namespace_code, description }) => {
      try {
        const ns = namespace_code || defaultNamespace;
        const conceptId = store.addConcept({
          namespaceCode: ns,
          standardCode: standard_code,
          display,
          description
        });
        return { content: [{ type: "text" as const, text: JSON.stringify({ concept_id: conceptId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "dictionary_add_relation",
    {
      description: "Create a semantic relationship link between two concepts.",
      inputSchema: {
        source_concept_ref: z.string().describe("Source concept reference (UUID or 'NAMESPACE::CODE' coordinate)."),
        target_concept_ref: z.string().describe("Target concept reference (UUID or 'NAMESPACE::CODE' coordinate)."),
        relationship_type: z.enum(["EQUIVALENT", "NARROWER_THAN", "WIDER_THAN"]).describe("Relationship classification.")
      }
    },
    async ({ source_concept_ref, target_concept_ref, relationship_type }) => {
      try {
        const sourceId = store.resolveConceptId(source_concept_ref);
        if (!sourceId) throw new Error(`Source concept reference "${source_concept_ref}" not found.`);
        const targetId = store.resolveConceptId(target_concept_ref);
        if (!targetId) throw new Error(`Target concept reference "${target_concept_ref}" not found.`);

        const relationId = `rel_${crypto.randomUUID().slice(0, 8)}`;
        store.addRelation({
          id: relationId,
          conceptId: sourceId,
          linkedId: targetId,
          relationshipType: relationship_type,
          active: true
        });
        return { content: [{ type: "text" as const, text: JSON.stringify({ relation_id: relationId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  const addExpressionSchema: any = {
    term: z.string().describe("The shorthand alias or keyword."),
    concept_ref: z.string().describe("The target Concept reference (UUID or 'NAMESPACE::CODE' coordinate)."),
    target_assignment: z.string().optional().default("MAIN_TERM").describe("The role/assignment classification."),
    regex_pattern: z.string().optional().describe("Custom regex pattern override. Defaults to exact term match."),
    priority_weight: z.number().optional().default(1).describe("Base match ranking weight."),
    is_case_insensitive: z.boolean().optional().default(true).describe("Whether matching is case-insensitive."),
    tags: tagsSchema,
    description: z.string().optional().describe("Context/reason for the entry mapping.")
  };

  if (workspaceSchema) {
    addExpressionSchema.workspace_id = workspaceSchema;
  }

  server.registerTool(
    "dictionary_add_expression",
    {
      description: "Register a custom shorthand expression mapping to a concept.",
      inputSchema: addExpressionSchema
    },
    async (args: any) => {
      try {
        const { term, concept_ref, target_assignment, regex_pattern, priority_weight, is_case_insensitive, tags, description, workspace_id } = args;
        const conceptId = store.resolveConceptId(concept_ref);
        if (!conceptId) throw new Error(`Concept reference "${concept_ref}" not found.`);

        const ws = workspace_id || store.getDefaultWorkspace();
        const entryId = store.addExpression({
          term,
          regexPattern: regex_pattern || term,
          isCaseInsensitive: is_case_insensitive !== false,
          targetAssignment: target_assignment || "MAIN_TERM",
          conceptId,
          priorityWeight: priority_weight || 1,
          active: true,
          context: {
            tags: tags || [],
            workspace_id: ws,
            description
          }
        });

        return { content: [{ type: "text" as const, text: JSON.stringify({ dict_entry_id: entryId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  const resolveSchema: any = {
    term: z.string().describe("Shorthand or alias to resolve.")
  };
  if (workspaceSchema) {
    resolveSchema.workspace_id = workspaceSchema;
  }

  server.registerTool(
    "dictionary_resolve",
    {
      description: "Match and resolve shorthand terms to canonical concepts",
      inputSchema: resolveSchema
    },
    async (args: any) => {
      try {
        const { term, workspace_id } = args;
        const ws = workspace_id || store.getDefaultWorkspace();
        const res = await store.resolve(term, { workspace_id: ws });
        return { content: [{ type: "text" as const, text: JSON.stringify({ resolved: res }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  const findSchema: any = {
    query: z.string().optional().describe("Search term query."),
    tags: tagsSchema,
    concept_type: z.string().optional().describe("Namespace code filter.")
  };
  if (workspaceSchema) {
    findSchema.workspace_id = workspaceSchema;
  }

  server.registerTool(
    "dictionary_find",
    {
      description: "Search expression mappings by term, tags, concept type, or workspace",
      inputSchema: findSchema
    },
    async (args: any) => {
      try {
        const { query, tags, concept_type, workspace_id } = args;
        const ws = workspace_id || store.getDefaultWorkspace();
        const results = store.find(
          { term: query, tags: tags as string[], conceptType: concept_type },
          { workspace_id: ws }
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
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
        const removed = store.removeExpression(dict_entry_id);
        return { content: [{ type: "text" as const, text: JSON.stringify({ removed }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );
}

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

  registerAllTools(dictionaryStore);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Dictionary MCP Service running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Dictionary Service:", err);
  process.exit(1);
});
