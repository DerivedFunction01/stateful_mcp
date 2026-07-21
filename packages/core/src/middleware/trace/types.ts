import type { PipelineStep } from "../../translation/types";

export interface TraceSlotTarget {
  step_id?: string;
  action?: string;
  occurrence?: number; // 1-indexed call occurrence (e.g. 1 for first call, 2 for second call)
  arg_key: string;
}

export interface TraceSlot {
  type: string;
  description: string;
  default?: any;
  required?: boolean;
  target?: TraceSlotTarget;
}

export interface TraceCondition {
  pipeline: PipelineStep[];
  target: string;
}

export interface TraceExecutionLimits {
  max_consecutive?: number;
  max_total?: number;
}

export interface TraceTransactionalConfig {
  rollback_action?: string;
  rollback_args?: Record<string, any>;
}

export interface TraceStep {
  id: string;
  action: string;
  args?: Record<string, any>;
  output_bindings?: Record<string, string>;
  conditions?: TraceCondition[];
  default_target?: string | null;
  autonomous?: boolean;
  execution_limits?: TraceExecutionLimits;
  transactional?: TraceTransactionalConfig;
  success_criteria?: PipelineStep[];
  error_targets?: Record<string, string>;
}

export interface TraceForm {
  trace_id: string;
  goal: string;
  version?: number;
  environment_hash?: string;
  confidence_score?: number;
  usage_count?: number;
  input_slots?: Record<string, TraceSlot>;
  capabilities?: string[];
  requires_approval_tools?: string[];
  steps: TraceStep[];
  start_step?: string;
}

export interface TraceQueryResultItem {
  trace_id: string;
  goal: string;
  confidence_score: number;
  usage_count: number;
  input_slots: Record<string, TraceSlot>;
  capabilities: string[];
  requires_approval_tools: string[];
}

export interface TraceQueryResult {
  matches: TraceQueryResultItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

export type DeltaActionType = "swap_with_persistent" | "replace_step" | "append_step" | "remove_step" | "promote_arg" | "demote_arg";

export interface DeltaOperation {
  action: DeltaActionType;
  step_id?: string;
  target_step_id?: string;
  new_step?: TraceStep;
  replacement_steps?: TraceStep[];
  persistent_key?: string;
  arg_key?: string;
  slot_name?: string;
  slot_def?: TraceSlot;
  literal_value?: any;
  reason?: string;
}

export interface TraceExecutionResult {
  status: "completed" | "paused" | "failed" | "rolled_back";
  trace_id: string;
  current_step?: string;
  resume_token?: string;
  requires_approval?: boolean;
  approval_tool?: string;
  step_results?: Record<string, any>;
  output?: any;
  error?: string;
  rollback_log?: string[];
}
