import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveSource, resolveAboutOrExamples, resolveConfigDir } from "../config/loader";
import { validateMiddlewareConfig } from "../config/validator";
import { MemorySessionObjectStore, MemoryPersistentObjectStore } from "../adapters/storage/memory-repo";
import { JsonlSessionObjectStore, JsonlPersistentObjectStore } from "../adapters/storage/jsonl-repo";
import { ObjectStore } from "../middleware/object/store";
import type { MiddlewareConfig, PaginationLimitsConfig } from "../config/types";
import { clampLimit, buildLimitField } from "../config/pagination";
import { getFilterStore, getFormStore } from "./helper";
import * as path from "path";

const server = new McpServer({
  name: "object-service",
  version: "1.0.0",
});

let objectStore: ObjectStore;
let config: MiddlewareConfig;
let configDir: string = process.cwd();

function registerObjectTools(paginationLimits: PaginationLimitsConfig | undefined) {
  const pathSegmentSchema = z.union([z.string(), z.number()]);

  server.registerTool(
    "object_init",
  {
    description: "Initialize an empty object against a schema",
    inputSchema: {
      schema_name: z.string().describe("The name of the registered schema."),
      session_id: z.string().describe("The session identifier."),
      alias: z.string().optional().describe("Optional descriptive alias to tag the initial state."),
      data: z.record(z.string(), z.any()).optional().describe("Optional initial key-value data to populate.")
    }
  },
  async ({ schema_name, session_id, alias, data }) => {
    try {
      const objectId = await objectStore.init(schema_name, session_id, alias, data);
      return { content: [{ type: "text", text: JSON.stringify({ object_id: objectId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_set",
  {
    description: "Set one property at a specific path in an object",
    inputSchema: {
      object_id: z.string().describe("The target object version ID or alias."),
      path: z.array(pathSegmentSchema).describe("Field path (e.g. ['date_range', 'start_date'])."),
      value: z.any().describe("The field value to set."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier."),
      new_alias: z.string().optional().describe("Optional new descriptive alias to point to the mutated head, leaving the old alias at the parent checkpoint.")
    }
  },
  async ({ object_id, path: fieldPath, value, session_id, user_id, new_alias }) => {
    try {
      const newObjectId = await objectStore.set(object_id, fieldPath, value, session_id, user_id, new_alias);
      return { content: [{ type: "text", text: JSON.stringify({ new_object_id: newObjectId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_patch",
  {
    description: "Apply a sparse properties delta overlay",
    inputSchema: {
      object_id: z.string().describe("The target object version ID."),
      partial: z.record(z.string(), z.any()).describe("Sparse properties delta overlay."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, partial, session_id, user_id }) => {
    try {
      const newObjectId = await objectStore.patch(object_id, partial, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify({ new_object_id: newObjectId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_ref",
  {
    description: "Establish a lazy cross-field reference mapping",
    inputSchema: {
      object_id: z.string().describe("The referencing object ID."),
      path: z.array(pathSegmentSchema).describe("The path where reference will reside."),
      source_object_id: z.string().describe("The referenced source object ID."),
      source_path: z.array(pathSegmentSchema).describe("The path in the source object to reference."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, path: fieldPath, source_object_id, source_path, session_id, user_id }) => {
    try {
      const newObjectId = await objectStore.ref(object_id, fieldPath, source_object_id, source_path, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify({ new_object_id: newObjectId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_validate",
  {
    description: "Perform recursively completeness and cross-field constraint validations",
    inputSchema: {
      object_id: z.string().describe("The target object ID to validate."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, session_id, user_id }) => {
    try {
      const result = await objectStore.validate(object_id, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_resolve",
  {
    description: "Materialize final object payload, verifying validation holds",
    inputSchema: {
      object_id: z.string().describe("The object ID to resolve."),
      mode: z.enum(["tool_call", "function"]).describe("Target payload format."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, mode, session_id, user_id }) => {
    try {
      const payload = await objectStore.resolve(object_id, mode, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_array_append",
  {
    description: "Append a new empty item to an array field",
    inputSchema: {
      object_id: z.string().describe("The object ID."),
      path: z.array(pathSegmentSchema).describe("Field path to the array."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, path: fieldPath, session_id, user_id }) => {
    try {
      const newObjectId = await objectStore.array_append(object_id, fieldPath, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify({ new_object_id: newObjectId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_array_remove",
  {
    description: "Remove an item from an array field at an index",
    inputSchema: {
      object_id: z.string().describe("The object ID."),
      path: z.array(pathSegmentSchema).describe("Field path to the array."),
      index: z.number().describe("The item index to remove."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, path: fieldPath, index, session_id, user_id }) => {
    try {
      const newObjectId = await objectStore.array_remove(object_id, fieldPath, index, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify({ new_object_id: newObjectId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_compress",
  {
    description: "Collapse version chain into a standalone snapshot",
    inputSchema: {
      object_id: z.string().describe("The object ID to compress."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, session_id, user_id }) => {
    try {
      const compressedId = await objectStore.compress(object_id, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify({ compressed_object_id: compressedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_save",
  {
    description: "Promote and persist an object to user/global scope",
    inputSchema: {
      object_id: z.string().describe("The object ID to persist."),
      tags: z.array(z.string()).describe("Searchable tags."),
      description: z.string().describe("Purpose description."),
      scope: z.enum(["session", "user", "global"]).describe("Ownership level."),
      session_id: z.string().describe("The session identifier.")
    }
  },
  async ({ object_id, tags, description, scope, session_id }) => {
    try {
      const ownerScope = scope === "global" ? { level: "global" as const } : { level: "user" as const, userId: "" };
      const savedId = await objectStore.save(object_id, tags, description, ownerScope, session_id);
      return { content: [{ type: "text", text: JSON.stringify({ saved_id: savedId }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_inspect",
  {
    description: "Get full inspection status of an object",
    inputSchema: {
      object_id: z.string().describe("The object ID to inspect."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, session_id, user_id }) => {
    try {
      const inspect = await objectStore.inspect(object_id, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify(inspect, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_diff",
  {
    description: "Check differences between two object versions",
    inputSchema: {
      object_id_a: z.string().describe("Source object ID."),
      object_id_b: z.string().describe("Target object ID."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id_a, object_id_b, session_id, user_id }) => {
    try {
      const diff = await objectStore.diff(object_id_a, object_id_b, session_id, user_id);
      return { content: [{ type: "text", text: JSON.stringify(diff, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_alias",
  {
    description: "Tag an existing object checkpoint with a new descriptive alias",
    inputSchema: {
      session_id: z.string().describe("The session identifier."),
      id_or_alias: z.string().describe("The existing object ID or alias."),
      alias: z.string().describe("The new alias pointer name to assign.")
    }
  },
  async ({ session_id, id_or_alias, alias }) => {
    try {
      const resolved = await objectStore["resolveId"](id_or_alias, session_id);
      const node = await objectStore.getObject(resolved, session_id);
      if (!node) {
        throw new Error(`Object "${id_or_alias}" not found`);
      }
      await objectStore["session"].setAlias(session_id, alias, resolved);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, alias, target_id: resolved }) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_gc",
  {
    description: "Prune intermediate object checkpoints in the current session that are not in the ancestry of the specified active/keep objects or active aliases",
    inputSchema: {
      session_id: z.string().describe("The session identifier."),
      keep: z.array(z.string()).describe("Ancestors of these object IDs or aliases will be preserved."),
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
      const result = await objectStore.gc(session_id, keep, keep_aliases, delete_aliases);
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
      const workspaceRoot = configDir;
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
  "object_about",
  {
    description: "Get meta-documentation explaining how to validate and compose stateful objects optimal for LLM context windows",
    inputSchema: {}
  },
  async () => {
    try {
      const workspaceRoot = configDir;
      const content = await resolveAboutOrExamples(
        config.about_and_examples?.object_about,
        "config/about/object.md",
        workspaceRoot
      );
      return { content: [{ type: "text", text: content }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
    }
  }
);

server.registerTool(
  "object_examples",
  {
    description: "Get worked conversation transcript examples showing ideal multi-turn interaction with the stateful object service",
    inputSchema: {
      page: z.number().optional().describe("Page number for pagination"),
      limit: buildLimitField("examples_page_size", paginationLimits)
    }
  },
  async ({ page, limit }) => {
    try {
      const workspaceRoot = configDir;
      let content = await resolveAboutOrExamples(
        config.about_and_examples?.object_examples,
        "config/examples/object.md",
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

  const sessionObjectStore =
    config.object_session_state?._type === "file" && config.object_session_state.path.endsWith(".jsonl")
      ? new JsonlSessionObjectStore(path.resolve(workspaceRoot, config.object_session_state.path))
      : new MemorySessionObjectStore();

  const persistentObjectStore =
    config.object_persistent_state?.global?._type === "file" && config.object_persistent_state.global.path.endsWith(".jsonl")
      ? new JsonlPersistentObjectStore(path.resolve(workspaceRoot, config.object_persistent_state.global.path))
      : new MemoryPersistentObjectStore();

  const objectSchemas = new Map<string, any>();
  const validationEngines = new Map<string, import("../config/types").ResourceLocator>();
  if (config.object_schemas) {
    for (const [schemaName, entry] of Object.entries(config.object_schemas)) {
      try {
        // Support both plain ResourceLocator and { schema, validation_engine } form
        const locator = (entry as any).schema ?? entry;
        const schemaData = await resolveSource(locator, workspaceRoot);
        objectSchemas.set(schemaName, schemaData);
        if ((entry as any).validation_engine) {
          validationEngines.set(schemaName, (entry as any).validation_engine);
        }
      } catch (_) {}
    }
  }

  const limits = config.object_schema_limits;
  const threshold = config.auto_compression?.object_chain_threshold ?? 15;
  objectStore = new ObjectStore(
    sessionObjectStore,
    persistentObjectStore,
    objectSchemas,
    limits?.max_fields_per_def ?? 7,
    limits?.max_ref_depth ?? 5,
    threshold,
    validationEngines,
    workspaceRoot
  );

  const filterStore = getFilterStore(config, workspaceRoot);
  const formStore = getFormStore(config, workspaceRoot);
  objectStore.setReferences({ filter: filterStore, form: formStore });

  registerObjectTools(config.pagination_limits);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Object MCP Service running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Object Service:", err);
  process.exit(1);
});
