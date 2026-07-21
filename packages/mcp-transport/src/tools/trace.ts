import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveAboutOrExamples, resolveConfigDir, buildLimitField, clampLimit } from "@stateful-mcp/core";
import { validateMiddlewareConfig } from "@stateful-mcp/core";
import { TraceStore } from "@stateful-mcp/core";
import type { MiddlewareConfig, TraceForm, DeltaOperation } from "@stateful-mcp/core";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localAboutDir = path.resolve(__dirname, "../about");
const localExamplesDir = path.resolve(__dirname, "../examples");

const server = new McpServer({
  name: "trace-service",
  version: "1.0.0",
});

let traceStore: TraceStore;
let config: MiddlewareConfig;
let configDir: string = process.cwd();

function registerTraceTools() {
  server.registerTool(
    "trace_query",
    {
      description: "Search for stored execution trace forms matching an intent.",
      inputSchema: {
        intent: z.string().describe("Intent phrase describing the goal or workflow."),
        limit: buildLimitField("trace_query_page_size", config?.pagination_limits),
        offset: z.number().int().min(0).optional().default(0).describe("Zero-based pagination offset.")
      }
    },
    async ({ intent, limit, offset }) => {
      try {
        const effectiveLimit = clampLimit(limit, "trace_query_page_size", config?.pagination_limits);
        const res = traceStore.queryTraces(intent, effectiveLimit, offset ?? 0);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_exec",
    {
      description: "Execute a trace form end-to-end with LLM-supplied input slot arguments.",
      inputSchema: {
        trace_id: z.string().describe("ID of the trace to execute."),
        args: z.record(z.any()).describe("Input slot arguments supplied for trace execution.")
      }
    },
    async ({ trace_id, args }) => {
      try {
        const res = await traceStore.executeTrace(trace_id, args);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_resume",
    {
      description: "Resume a paused trace execution following approval or client yield.",
      inputSchema: {
        resume_token: z.string().describe("Resume token provided when trace was paused."),
        step_result: z.any().describe("Result object for the paused tool execution step.")
      }
    },
    async ({ resume_token, step_result }) => {
      try {
        const res = await traceStore.resumeTrace(resume_token, step_result);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_inspect",
    {
      description: "Inspect the step graph and metadata of a recorded trace form.",
      inputSchema: {
        trace_id: z.string().describe("ID of the trace form to inspect.")
      }
    },
    async ({ trace_id }) => {
      try {
        const res = traceStore.inspectTrace(trace_id);
        if (!res) {
          return { content: [{ type: "text", text: `Trace "${trace_id}" not found.` }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_record",
    {
      description: "Manage trace recording sessions (start/stop) or submit a pre-constructed trace form directly or from an ObjectStore checkpoint.",
      inputSchema: {
        action: z.enum(["start", "stop", "submit"]).describe("Recording action: 'start' to begin session recording, 'stop' to compile & save recorded session, or 'submit' for pre-constructed trace form."),
        trace_id: z.string().optional().describe("Trace ID (auto-generated on 'start', required on 'stop' to specify which active recording session to compile)."),
        goal: z.string().optional().describe("Goal/intent description for the trace macro."),
        input_slots: z.record(z.any()).optional().describe("Input slots definition."),
        capabilities: z.array(z.string()).optional().describe("Capabilities list (for action='stop')."),
        object_id: z.string().optional().describe("ObjectStore checkpoint ID containing the trace form definition (for action='submit')."),
        trace: z.record(z.any()).optional().describe("Pre-constructed trace form object (for action='submit').")
      }
    },
    async ({ action, trace_id, goal, input_slots, capabilities, object_id, trace }, extra: any) => {
      const sessionId = extra?._metadata?.session_id ?? "default";
      try {
        if (action === "start") {
          const res = traceStore.startRecording(sessionId, trace_id, goal, input_slots as any);
          return { content: [{ type: "text", text: JSON.stringify(res) }] };
        } else if (action === "stop") {
          if (!trace_id) {
            return { content: [{ type: "text", text: "action='stop' requires 'trace_id' specifying which active recording session to finalize." }], isError: true };
          }
          const recorded = traceStore.stopRecording(trace_id, goal, capabilities, input_slots as any);
          return { content: [{ type: "text", text: JSON.stringify(recorded) }] };
        } else if (action === "submit") {
          let targetTraceForm = trace;
          if (!targetTraceForm && object_id) {
            const { getObjectStore } = await import("./helper.js");
            const objectStore = getObjectStore(config, configDir);
            const objState = await objectStore.get(object_id, sessionId);
            if (!objState || !objState.state) {
              return { content: [{ type: "text", text: `Object "${object_id}" not found in ObjectStore.` }], isError: true };
            }
            targetTraceForm = objState.state;
          }
          if (!targetTraceForm) {
            return { content: [{ type: "text", text: "action='submit' requires either 'trace' object or 'object_id'." }], isError: true };
          }
          const recorded = traceStore.recordTrace(targetTraceForm as unknown as TraceForm);
          return { content: [{ type: "text", text: JSON.stringify(recorded) }] };
        } else {
          return { content: [{ type: "text", text: `Unknown action "${action}". Must be "start", "stop", or "submit".` }], isError: true };
        }
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_refine",
    {
      description: "Apply delta edits (replace_step, append_step, remove_step, swap_with_persistent) to a trace form.",
      inputSchema: {
        trace_id: z.string().describe("Target trace ID."),
        action: z.enum(["swap_with_persistent", "replace_step", "append_step", "remove_step"]).describe("Delta operation type."),
        step_id: z.string().optional().describe("Target step ID to operate on."),
        target_step_id: z.string().optional().describe("Target step ID after which to append."),
        new_step: z.record(z.any()).optional().describe("New step definition."),
        persistent_key: z.string().optional().describe("Persistent key for persistent swap."),
        reason: z.string().optional().describe("Reason for delta refinement.")
      }
    },
    async ({ trace_id, action, step_id, target_step_id, new_step, persistent_key, reason }) => {
      try {
        const delta: DeltaOperation = {
          action: action as any,
          step_id,
          target_step_id,
          new_step: new_step as any,
          persistent_key,
          reason
        };
        const refined = traceStore.refineTrace(trace_id, delta);
        return { content: [{ type: "text", text: JSON.stringify(refined) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_feedback",
    {
      description: "Update usage metrics and confidence scores for a trace form based on execution outcome.",
      inputSchema: {
        trace_id: z.string().describe("Target trace ID."),
        outcome: z.enum(["success", "failure"]).describe("Execution outcome.")
      }
    },
    async ({ trace_id, outcome }) => {
      try {
        const res = traceStore.feedbackTrace(trace_id, outcome);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_about",
    {
      description: "Retrieve documentation and guidelines for using the Trace Form Engine service.",
      inputSchema: {}
    },
    async () => {
      try {
        const text = await resolveAboutOrExamples(config.about_and_examples?.trace_about, localAboutDir, "trace.md");
        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "trace_examples",
    {
      description: "Retrieve example workflows and schema snippets for Trace forms.",
      inputSchema: {}
    },
    async () => {
      try {
        const text = await resolveAboutOrExamples(config.about_and_examples?.trace_examples, localExamplesDir, "trace.md");
        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: err.message || String(err) }], isError: true };
      }
    }
  );
}

async function main() {
  configDir = resolveConfigDir();
  config = loadMiddlewareConfig(configDir);
  validateMiddlewareConfig(config, configDir);

  let nonRecordableTools: string[] = [];
  if (config.meta_tools_config) {
    const { loadMetaToolsConfig } = await import("@stateful-mcp/core");
    nonRecordableTools = await loadMetaToolsConfig(config.meta_tools_config, configDir);
  }

  traceStore = new TraceStore(nonRecordableTools, config.tools);

  registerTraceTools();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting trace MCP service:", err);
  process.exit(1);
});
