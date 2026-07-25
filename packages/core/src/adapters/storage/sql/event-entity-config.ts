import type { EventCommit } from "../../../middleware/event/types";
import type { PersistedEventState } from "../interfaces";
import type { EntityConfig } from "./entity-config";

export const eventDdlKeys = {
  ddl: ["DDL_EVENTS", "DDL_SAVED_EVENTS", "DDL_EVENT_SESSION_ALIASES"],
  ddlIndexes: ["IDX_EVENTS_SESSION"],
};

export const eventEntityConfig: EntityConfig<any, any> = {
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
    mutations: JSON.stringify(state.mutations),
    created_at: state.createdAt,
    linear_depth: state.linearDepth || 0,
    gc_lock: state.gcLock ? 1 : 0,
    merge_source_commit_ids: state.mergeSourceCommitIds
      ? JSON.stringify(state.mergeSourceCommitIds)
      : null,
    merge_accepted_ids: state.mergeAcceptedIds
      ? JSON.stringify(state.mergeAcceptedIds)
      : null,
    merge_rejected_ids: state.mergeRejectedIds
      ? JSON.stringify(state.mergeRejectedIds)
      : null,
    schema_name: state.schema_name || null,
  }),

  rowToSession: (row: Record<string, any>) => ({
    commitId: row.commit_id,
    sessionId: row.session_id,
    parentCommitId: row.parent_commit_id,
    createdAt: row.created_at,
    operation: row.operation,
    mutations: JSON.parse(row.mutations),
    linearDepth: row.linear_depth || 0,
    gcLock: row.gc_lock === 1,
    mergeSourceCommitIds: row.merge_source_commit_ids
      ? JSON.parse(row.merge_source_commit_ids)
      : undefined,
    mergeAcceptedIds: row.merge_accepted_ids
      ? JSON.parse(row.merge_accepted_ids)
      : undefined,
    mergeRejectedIds: row.merge_rejected_ids
      ? JSON.parse(row.merge_rejected_ids)
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
    mutations: JSON.stringify(state.mutations),
    created_at: state.createdAt,
    linear_depth: state.linearDepth || 0,
    gc_lock: state.gcLock ? 1 : 0,
    merge_source_commit_ids: state.mergeSourceCommitIds
      ? JSON.stringify(state.mergeSourceCommitIds)
      : null,
    merge_accepted_ids: state.mergeAcceptedIds
      ? JSON.stringify(state.mergeAcceptedIds)
      : null,
    merge_rejected_ids: state.mergeRejectedIds
      ? JSON.stringify(state.mergeRejectedIds)
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
    mutations: JSON.parse(row.mutations),
    linearDepth: row.linear_depth || 0,
    gcLock: row.gc_lock === 1,
    mergeSourceCommitIds: row.merge_source_commit_ids
      ? JSON.parse(row.merge_source_commit_ids)
      : undefined,
    mergeAcceptedIds: row.merge_accepted_ids
      ? JSON.parse(row.merge_accepted_ids)
      : undefined,
    mergeRejectedIds: row.merge_rejected_ids
      ? JSON.parse(row.merge_rejected_ids)
      : undefined,
    schema_name: row.schema_name,
    tags: JSON.parse(savedRow!.tags),
    description: savedRow!.description,
  }),

  savedToRow: (
    id: string,
    scope: { level: string; userId?: string | null },
    state: any,
  ) => ({
    id,
    tags: JSON.stringify(state.tags),
    description: state.description,
    scope_level: scope.level,
    user_id: scope.level === "user" ? scope.userId : null,
  }),
};