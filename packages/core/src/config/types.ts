// REFERENCE: docs/config.md
export type ResourceLocator =
  | { _type: "adapter"; name: string; options?: Record<string, unknown> }
  | { _type: "file"; path: string; ttl_ms?: number }
  | { _type: "remote_url"; url: string; ttl_ms?: number; headers?: Record<string, string> };

export type OwnerScope =
  | { level: "global" }
  | { level: "user"; userId: string };

export interface StateRequirement {
  id: string;
  type: "filter" | "object" | "form" | "event" | "trace";
  schema?: string;
  tableName?: string;
  toolName?: string;
  alias?: string;
}

export interface ToolConfig {
  schema: ResourceLocator;
  translation?: ResourceLocator;
  engine: ResourceLocator | Record<string, ResourceLocator>;  // single or per-table
  validation_engine?: ResourceLocator;
  inspect?: { expose_compiled?: boolean };
  state_requirements?: StateRequirement[];
  force_parameterize?: string[];
}

export interface AutoCompressionConfig {
  filter_chain_threshold?: number;
  object_chain_threshold?: number;
  trace_chain_threshold?: number;
}

export interface PaginationLimitsConfig {
  /** Max entries per log page (log_open / log_next). */
  log_page_size?: number;
  /** Max examples returned per page by *_examples tools.  */
  examples_page_size?: number;
  /** Max conflicts returned per page by event_merge_inspect. */
  merge_conflicts_page_size?: number;
  /** Max matches returned per page by trace_query. */
  trace_query_page_size?: number;
}

export interface MiddlewareConfig {
  $schema?: string;
  version: 1;

  filter_session_state: ResourceLocator;
  filter_persistent_state: { global: ResourceLocator; user: ResourceLocator };

  object_session_state: ResourceLocator;
  object_persistent_state: { global: ResourceLocator; user: ResourceLocator };

  event_session_state?: ResourceLocator;
  event_persistent_state?: { global: ResourceLocator; user: ResourceLocator };

  form_session_state?: ResourceLocator;
  form_persistent_state?: { global: ResourceLocator; user: ResourceLocator };

  trace_session_state?: ResourceLocator;
  trace_persistent_state?: { global: ResourceLocator; user: ResourceLocator };

  dictionary_state: ResourceLocator;
  dictionary_resolver: ResourceLocator;

  auto_compression?: AutoCompressionConfig;

  constants?: {
    global?: ResourceLocator;
    user?: ResourceLocator;   // URL may contain {userId} placeholder — substituted per-request
  };

  object_schemas?: Record<string, ResourceLocator | { schema: ResourceLocator; validation_engine?: ResourceLocator }>;

  object_schema_limits?: {
    max_fields_per_def?: number;   // default 7
    max_ref_depth?: number;        // default 5
  };

  // Hard ceilings on how much data a single tool response may stream back.
  // Each surface defaults to a small value; ops can raise or lower the cap,
  // but a caller's requested `limit` is never allowed to exceed it.
  pagination_limits?: PaginationLimitsConfig;

  form_schemas?: Record<string, ResourceLocator | { schema: ResourceLocator }>;
  trace_schemas?: Record<string, ResourceLocator | { schema: ResourceLocator }>;
  meta_tools_config?: ResourceLocator;

  tools: Record<string, ToolConfig>;

  env_sources?: Array<ResourceLocator & { optional?: boolean }>;

  about_and_examples?: AboutAndExamplesConfig;
}

export interface AboutAndExamplesConfig {
  middleware_about?: ResourceLocator[];
  filter_about?: ResourceLocator[];
  filter_examples?: ResourceLocator[];
  object_about?: ResourceLocator[];
  object_examples?: ResourceLocator[];
  dictionary_about?: ResourceLocator[];
  dictionary_examples?: ResourceLocator[];
  event_about?: ResourceLocator[];
  event_examples?: ResourceLocator[];
  form_about?: ResourceLocator[];
  form_examples?: ResourceLocator[];
  trace_about?: ResourceLocator[];
  trace_examples?: ResourceLocator[];
}

export interface TableSchema {
  filterable_properties: string[];
  operators: string[];
  groupable_columns?: string[];
  aggregations?: string[];
  result_shape?: string;
  max_results?: number;
  mock_dataset?: any[];
}

export interface ToolSchema {
  primary_table?: string;
  available_tables: string[];
  table_schemas: Record<string, TableSchema>;
}

export interface FormNextRule {
  condition?: {
    operator: string;
    value: any;
  };
  target: string | null;
}

export interface FormQuestion {
  text: string;
  answer_type: "boolean" | "free_text" | "multiple_choice" | "scale" | "number" | "date" | "multi_select" | "ranked";
  required?: boolean;
  options?: string[];
  scale?: { min: number; max: number; step?: number };
  next?: FormNextRule[] | { default: string | null } | Record<string, string | null>;
}

export interface FormSection {
  title: string;
  questions: string[];
  next?: { default: string | null } | FormNextRule[];
}

export interface FormSchema {
  form_id: string;
  sections?: Record<string, FormSection>;
  questions: Record<string, FormQuestion>;
  start_section?: string;
  start_question: string;
}

