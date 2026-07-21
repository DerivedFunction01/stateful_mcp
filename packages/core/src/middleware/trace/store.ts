import type {
  TraceForm,
  TraceStep,
  TraceSlot,
  TraceQueryResult,
  TraceQueryResultItem,
  DeltaOperation,
  TraceExecutionResult
} from "./types";
import { executePipeline } from "../../translation/pipeline";
import { eventBroker, type StateChangeEvent } from "../../events/broker";

export type ToolExecutor = (action: string, args: Record<string, any>) => Promise<any>;

interface PausedState {
  resume_token: string;
  trace_id: string;
  step_id: string;
  input_args: Record<string, any>;
  step_results: Record<string, any>;
  action_counts: Record<string, number>;
  consecutive_counts: { last_action: string | null; count: number };
}

interface ActiveRecordingSession {
  sessionId: string;
  traceId: string;
  goal: string;
  inputSlots: Record<string, TraceSlot>;
  steps: { action: string; args: Record<string, any>; output?: any }[];
  startTime: number;
}

import { DEFAULT_NON_RECORDABLE_SERVICE_TOOLS, NonRecordableToolsRegistry } from "../../config/meta_tools";

export class TraceStore {
  private traces = new Map<string, TraceForm>();
  private pausedStates = new Map<string, PausedState>();
  private recordingSessions = new Map<string, ActiveRecordingSession>();

  private registry: NonRecordableToolsRegistry;

  constructor(customNonRecordableTools: string[] = []) {
    this.registry = new NonRecordableToolsRegistry(customNonRecordableTools);

    // Listen for core eventBroker state changes to auto-record steps into active recording sessions for the matching sessionId
    eventBroker.on("state:changed", (event: StateChangeEvent) => {
      const fullAction = `${event.service}_${event.action}`;
      if (this.isRecordableTool(fullAction)) {
        for (const session of this.recordingSessions.values()) {
          if (session.sessionId === event.sessionId) {
            session.steps.push({ action: fullAction, args: event.data || {} });
          }
        }
      }
    });
  }

  public registerNonRecordableTool(toolName: string) {
    this.registry.register(toolName);
  }

  public isRecordableTool(action: string): boolean {
    return this.registry.isRecordable(action);
  }

  /**
   * Start a recording session bound to a sessionId. Auto-generates trace_id if omitted.
   */
  public startRecording(
    sessionId: string,
    traceId?: string,
    goal: string = "Recorded workflow macro",
    inputSlots: Record<string, TraceSlot> = {}
  ): { status: string; session_id: string; trace_id: string } {
    const id = traceId || `trc_${Math.random().toString(36).slice(2, 10)}`;
    this.recordingSessions.set(id, {
      sessionId,
      traceId: id,
      goal,
      inputSlots,
      steps: [],
      startTime: Date.now()
    });
    return { status: "recording_started", session_id: sessionId, trace_id: id };
  }

  /**
   * Record an individual step into active recording session(s). Checks recordability rules.
   */
  public recordStep(sessionId: string, action: string, args: Record<string, any> = {}, output?: any, traceId?: string) {
    if (!this.isRecordableTool(action)) return;

    if (traceId && this.recordingSessions.has(traceId)) {
      this.recordingSessions.get(traceId)!.steps.push({ action, args, output });
    } else {
      for (const session of this.recordingSessions.values()) {
        if (session.sessionId === sessionId) {
          session.steps.push({ action, args, output });
        }
      }
    }
  }

  /**
   * Stop recording for a specific traceId, parameterize arguments against input slots, and finalize the TraceForm.
   */
  public stopRecording(
    traceId: string,
    overrideGoal?: string,
    capabilities: string[] = [],
    overrideInputSlots?: Record<string, TraceSlot>
  ): TraceForm {
    const session = this.recordingSessions.get(traceId);
    if (!session) {
      throw new Error(`No active recording session found for trace_id "${traceId}".`);
    }
    this.recordingSessions.delete(traceId);

    const steps: any[] = session.steps.map(s => ({
      action: s.action,
      args: s.args
    }));

    const rawForm: TraceForm = {
      trace_id: session.traceId,
      goal: overrideGoal || session.goal || "Recorded workflow macro",
      input_slots: overrideInputSlots || session.inputSlots || {},
      capabilities,
      steps
    };

    return this.recordTrace(rawForm);
  }

