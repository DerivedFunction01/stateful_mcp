import type { ConceptFilterStore } from "../../../middleware/dictionary/interfaces";
import type { ConceptFilter } from "../../../middleware/dictionary/types";
import type { SqlBackend } from "./backend";
import { DictionarySqlCompiler } from "./dict-compiler";

export class SqlConceptFilterStore implements ConceptFilterStore {
	private compiler: DictionarySqlCompiler;

	constructor(private backend: SqlBackend) {
		this.compiler = new DictionarySqlCompiler({ dialect: backend.dialect });
	}

	async initialize(): Promise<void> {
		const schema = this.compiler.compileSchema();
		for (const ddl of schema.ddl.filter((query) =>
			query.sql.includes('"concept_filters"'),
		)) {
			await this.backend.exec(ddl.sql, ddl.params);
		}
		for (const index of schema.indexes.filter((query) =>
			query.sql.includes("filter"),
		)) {
			await this.backend.exec(index.sql, index.params);
		}
	}

	async get(filterId: string): Promise<ConceptFilter | null> {
		const query = this.compiler.compileConceptFilterBatch([filterId]);
		const rows = await this.backend.query(query.sql, query.params);
		return rows[0] ? rowToFilter(rows[0]) : null;
	}

	async listByConcept(conceptId: string): Promise<ConceptFilter[]> {
		const query = this.compiler.compileConceptFilterBatch([conceptId]);
		return (await this.backend.query(query.sql, query.params)).map(rowToFilter);
	}

	async listByRole(roleName: string): Promise<ConceptFilter[]> {
		const query = this.compiler.compileConceptFilterBatch([], roleName);
		return (await this.backend.query(query.sql, query.params)).map(rowToFilter);
	}

	async listForConceptRole(
		conceptId: string,
		roleName: string,
	): Promise<ConceptFilter[]> {
		const query = this.compiler.compileConceptFilterBatch(
			[conceptId],
			roleName,
		);
		return (await this.backend.query(query.sql, query.params)).map(rowToFilter);
	}

	async listForConceptRoleBatch(
		conceptIds: string[],
		roleName: string,
	): Promise<Map<string, ConceptFilter[]>> {
		const result = new Map<string, ConceptFilter[]>();
		if (conceptIds.length === 0) return result;
		const query = this.compiler.compileConceptFilterBatch(conceptIds, roleName);
		for (const row of await this.backend.query(query.sql, query.params)) {
			const filter = rowToFilter(row);
			result.set(filter.conceptId, [
				...(result.get(filter.conceptId) ?? []),
				filter,
			]);
		}
		return result;
	}

	async set(filter: ConceptFilter): Promise<void> {
		const query = this.compiler.compileConceptFilterUpsert();
		await this.backend.exec(query.sql, [
			filter.filterId,
			filter.conceptId,
			filter.policy,
			filter.roleName,
			filter.active !== false,
		]);
	}

	async delete(filterId: string): Promise<void> {
		const query = this.compiler.compileConceptFilterDelete();
		await this.backend.exec(query.sql, [filterId]);
	}
}

function rowToFilter(row: Record<string, unknown>): ConceptFilter {
	return {
		filterId: String(row.filter_id),
		conceptId: String(row.concept_id),
		policy: row.policy === "blacklist" ? "blacklist" : "whitelist",
		roleName: String(row.role_name),
		active: row.active !== false && row.active !== 0,
	};
}
