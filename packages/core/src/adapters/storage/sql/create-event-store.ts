import type { SqlDialect } from "../../../translation/sql-compiler";
import type { EventCommit } from "../../../middleware/event/types";
import type { PersistedEventState } from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { eventEntityConfigs, eventDdlKeys } from "./event-entity-config";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";

export async function createEventStore(
  dialect: SqlDialect,
  target: string,
) {
  const backend = await SqlBackend.connect(dialect, target);
  await initSchema(backend, eventDdlKeys);
  const store = new GenericSqlEntityStore<EventCommit, PersistedEventState>(
    backend,
    eventEntityConfigs[dialect],
  );
  return new SqlRepoStore(store);
}