export type ResourceLocator =
  | { _type: "adapter"; name: string; options?: Record<string, unknown> }
  | { _type: "file"; path: string; ttl_ms?: number }
  | { _type: "remote_url"; url: string; ttl_ms?: number; headers?: Record<string, string> };

export type OwnerScope =
  | { level: "global" }
  | { level: "user"; userId: string };

export interface ToolConfig {
  schema: ResourceLocator;
  translation?: ResourceLocator;
  engine: ResourceLocator | Record<string, ResourceLocator>;  // single or per-table
  validation_engine?: ResourceLocator;
  inspect?: { expose_compiled?: boolean };
}

export interface AutoCompressionConfig {
  filter_chain_threshold?: number;
  object_chain_threshold?: number;
}

export interface MiddlewareConfig {
  $schema?: string;
  version: 1;

  filter_session_state: ResourceLocator;
  filter_persistent_state: { global: ResourceLocator; user: ResourceLocator };

  object_session_state: ResourceLocator;
  object_persistent_state: { global: ResourceLocator; user: ResourceLocator };

  dictionary_state: ResourceLocator;
  dictionary_resolver: ResourceLocator;

  auto_compression?: AutoCompressionConfig;

  constants?: {
    global?: ResourceLocator;
    user?: ResourceLocator;   // URL may contain {userId} placeholder — substituted per-request
  };

  object_schemas?: Record<string, ResourceLocator>;

  object_schema_limits?: {
    max_fields_per_def?: number;   // default 7
    max_ref_depth?: number;        // default 5
  };

  tools: Record<string, ToolConfig>;

  env_sources?: Array<ResourceLocator & { optional?: boolean }>;
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