  /**
   * Record a new trace form with deterministic step naming / auto-suffixing.
   */
  public recordTrace(rawForm: TraceForm): TraceForm {
    const actionCounts: Record<string, number> = {};
    const updatedSteps: TraceStep[] = [];
    const stepIdMap = new Map<string, string>();
    const requiresApproval = new Set<string>();

    for (const step of rawForm.steps) {
      const baseName = step.action;
      actionCounts[baseName] = (actionCounts[baseName] || 0) + 1;
      const autoId = step.id || `${baseName}_${actionCounts[baseName]}`;

      stepIdMap.set(step.id || baseName, autoId);

      if (step.autonomous === false) {
        requiresApproval.add(step.action);
      }

      updatedSteps.push({
        ...step,
        id: autoId
      });
    }

    // Update step targets if they referenced old step IDs
    for (const step of updatedSteps) {
      if (step.default_target && stepIdMap.has(step.default_target)) {
        step.default_target = stepIdMap.get(step.default_target)!;
      }
      if (step.conditions) {
        for (const cond of step.conditions) {
          if (stepIdMap.has(cond.target)) {
            cond.target = stepIdMap.get(cond.target)!;
          }
        }
      }
      if (step.error_targets) {
        const newErrorTargets: Record<string, string> = {};
        for (const [errKey, targetId] of Object.entries(step.error_targets)) {
          newErrorTargets[errKey] = stepIdMap.get(targetId) || targetId;
        }
        step.error_targets = newErrorTargets;
      }
    }

    const traceId = rawForm.trace_id || `trc_${Math.random().toString(36).slice(2, 10)}`;

    const form: TraceForm = {
      ...rawForm,
      trace_id: traceId,
      confidence_score: rawForm.confidence_score ?? 1.0,
      usage_count: rawForm.usage_count ?? 0,
      input_slots: rawForm.input_slots ?? {},
      capabilities: rawForm.capabilities ?? [],
      requires_approval_tools: Array.from(requiresApproval),
      steps: updatedSteps,
      start_step: updatedSteps.length > 0 ? updatedSteps[0]!.id : undefined
    };

    this.traces.set(form.trace_id, form);
    return form;
  }

  public inspectTrace(traceId: string): TraceForm | null {
    return this.traces.get(traceId) || null;
  }

  public queryTraces(intent: string, limit = 10, offset = 0): TraceQueryResult {
    const matches: TraceQueryResultItem[] = [];
    const lowerIntent = intent.toLowerCase();

    for (const trace of this.traces.values()) {
      let score = 0;
      if (trace.goal.toLowerCase().includes(lowerIntent)) {
        score += 0.8;
      } else {
        const words = lowerIntent.split(/\s+/);
        const hitCount = words.filter(w => trace.goal.toLowerCase().includes(w)).length;
        if (hitCount > 0) {
          score += (hitCount / words.length) * 0.6;
        }
      }

      if (score > 0) {
        matches.push({
          trace_id: trace.trace_id,
          goal: trace.goal,
          confidence_score: Number((trace.confidence_score! * score).toFixed(2)),
          usage_count: trace.usage_count!,
          input_slots: trace.input_slots!,
          capabilities: trace.capabilities!,
          requires_approval_tools: trace.requires_approval_tools!
        });
      }
    }

    matches.sort((a, b) => b.confidence_score - a.confidence_score);

    const total = matches.length;
    const pageItems = matches.slice(offset, offset + limit);
    const has_more = offset + limit < total;
    const next_offset = has_more ? offset + limit : undefined;

    return {
      matches: pageItems,
      total,
      limit,
      offset,
      has_more,
      next_offset
    };
  }

  public async executeTrace(
    traceId: string,
    inputArgs: Record<string, any>,
    toolExecutor?: ToolExecutor
  ): Promise<TraceExecutionResult> {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return { status: "failed", trace_id: traceId, error: `Trace "${traceId}" not found.` };
    }

