import * as path from "path";
import { FilterStore } from "@stateful-mcp/core";
import { MemorySessionFilterStore, MemoryPersistentFilterStore } from "@stateful-mcp/core";
import { JsonlSessionFilterStore, JsonlPersistentFilterStore } from "@stateful-mcp/core";
import { SqliteFilterStore } from "@stateful-mcp/core";

import { ObjectStore } from "@stateful-mcp/core";
import { MemorySessionObjectStore, MemoryPersistentObjectStore } from "@stateful-mcp/core";
import { JsonlSessionObjectStore, JsonlPersistentObjectStore } from "@stateful-mcp/core";

import { FormStore } from "@stateful-mcp/core";
import { MemorySessionFormStore, MemoryPersistentFormStore } from "@stateful-mcp/core";
import { JsonlSessionFormStore, JsonlPersistentFormStore } from "@stateful-mcp/core";
import { SqliteFormStore } from "@stateful-mcp/core";

import type { MiddlewareConfig, FormSchema, TableSchema } from "@stateful-mcp/core";

const getUrl = (locator: any) => {
  if (locator?._type === "adapter") return locator.options?.url?.toString();
  return undefined;
};

export function getFilterStore(config: MiddlewareConfig, workspaceRoot: string): FilterStore {
  const sessUrl = getUrl(config.filter_session_state);
  const sessionFilterStore =
    config.filter_session_state?._type === "file" && config.filter_session_state.path.endsWith(".jsonl")
      ? new JsonlSessionFilterStore(path.resolve(workspaceRoot, config.filter_session_state.path))
      : sessUrl && sessUrl.startsWith("sqlite://")
      ? new SqliteFilterStore(sessUrl.replace("sqlite://", ""))
      : new MemorySessionFilterStore();

  const globUrl = getUrl(config.filter_persistent_state?.global);
  const persistentFilterStore =
    config.filter_persistent_state?.global?._type === "file" && config.filter_persistent_state.global.path.endsWith(".jsonl")
      ? new JsonlPersistentFilterStore(path.resolve(workspaceRoot, config.filter_persistent_state.global.path))
      : globUrl && globUrl.startsWith("sqlite://")
      ? new SqliteFilterStore(globUrl.replace("sqlite://", ""))
      : new MemoryPersistentFilterStore();

  const toolSchemas = new Map<string, Record<string, TableSchema>>();
  const pinnedSchemas = new Map<string, TableSchema>();
  const threshold = config.auto_compression?.filter_chain_threshold ?? 20;

  return new FilterStore(sessionFilterStore, persistentFilterStore, toolSchemas, pinnedSchemas, threshold);
}

export function getObjectStore(config: MiddlewareConfig, workspaceRoot: string): ObjectStore {
  const sessionObjectStore =
    config.object_session_state?._type === "file" && config.object_session_state.path.endsWith(".jsonl")
      ? new JsonlSessionObjectStore(path.resolve(workspaceRoot, config.object_session_state.path))
      : new MemorySessionObjectStore();

  const persistentObjectStore =
    config.object_persistent_state?.global?._type === "file" && config.object_persistent_state.global.path.endsWith(".jsonl")
      ? new JsonlPersistentObjectStore(path.resolve(workspaceRoot, config.object_persistent_state.global.path))
      : new MemoryPersistentObjectStore();

  const objectSchemas = new Map<string, any>();
  const limits = config.object_schema_limits;
  const threshold = config.auto_compression?.object_chain_threshold ?? 15;

  return new ObjectStore(
    sessionObjectStore,
    persistentObjectStore,
    objectSchemas,
    limits?.max_fields_per_def ?? 7,
    limits?.max_ref_depth ?? 5,
    threshold
  );
}

export function getFormStore(config: MiddlewareConfig, workspaceRoot: string): FormStore {
  const sessUrl = getUrl(config.form_session_state);
  const sessionFormStore =
    config.form_session_state?._type === "file" && config.form_session_state.path.endsWith(".jsonl")
      ? new JsonlSessionFormStore(path.resolve(workspaceRoot, config.form_session_state.path))
      : sessUrl && sessUrl.startsWith("sqlite://")
      ? new SqliteFormStore(sessUrl.replace("sqlite://", ""))
      : new MemorySessionFormStore();

  const globUrl = getUrl(config.form_persistent_state?.global);
  const persistentFormStore =
    config.form_persistent_state?.global?._type === "file" && config.form_persistent_state.global.path.endsWith(".jsonl")
      ? new JsonlPersistentFormStore(path.resolve(workspaceRoot, config.form_persistent_state.global.path))
      : globUrl && globUrl.startsWith("sqlite://")
      ? new SqliteFormStore(globUrl.replace("sqlite://", ""))
      : new MemoryPersistentFormStore();

  const formSchemas = new Map<string, FormSchema>();

  return new FormStore(sessionFormStore, persistentFormStore, formSchemas);
}
