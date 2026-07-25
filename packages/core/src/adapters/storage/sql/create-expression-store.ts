import type { PersistentExpressionStore } from "../../../middleware/dictionary/interfaces";
import type { SqlDialect } from "../../../translation/sql-compiler";
import { SqlBackend } from "./backend";
import { expressionDdlKeys } from "./concept-entity-config";
import { ExpressionRepoStore } from "./concept-repo-store";
import { initSchema } from "./init-schema";

export async function createExpressionStore(
	dialect: SqlDialect,
	target: string,
): Promise<PersistentExpressionStore> {
	const backend = await SqlBackend.connect(dialect, target);
	await initSchema(backend, expressionDdlKeys);
	return new ExpressionRepoStore(backend);
}