    // Validate required input slots
    for (const [slotKey, slotDef] of Object.entries(trace.input_slots || {})) {
      if (slotDef.required && (inputArgs[slotKey] === undefined || inputArgs[slotKey] === null)) {
        return {
          status: "failed",
          trace_id: traceId,
          error: `Missing required input slot "${slotKey}".`
        };
      }
    }

    const stepResults: Record<string, any> = {};
    const actionCounts: Record<string, number> = {};
    const consecutiveCounts = { last_action: null as string | null, count: 0 };
    const rollbackStack: { action: string; args: Record<string, any> }[] = [];

    let currentStepId: string | undefined = trace.start_step || (trace.steps[0]?.id);

    while (currentStepId) {
      const stepIndex = trace.steps.findIndex(s => s.id === currentStepId);
      if (stepIndex === -1) break;
      const step = trace.steps[stepIndex];
      if (!step) break;

      // Check non-autonomous safety policy
      if (step.autonomous === false) {
        const resumeToken = `resume_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.pausedStates.set(resumeToken, {
          resume_token: resumeToken,
          trace_id: traceId,
          step_id: step.id,
          input_args: inputArgs,
          step_results: stepResults,
          action_counts: actionCounts,
          consecutive_counts: consecutiveCounts
        });

        return {
          status: "paused",
          trace_id: traceId,
          current_step: step.id,
          resume_token: resumeToken,
          requires_approval: true,
          approval_tool: step.action,
          step_results: stepResults
        };
      }

      // Check tool limits
      const limits = step.execution_limits || {};
      const currentActionCount = (actionCounts[step.action] || 0) + 1;
      actionCounts[step.action] = currentActionCount;
      if (limits.max_total && currentActionCount > limits.max_total) {
        return this.handleFailure(traceId, `Exceeded max_total execution limit for tool "${step.action}".`, rollbackStack, toolExecutor);
      }

      if (consecutiveCounts.last_action === step.action) {
        consecutiveCounts.count++;
      } else {
        consecutiveCounts.last_action = step.action;
        consecutiveCounts.count = 1;
      }
      if (limits.max_consecutive && consecutiveCounts.count > limits.max_consecutive) {
        return this.handleFailure(traceId, `Exceeded max_consecutive execution limit for tool "${step.action}".`, rollbackStack, toolExecutor);
      }

      // Resolve arguments
      const resolvedArgs = this.resolveArgs(step.args || {}, inputArgs, stepResults);

      let stepOutput: any;
      try {
        if (toolExecutor) {
          stepOutput = await toolExecutor(step.action, resolvedArgs);
        } else {
          stepOutput = { success: true, action: step.action, args: resolvedArgs };
        }
      } catch (err: any) {
        // Handle error branch or trigger compensation rollback
        if (step.error_targets && err.message && step.error_targets[err.message]) {
          currentStepId = step.error_targets[err.message];
          continue;
        }
        return this.handleFailure(traceId, err.message || "Step execution failed.", rollbackStack, toolExecutor);
      }

      // Record transactional rollback action if present
      if (step.transactional?.rollback_action) {
        const rollbackArgs = this.resolveArgs(step.transactional.rollback_args || {}, inputArgs, stepResults, stepOutput);
        rollbackStack.push({ action: step.transactional.rollback_action, args: rollbackArgs });
      }

      stepResults[step.id] = stepOutput;

      // Evaluate condition branching
      let nextStepId: string | null | undefined = undefined;
      if (step.conditions) {
        for (const cond of step.conditions) {
          const rowData = { response: stepOutput, input: inputArgs, steps: stepResults };
          const result = executePipeline(cond.pipeline, rowData, {});
          if (result === true) {
            nextStepId = cond.target;
            break;
          }
        }
      }

      if (nextStepId === undefined) {
        if (step.default_target !== undefined) {
          nextStepId = step.default_target;
        } else {
          nextStepId = trace.steps[stepIndex + 1]?.id || null;
        }
      }

      currentStepId = nextStepId || undefined;
    }

    // Increment trace usage count
    trace.usage_count = (trace.usage_count || 0) + 1;

    const lastStepId = trace.steps[trace.steps.length - 1]?.id;
    return {
      status: "completed",
      trace_id: traceId,
      step_results: stepResults,
      output: lastStepId ? stepResults[lastStepId] : null
    };
  }

  public async resumeTrace(
    resumeToken: string,
    stepResult: any,
    toolExecutor?: ToolExecutor
  ): Promise<TraceExecutionResult> {
    const state = this.pausedStates.get(resumeToken);
    if (!state) {
      return { status: "failed", trace_id: "unknown", error: `Invalid or expired resume token "${resumeToken}".` };
    }
    this.pausedStates.delete(resumeToken);

    state.step_results[state.step_id] = stepResult;
    const trace = this.traces.get(state.trace_id)!;
    const currentStepIndex = trace.steps.findIndex(s => s.id === state.step_id);

    const nextStepId = trace.steps[currentStepIndex + 1]?.id;
    if (!nextStepId) {
      return {
        status: "completed",
        trace_id: state.trace_id,
        step_results: state.step_results,
        output: stepResult
      };
    }

    // Continue executing downstream steps
    return this.executeTraceFromStep(trace, nextStepId, state.input_args, state.step_results, toolExecutor);
  }

  private async executeTraceFromStep(
    trace: TraceForm,
    startStepId: string,
    inputArgs: Record<string, any>,
    stepResults: Record<string, any>,
    toolExecutor?: ToolExecutor
  ): Promise<TraceExecutionResult> {
    let currentStepId: string | undefined = startStepId;
    const rollbackStack: { action: string; args: Record<string, any> }[] = [];

    while (currentStepId) {
      const stepIndex = trace.steps.findIndex(s => s.id === currentStepId);
      if (stepIndex === -1) break;
      const step = trace.steps[stepIndex];
      if (!step) break;

      const resolvedArgs = this.resolveArgs(step.args || {}, inputArgs, stepResults);

      let stepOutput: any;
      try {
        if (toolExecutor) {
          stepOutput = await toolExecutor(step.action, resolvedArgs);
        } else {
          stepOutput = { success: true, action: step.action, args: resolvedArgs };
        }
      } catch (err: any) {
        return this.handleFailure(trace.trace_id, err.message || "Step execution failed.", rollbackStack, toolExecutor);
      }

      if (step.transactional?.rollback_action) {
        const rollbackArgs = this.resolveArgs(step.transactional.rollback_args || {}, inputArgs, stepResults, stepOutput);
        rollbackStack.push({ action: step.transactional.rollback_action, args: rollbackArgs });
      }

      stepResults[step.id] = stepOutput;

      let nextStepId: string | null | undefined = undefined;
      if (step.conditions) {
        for (const cond of step.conditions) {
          const rowData = { response: stepOutput, input: inputArgs, steps: stepResults };
          const result = executePipeline(cond.pipeline, rowData, {});
          if (result === true) {
            nextStepId = cond.target;
            break;
          }
        }
      }

      if (nextStepId === undefined) {
        if (step.default_target !== undefined) {
          nextStepId = step.default_target;
        } else {
          nextStepId = trace.steps[stepIndex + 1]?.id || null;
        }
      }

      currentStepId = nextStepId || undefined;
    }

    const lastStepId = trace.steps[trace.steps.length - 1]?.id;
    return {
      status: "completed",
      trace_id: trace.trace_id,
      step_results: stepResults,
      output: lastStepId ? stepResults[lastStepId] : null
    };
  }

  public refineTrace(traceId: string, delta: DeltaOperation): TraceForm {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace "${traceId}" not found for refinement.`);
    }

