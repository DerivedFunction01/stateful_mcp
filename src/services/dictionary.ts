import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveSource, resolveAboutOrExamples } from "../config/loader";
import { validateMiddlewareConfig } from "../config/validator";
import { DictionaryStore } from "../middleware/dictionary/store";
import { InMemoryConceptResolver } from "../middleware/dictionary/resolver";
import type { MiddlewareConfig } from "../config/types";

const server = new McpServer({
  name: "dictionary-service",
  version: "1.0.0",
});

let dictionaryStore: DictionaryStore;
let config: MiddlewareConfig;

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
    description: z.string().optional().describe("Context/reason for the entry mapping."),
    user_id: z.string().optional().describe("User ID of the caller."),
    is_admin: z.boolean().optional().describe("Whether the caller has administrative privileges.")
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
        const { term, concept_ref, target_assignment, regex_pattern, priority_weight, is_case_insensitive, tags, description, workspace_id, user_id, is_admin } = args;
        const conceptId = store.resolveConceptId(concept_ref);
        if (!conceptId) throw new Error(`Concept reference "${concept_ref}" not found.`);

        const ws = workspace_id || store.getDefaultWorkspace();
        const callerContext = { user_id, workspace_id: ws, is_admin };
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
            user_id,
            description
          }
        }, callerContext);

        return { content: [{ type: "text" as const, text: JSON.stringify({ dict_entry_id: entryId }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  const editExpressionSchema: any = {
    dict_entry_id: z.string().describe("ID of the expression entry to edit."),
    term: z.string().optional().describe("New shorthand alias or keyword."),
    concept_ref: z.string().optional().describe("New target Concept reference (UUID or 'NAMESPACE::CODE' coordinate)."),
    target_assignment: z.string().optional().describe("New target assignment classification."),
    regex_pattern: z.string().optional().describe("New custom regex pattern override."),
    priority_weight: z.number().optional().describe("New base match ranking weight."),
    is_case_insensitive: z.boolean().optional().describe("New case insensitivity setting."),
    tags: tagsSchema,
    description: z.string().optional().describe("New context/reason for the entry mapping."),
    user_id: z.string().optional().describe("User ID of the caller."),
    is_admin: z.boolean().optional().describe("Whether the caller has administrative privileges.")
  };

  if (workspaceSchema) {
    editExpressionSchema.workspace_id = workspaceSchema;
  }

  server.registerTool(
    "dictionary_edit_expression",
    {
      description: "Edit properties of an expression entry.",
      inputSchema: editExpressionSchema
    },
    async (args: any) => {
      try {
        const { dict_entry_id, term, concept_ref, target_assignment, regex_pattern, priority_weight, is_case_insensitive, tags, description, workspace_id, user_id, is_admin } = args;
        const updates: any = {};
        if (term !== undefined) updates.term = term;
        if (regex_pattern !== undefined) updates.regexPattern = regex_pattern;
        if (is_case_insensitive !== undefined) updates.isCaseInsensitive = is_case_insensitive;
        if (target_assignment !== undefined) updates.targetAssignment = target_assignment;
        if (priority_weight !== undefined) updates.priorityWeight = priority_weight;

        if (concept_ref !== undefined) {
          const conceptId = store.resolveConceptId(concept_ref);
          if (!conceptId) throw new Error(`Concept reference "${concept_ref}" not found.`);
          updates.conceptId = conceptId;
        }

        const ws = workspace_id || store.getDefaultWorkspace();
        if (tags !== undefined || ws !== undefined || description !== undefined || user_id !== undefined) {
          updates.context = {
            tags: tags || [],
            workspace_id: ws,
            user_id,
            description
          };
        }

        const callerContext = { user_id, workspace_id: ws, is_admin };
        store.editExpression(dict_entry_id, updates, callerContext);

        return { content: [{ type: "text" as const, text: JSON.stringify({ dict_entry_id, success: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "dictionary_edit_concept",
    {
      description: "Edit properties of an existing concept (display or description).",
      inputSchema: {
        concept_ref: z.string().describe("Concept reference (UUID or 'NAMESPACE::CODE' coordinate)."),
        display: z.string().optional().describe("New display name for the concept."),
        description: z.string().optional().describe("New description for the concept.")
      }
    },
    async ({ concept_ref, display, description }) => {
      try {
        const conceptId = store.resolveConceptId(concept_ref);
        if (!conceptId) throw new Error(`Concept reference "${concept_ref}" not found.`);
        store.editConcept(conceptId, { display, description });
        return { content: [{ type: "text" as const, text: JSON.stringify({ concept_id: conceptId, success: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "dictionary_remove_concept",
    {
      description: "Deactivate a concept (soft-delete).",
      inputSchema: {
        concept_ref: z.string().describe("Concept reference (UUID or 'NAMESPACE::CODE' coordinate) to deactivate.")
      }
    },
    async ({ concept_ref }) => {
      try {
        const conceptId = store.resolveConceptId(concept_ref);
        if (!conceptId) throw new Error(`Concept reference "${concept_ref}" not found.`);
        store.removeConcept(conceptId);
        return { content: [{ type: "text" as const, text: JSON.stringify({ concept_id: conceptId, deactivated: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "dictionary_remove_relation",
    {
      description: "Deactivate a semantic relationship link (soft-delete).",
      inputSchema: {
        relation_id: z.string().describe("ID of the relation to deactivate.")
      }
    },
    async ({ relation_id }) => {
      try {
        store.removeRelation(relation_id);
        return { content: [{ type: "text" as const, text: JSON.stringify({ relation_id, deactivated: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  const resolveSchema: any = {
    term: z.string().describe("Shorthand or alias to resolve."),
    user_id: z.string().optional().describe("User ID of the resolver caller.")
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
        const { term, workspace_id, user_id } = args;
        const ws = workspace_id || store.getDefaultWorkspace();
        const res = await store.resolve(term, { workspace_id: ws, user_id });
        return { content: [{ type: "text" as const, text: JSON.stringify({ resolved: res }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
      }
    }
  );

  const findSchema: any = {
    query: z.string().optional().describe("Search term query."),
    tags: tagsSchema,
    concept_type: z.string().optional().describe("Namespace code filter."),
    user_id: z.string().optional().describe("User ID context for matching.")
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
        const { query, tags, concept_type, workspace_id, user_id } = args;
        const ws = workspace_id || store.getDefaultWorkspace();
        const results = store.find(
          { term: query, tags: tags as string[], conceptType: concept_type },
          { workspace_id: ws, user_id }
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
      description: "Remove an expression entry by ID (soft-delete if resolved metrics exist, else hard-delete).",
      inputSchema: {
        dict_entry_id: z.string().describe("ID of the expression entry to delete."),
        user_id: z.string().optional().describe("User ID of the caller."),
        workspace_id: z.string().optional().describe("Workspace ID of the caller."),
        is_admin: z.boolean().optional().describe("Whether the caller has administrative privileges.")
      }
    },
    async ({ dict_entry_id, user_id, workspace_id, is_admin }) => {
      try {
        const ws = workspace_id || store.getDefaultWorkspace();
        const callerContext = { user_id, workspace_id: ws, is_admin };
        const removed = store.removeExpression(dict_entry_id, callerContext);
        return { content: [{ type: "text" as const, text: JSON.stringify({ removed }) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: err.message || String(err) }], isError: true };
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
    "dictionary_about",
    {
      description: "Get meta-documentation explaining how to resolve and utilize terminology optimal for LLM context windows",
      inputSchema: {}
    },
    async () => {
      try {
        const workspaceRoot = process.cwd();
        const content = await resolveAboutOrExamples(
          config.about_and_examples?.dictionary_about,
          "config/about/dictionary.md",
          workspaceRoot
        );
        return { content: [{ type: "text", text: content }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "dictionary_examples",
    {
      description: "Get worked conversation transcript examples showing ideal multi-turn interaction with the dictionary service",
      inputSchema: {
        page: z.number().optional().describe("Page number for pagination"),
        limit: z.number().optional().describe("Limit number of examples returned")
      }
    },
    async ({ page, limit }) => {
      try {
        const workspaceRoot = process.cwd();
        let content = await resolveAboutOrExamples(
          config.about_and_examples?.dictionary_examples,
          "config/examples/dictionary.md",
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
}

async function main() {
  const workspaceRoot = process.cwd();
  config = await loadMiddlewareConfig(workspaceRoot);
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
