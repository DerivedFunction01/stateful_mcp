import type { ConceptStore } from "../../../middleware/dictionary/interfaces";
import type { SqlDialect } from "../../../translation/sql-compiler";
import { SqlBackend } from "./backend";
import { conceptDdlKeys } from "./concept-entity-config";
import { ConceptRepoStore } from "./concept-repo-store";
import { initSchema } from "./init-schema";

export async function createConceptStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<ConceptStore> {
	const be = backend ?? (await SqlBackend.connect(dialect, target));
	await initSchema(be, conceptDdlKeys);
	return new ConceptRepoStore(be);
}