    let steps = [...trace.steps];

    switch (delta.action) {
      case "replace_step": {
        if (!delta.step_id || !delta.new_step) throw new Error("replace_step requires step_id and new_step.");
        const idx = steps.findIndex(s => s.id === delta.step_id);
        if (idx === -1) throw new Error(`Step "${delta.step_id}" not found.`);
        steps[idx] = { ...delta.new_step, id: delta.step_id };
        break;
      }
      case "append_step": {
        if (!delta.new_step) throw new Error("append_step requires new_step.");
        if (delta.target_step_id) {
          const idx = steps.findIndex(s => s.id === delta.target_step_id);
          if (idx === -1) throw new Error(`Target step "${delta.target_step_id}" not found.`);
          steps.splice(idx + 1, 0, delta.new_step);
        } else {
          steps.push(delta.new_step);
        }
        break;
      }
      case "remove_step": {
        if (!delta.step_id) throw new Error("remove_step requires step_id.");
        const idx = steps.findIndex(s => s.id === delta.step_id);
        if (idx === -1) throw new Error(`Step "${delta.step_id}" not found.`);
        const removedStep = steps[idx];
        const nextId = steps[idx + 1]?.id || null;
        steps.splice(idx, 1);

        // Re-link upstream targets pointing to removed step
        for (const s of steps) {
          if (removedStep && s.default_target === removedStep.id) {
            s.default_target = nextId;
          }
        }
        break;
      }
      case "swap_with_persistent": {
        if (!delta.step_id || !delta.persistent_key) {
          throw new Error("swap_with_persistent requires step_id and persistent_key.");
        }
        const idx = steps.findIndex(s => s.id === delta.step_id);
        if (idx === -1) throw new Error(`Step "${delta.step_id}" not found.`);
        steps[idx] = {
          id: `load_persistent_${idx + 1}`,
          action: "load_persistent",
          args: { key: delta.persistent_key }
        };
        break;
      }
    }

