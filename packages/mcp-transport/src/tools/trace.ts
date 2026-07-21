import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadMiddlewareConfig, resolveAboutOrExamples, resolveConfigDir } from "@stateful-mcp/core";
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
        limit: z.number().optional().describe("Maximum number of trace matches to return.")
      }
    },
    async ({ intent, limit }) => {
      try {
        const res = traceStore.queryTraces(intent, limit);
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
      description: "Record a newly discovered tool execution sequence as a trace form.",
      inputSchema: {
        trace: z.record(z.any()).describe("Trace form definition object.")
      }
    },
    async ({ trace }) => {
      try {
        const recorded = traceStore.recordTrace(trace as unknown as TraceForm);
        return { content: [{ type: "text", text: JSON.stringify(recorded) }] };
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

  traceStore = new TraceStore();

  registerTraceTools();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting trace MCP service:", err);
  process.exit(1);
});
