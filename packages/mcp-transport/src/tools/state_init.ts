import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  FilterStore,
  ObjectStore,
  FormStore,
  EventStore,
  MiddlewareConfig
} from "@stateful-mcp/core";

export function registerStateInitTool(
  server: McpServer,
  config: MiddlewareConfig,
  stores: {
    filter?: FilterStore;
    object?: ObjectStore;
    form?: FormStore;
    event?: EventStore;
  }
) {
  server.registerTool(
    "state_init",
    {
      description: "Initialize all required state dependencies (filters, objects, forms, event logs) configured for a given tool/workspace in a single call.",
      inputSchema: {
        tool_name: z.string().describe("The name of the tool/workspace to initialize state requirements for."),
        suffix: z.string().optional().describe("Optional suffix to append to default aliases (e.g. '1', '2', 'electronics') for parallel instances. If omitted and default aliases already exist, next available numeric suffix (_2, _3, etc.) will be automatically assigned.")
      }
    },
    async ({ tool_name, suffix }, extra: any) => {
      try {
        const session_id = extra?._metadata?.session_id ?? "default";
        const user_id = extra?._metadata?.user_id;
        const toolConfig = config.tools?.[tool_name];
        if (!toolConfig) {
          throw new Error(`Tool "${tool_name}" not found in configuration.`);
        }

        const requirements = toolConfig.state_requirements || [];
        const results: {
          filters: Record<string, string>;
          objects: Record<string, string>;
          forms: Record<string, string>;
          events: Record<string, string>;
        } = {
          filters: {},
          objects: {},
          forms: {},
          events: {}
        };

        for (const req of requirements) {
          let finalAlias: string | undefined = req.alias;

          if (finalAlias) {
            if (suffix) {
              finalAlias = `${req.alias}_${suffix}`;
            } else {
              // Auto-increment suffix lookup if alias conflicts
              let counter = 1;
              let taken = true;
              while (taken) {
                const testAlias = counter === 1 ? req.alias : `${req.alias}_${counter}`;
                let exists = false;

                if (req.type === "filter" && stores.filter) {
                  const node = await stores.filter.getFilter(testAlias, session_id, user_id);
                  exists = node !== null;
                } else if (req.type === "object" && stores.object) {
                  const node = await stores.object.getObject(testAlias, session_id, user_id);
                  exists = node !== null;
                } else if (req.type === "form" && stores.form) {
                  const node = await stores.form.getForm(testAlias, session_id);
                  exists = node !== null;
                } else if (req.type === "event" && stores.event) {
                  const node = await stores.event.getCommit(testAlias, session_id);
                  exists = node !== null;
                }

                if (!exists) {
                  finalAlias = testAlias;
                  taken = false;
                } else {
                  counter++;
                }
              }
            }
          }

          // Check if it already exists (idempotency check)
          let existingId: string | null = null;
          if (finalAlias) {
            if (req.type === "filter" && stores.filter) {
              const node = await stores.filter.getFilter(finalAlias, session_id, user_id);
              if (node) existingId = node.filterId;
            } else if (req.type === "object" && stores.object) {
              const node = await stores.object.getObject(finalAlias, session_id, user_id);
              if (node) existingId = node.objectId;
            } else if (req.type === "form" && stores.form) {
              const node = await stores.form.getForm(finalAlias, session_id);
              if (node) existingId = node.formId;
            } else if (req.type === "event" && stores.event) {
              const node = await stores.event.getCommit(finalAlias, session_id);
              if (node) existingId = node.commitId;
            }
          }

          if (existingId) {
            // Already initialized, reuse it
            const targetKey = finalAlias || existingId;
            if (req.type === "filter") results.filters[req.id] = targetKey;
            else if (req.type === "object") results.objects[req.id] = targetKey;
            else if (req.type === "form") results.forms[req.id] = targetKey;
            else if (req.type === "event") results.events[req.id] = targetKey;
            continue;
          }

          // Initialize new state
          if (req.type === "filter") {
            if (!stores.filter) throw new Error("FilterStore is not available on this server.");
            const targetId = await stores.filter.init(session_id, req.toolName, req.tableName, user_id, finalAlias);
            results.filters[req.id] = finalAlias || targetId;
          } else if (req.type === "object") {
            if (!stores.object) throw new Error("ObjectStore is not available on this server.");
            const targetId = await stores.object.init(req.schema || "", session_id, finalAlias);
            results.objects[req.id] = finalAlias || targetId;
          } else if (req.type === "form") {
            if (!stores.form) throw new Error("FormStore is not available on this server.");
            const targetId = await stores.form.init(req.schema || "", session_id, finalAlias);
            results.forms[req.id] = finalAlias || targetId;
          } else if (req.type === "event") {
            if (!stores.event) throw new Error("EventStore is not available on this server.");
            const targetId = await stores.event.init(req.schema || "", session_id, finalAlias);
            results.events[req.id] = finalAlias || targetId;
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: err.message || String(err)
            }
          ],
          isError: true
        };
      }
    }
  );
}
