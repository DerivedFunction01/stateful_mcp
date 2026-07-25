import type { EventCommit } from "../../../middleware/event/types";
import type { PersistedEventState } from "../interfaces";
import type { EntityConfig } from "./entity-config";
import type { SqlDialect } from "../../../translation/sql-compiler";

export const eventDdlKeys = {
  ddl: ["DDL_EVENTS", "DDL_SAVED_EVENTS", "DDL_EVENT_SESSION_ALIASES"],
  ddlIndexes: ["IDX_EVENTS_SESSION"],
};

function makeEventEntityConfig(dialect: SqlDialect): EntityConfig<any, any> {
  const isPg = dialect === "postgres";
  const isDuck = dialect === "duckdb";

  const jsonParse = (v: any) => {
    if (v === null || v === undefined) return null;
    if (isDuck) return JSON.parse(String(v));
    return JSON.parse(v);
  };

  const jsonStringify = (v: any) => {
    if (v === null || v === undefined) return null;
    if (isPg) return v;
    return JSON.stringify(v);
  };

  return {
    idPrefix: "commit_",
    idField: "commit_id",
    parentIdColumn: "parent_commit_id",
    sessionTable: "events",
    savedTable: "saved_events",
    aliasTable: "event_session_aliases",

    sessionToRow: (id: string, sessionId: string, state: any) => ({
      commit_id: id,
      session_id: sessionId,
      parent_commit_id: state.parentCommitId || null,
      scope_level: "session",
      operation: state.operation,
      mutations: jsonStringify(state.mutations),
      created_at: state.createdAt,
      linear_depth: state.linearDepth || 0,
      gc_lock: state.gcLock ? 1 : 0,
      merge_source_commit_ids: state.mergeSourceCommitIds
        ? jsonStringify(state.mergeSourceCommitIds)
        : null,
      merge_accepted_ids: state.mergeAcceptedIds
        ? jsonStringify(state.mergeAcceptedIds)
        : null,
      merge_rejected_ids: state.mergeRejectedIds
        ? jsonStringify(state.mergeRejectedIds)
        : null,
      schema_name: state.schema_name || null,
    }),

    rowToSession: (row: Record<string, any>) => ({
      commitId: row.commit_id,
      sessionId: row.session_id,
      parentCommitId: row.parent_commit_id,
      createdAt: row.created_at,
      operation: row.operation,
      mutations: jsonParse(row.mutations),
      linearDepth: row.linear_depth || 0,
      gcLock: row.gc_lock === 1,
      mergeSourceCommitIds: row.merge_source_commit_ids
        ? jsonParse(row.merge_source_commit_ids)
        : undefined,
      mergeAcceptedIds: row.merge_accepted_ids
        ? jsonParse(row.merge_accepted_ids)
        : undefined,
      mergeRejectedIds: row.merge_rejected_ids
        ? jsonParse(row.merge_rejected_ids)
        : undefined,
      schema_name: row.schema_name || undefined,
    }),

    persistentToRow: (
      id: string,
      scope: { level: string; userId?: string | null },
      state: any,
    ) => ({
      commit_id: id,
      scope_level: scope.level,
      user_id: scope.level === "user" ? scope.userId : null,
      parent_commit_id: state.parentCommitId || null,
      operation: state.operation,
      mutations: jsonStringify(state.mutations),
      created_at: state.createdAt,
      linear_depth: state.linearDepth || 0,
      gc_lock: state.gcLock ? 1 : 0,
      merge_source_commit_ids: state.mergeSourceCommitIds
        ? jsonStringify(state.mergeSourceCommitIds)
        : null,
      merge_accepted_ids: state.mergeAcceptedIds
        ? jsonStringify(state.mergeAcceptedIds)
        : null,
      merge_rejected_ids: state.mergeRejectedIds
        ? jsonStringify(state.mergeRejectedIds)
        : null,
      schema_name: state.schema_name,
    }),

    rowToPersistent: (
      row: Record<string, any>,
      savedRow: Record<string, any> | null,
    ) => ({
      commitId: row.commit_id,
      sessionId: row.session_id,
      parentCommitId: row.parent_commit_id,
      createdAt: row.created_at,
      operation: row.operation,
      mutations: jsonParse(row.mutations),
      linearDepth: row.linear_depth || 0,
      gcLock: row.gc_lock === 1,
      mergeSourceCommitIds: row.merge_source_commit_ids
        ? jsonParse(row.merge_source_commit_ids)
        : undefined,
      mergeAcceptedIds: row.merge_accepted_ids
        ? jsonParse(row.merge_accepted_ids)
        : undefined,
      mergeRejectedIds: row.merge_rejected_ids
        ? jsonParse(row.merge_rejected_ids)
        : undefined,
      schema_name: row.schema_name,
      tags: isPg ? savedRow!.tags : jsonParse(savedRow!.tags),
      description: savedRow!.description,
    }),

    savedToRow: (
      id: string,
      scope: { level: string; userId?: string | null },
      state: any,
    ) => ({
      id,
      tags: isPg ? state.tags : JSON.stringify(state.tags),
      description: state.description,
      scope_level: scope.level,
      user_id: scope.level === "user" ? scope.userId : null,
    }),
  };
}

export const eventEntityConfigs: Record<SqlDialect, EntityConfig<any, any>> = {
  sqlite: makeEventEntityConfig("sqlite"),
  postgres: makeEventEntityConfig("postgres"),
  duckdb: makeEventEntityConfig("duckdb"),
};