    const updatedTrace: TraceForm = {
      ...trace,
      steps
    };

    this.traces.set(traceId, updatedTrace);
    return updatedTrace;
  }

  public feedbackTrace(traceId: string, outcome: "success" | "failure"): TraceForm {
    const trace = this.traces.get(traceId);
    if (!trace) throw new Error(`Trace "${traceId}" not found.`);

    const currentScore = trace.confidence_score ?? 1.0;
    const newScore = outcome === "success"
      ? Math.min(1.0, currentScore + 0.05)
      : Math.max(0.1, currentScore - 0.2);

    trace.confidence_score = Number(newScore.toFixed(2));
    this.traces.set(traceId, trace);
    return trace;
  }

  private resolveArgs(
    template: Record<string, any>,
    inputArgs: Record<string, any>,
    stepResults: Record<string, any>,
    currentStepOutput?: any
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, val] of Object.entries(template)) {
      if (typeof val === "string") {
        if (val.startsWith("$input.")) {
          const path = val.slice(7);
          resolved[key] = inputArgs[path] !== undefined ? inputArgs[path] : val;
        } else if (val.startsWith("$step.")) {
          const parts = val.slice(6).split(".");
          const stepId = parts[0];
          const propPath = parts.slice(1);
          let target = (stepId ? stepResults[stepId] : undefined) || (stepId === "current" ? currentStepOutput : undefined);
          for (const p of propPath) {
            target = target?.[p];
          }
          resolved[key] = target !== undefined ? target : val;
        } else {
          resolved[key] = val;
        }
      } else {
        resolved[key] = val;
      }
    }

    return resolved;
  }

  private async handleFailure(
    traceId: string,
    errorMessage: string,
    rollbackStack: { action: string; args: Record<string, any> }[],
    toolExecutor?: ToolExecutor
  ): Promise<TraceExecutionResult> {
    const rollbackLog: string[] = [];
    while (rollbackStack.length > 0) {
      const item = rollbackStack.pop()!;
      try {
        if (toolExecutor) {
          await toolExecutor(item.action, item.args);
        }
        rollbackLog.push(`Rolled back ${item.action} with ${JSON.stringify(item.args)}`);
      } catch (err: any) {
        rollbackLog.push(`Failed rollback for ${item.action}: ${err.message}`);
      }
    }

    return {
      status: "rolled_back",
      trace_id: traceId,
      error: errorMessage,
      rollback_log: rollbackLog
    };
  }
}
