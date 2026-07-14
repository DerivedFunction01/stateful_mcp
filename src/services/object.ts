import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveSource } from "../config/loader";
import { validateMiddlewareConfig } from "../config/validator";
import { MemorySessionObjectStore, MemoryPersistentObjectStore } from "../adapters/storage/memory-repo";
import { ObjectStore } from "../middleware/object/store";

const server = new McpServer({
  name: "object-service",
  version: "1.0.0",
});

let objectStore: ObjectStore;

const pathSegmentSchema = z.union([z.string(), z.number()]);

server.registerTool(
  "object_init",
  {
    description: "Initialize an empty object against a schema",
    inputSchema: {
      schema_name: z.string().describe("The name of the registered schema."),
      session_id: z.string().describe("The session identifier.")
    }
  },
  async ({ schema_name, session_id }) => {
    try {
      const objectId = await objectStore.init(schema_name, session_id);
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
      object_id: z.string().describe("The target object version ID."),
      path: z.array(pathSegmentSchema).describe("Field path (e.g. ['date_range', 'start_date'])."),
      value: z.any().describe("The field value to set."),
      session_id: z.string().describe("The session identifier."),
      user_id: z.string().optional().describe("Optional user identifier.")
    }
  },
  async ({ object_id, path: fieldPath, value, session_id, user_id }) => {
    try {
      const newObjectId = await objectStore.set(object_id, fieldPath, value, session_id, user_id);
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

async function main() {
  const workspaceRoot = process.cwd();
  const config = await loadMiddlewareConfig(workspaceRoot);
  validateMiddlewareConfig(config);

  const sessionObjectStore = new MemorySessionObjectStore();
  const persistentObjectStore = new MemoryPersistentObjectStore();

  const objectSchemas = new Map<string, any>();
  if (config.object_schemas) {
    for (const [schemaName, locator] of Object.entries(config.object_schemas)) {
      try {
        const schemaData = await resolveSource(locator, workspaceRoot);
        objectSchemas.set(schemaName, schemaData);
      } catch (_) {}
    }
  }

  const limits = config.object_schema_limits;
  objectStore = new ObjectStore(
    sessionObjectStore,
    persistentObjectStore,
    objectSchemas,
    limits?.max_fields_per_def ?? 7,
    limits?.max_ref_depth ?? 5
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Object MCP Service running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Object Service:", err);
  process.exit(1);
});
