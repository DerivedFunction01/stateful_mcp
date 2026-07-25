import type { FormState } from "../../../middleware/form/types";
import type { PersistedFormStateDetails } from "../interfaces";
import type { EntityConfig } from "./entity-config";

export const formDdlKeys = {
  ddl: ["DDL_FORMS", "DDL_FORM_ANSWERS", "DDL_FORM_SKIPPED", "DDL_FORM_STALE", "DDL_SAVED_FORMS", "DDL_FORM_SESSION_ALIASES"],
  ddlIndexes: ["IDX_FORMS_SESSION"],
};

const formAnswersChild = {
  table: "form_answers",
  parentIdColumn: "form_id",
  orderColumn: "question_id",
  stateField: "answers" as const,
  toRow: (child: { question_id: string; value: any }, _index: number, parentId: string) => ({
    form_id: parentId,
    question_id: child.question_id,
    value: JSON.stringify(child.value),
  }),
  fromRow: (row: Record<string, any>) => ({
    question_id: row.question_id,
    value: JSON.parse(row.value),
  }),
  toState: (items: { question_id: string; value: any }[]) => {
    const records: Record<string, any> = {};
    for (const item of items) {
      records[item.question_id] = item.value;
    }
    return records;
  },
};

const formSkippedChild = {
  table: "form_skipped",
  parentIdColumn: "form_id",
  orderColumn: "question_id",
  stateField: "skipped" as const,
  toRow: (child: string, _index: number, parentId: string) => ({
    form_id: parentId,
    question_id: child,
  }),
  fromRow: (row: Record<string, any>) => row.question_id,
};

const formStaleChild = {
  table: "form_stale",
  parentIdColumn: "form_id",
  orderColumn: "question_id",
  stateField: "stale" as const,
  toRow: (child: { question_id: string; value: boolean }, _index: number, parentId: string) => ({
    form_id: parentId,
    question_id: child.question_id,
    value: child.value ? 1 : 0,
  }),
  fromRow: (row: Record<string, any>) => ({
    question_id: row.question_id,
    value: row.value === 1,
  }),
  toState: (items: { question_id: string; value: boolean }[]) => {
    const records: Record<string, boolean> = {};
    for (const item of items) {
      records[item.question_id] = item.value;
    }
    return records;
  },
};

export const formEntityConfig: EntityConfig<any, any> = {
  idPrefix: "form_",
  idField: "form_id",
  parentIdColumn: "parent_form_id",
  sessionTable: "forms",
  savedTable: "saved_forms",
  aliasTable: "form_session_aliases",

  sessionToRow: (id: string, sessionId: string, state: any) => ({
    form_id: id,
    parent_form_id: state.parentFormId || null,
    schema_name: state.schemaName,
    scope_level: "session",
    session_id: sessionId,
    created_at: state.timestamp,
  }),

  rowToSession: (row: Record<string, any>) => ({
    formId: row.form_id,
    parentFormId: row.parent_form_id,
    schemaName: row.schema_name,
    answers: {} as Record<string, any>,
    skipped: [] as string[],
    stale: {} as Record<string, boolean>,
    timestamp: row.created_at,
  }),

  persistentToRow: (
    id: string,
    scope: { level: string; userId?: string | null },
    state: any,
  ) => ({
    form_id: id,
    parent_form_id: state.parentFormId || null,
    schema_name: state.schemaName,
    scope_level: scope.level,
    user_id: scope.level === "user" ? scope.userId : null,
    created_at: state.timestamp,
  }),

  rowToPersistent: (
    row: Record<string, any>,
    savedRow: Record<string, any> | null,
  ) => ({
    formId: row.form_id,
    parentFormId: row.parent_form_id,
    schemaName: row.schema_name,
    answers: {} as Record<string, any>,
    skipped: [] as string[],
    stale: {} as Record<string, boolean>,
    timestamp: row.created_at,
    tags: JSON.parse(savedRow!.tags),
    description: savedRow!.description,
    schema_pinned_at: row.created_at,
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

  children: [formAnswersChild, formSkippedChild, formStaleChild],
};