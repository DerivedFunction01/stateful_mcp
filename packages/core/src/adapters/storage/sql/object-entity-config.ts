import type { ObjectState } from "../../../middleware/object/types";
import type { PersistedObjectState } from "../interfaces";
import type { EntityConfig } from "./entity-config";

export const objectDdlKeys = {
  ddl: ["DDL_OBJECTS", "DDL_SAVED_OBJECTS", "DDL_OBJECT_SESSION_ALIASES"],
  ddlIndexes: ["IDX_OBJECTS_SESSION"],
};

export const objectEntityConfig: EntityConfig<any, any> = {
  idPrefix: "obj_",
  idField: "object_id",
  parentIdColumn: "parent_object_id",
  sessionTable: "objects",
  savedTable: "saved_objects",
  aliasTable: "object_session_aliases",

  sessionToRow: (id: string, sessionId: string, state: any) => ({
    object_id: id,
    schema_name: state.schemaName,
    parent_object_id: state.parentObjectId || null,
    scope_level: "session",
    session_id: sessionId,
    data: JSON.stringify(state.data),
    created_at: state.createdAt,
    schema_pinned_at: state.schema_pinned_at || null,
  }),

  rowToSession: (row: Record<string, any>) => ({
    objectId: row.object_id,
    schemaName: row.schema_name,
    parentObjectId: row.parent_object_id,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    schema_pinned_at: row.schema_pinned_at || undefined,
    linearDepth: row.linear_depth || undefined,
    gcLock: row.gc_lock === 1,
  }),

  persistentToRow: (
    id: string,
    scope: { level: string; userId?: string | null },
    state: any,
  ) => ({
    object_id: id,
    schema_name: state.schemaName,
    parent_object_id: state.parentObjectId || null,
    scope_level: scope.level,
    user_id: scope.level === "user" ? scope.userId : null,
    data: JSON.stringify(state.data),
    created_at: state.createdAt,
    schema_pinned_at: state.schema_pinned_at || "",
  }),

  rowToPersistent: (
    row: Record<string, any>,
    savedRow: Record<string, any> | null,
  ) => ({
    objectId: row.object_id,
    schemaName: row.schema_name,
    parentObjectId: row.parent_object_id,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    schema_pinned_at: row.schema_pinned_at || "",
    tags: JSON.parse(savedRow!.tags),
    description: savedRow!.description,
    linearDepth: row.linear_depth || undefined,
    gcLock: row.gc_lock === 1,
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