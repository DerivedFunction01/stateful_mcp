import { isConceptAllowed } from "../../../middleware/dictionary/filters";
import type {
	Concept,
	ConceptFilter,
} from "../../../middleware/dictionary/types";
import type { CompiledQuery } from "../../../translation/sql-compiler";
import type { DictionaryLookupRequest } from "./dict-compiler";
import type {
	DictionaryHydrationContext,
	DictionaryHydrationResolver,
	DictionaryHydrationResult,
} from "./dict-hydration";
import type { DictionaryExecutionPlan } from "./dict-planner";

export interface DictionarySqlQueryRunner {
	query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

export interface DictionaryConceptBatchReader {
	getByIds(ids: string[]): Promise<Concept[]>;
}

export interface DictionaryFilterBatchReader {
	listForConceptRoleBatch(
		conceptIds: string[],
		roleName: string,
	): Promise<Map<string, ConceptFilter[]>>;
}

export interface DictionaryPlanExecutionDependencies {
	sql?: DictionarySqlQueryRunner;
	concepts?: DictionaryConceptBatchReader;
	conceptHydrator?: DictionaryHydrationResolver<Concept>;
	filters?: DictionaryFilterBatchReader;
}

export interface DictionaryExecutionCandidate {
	expressionId: string;
	conceptId?: string;
	concept?: Concept;
	row: Record<string, unknown>;
	filters?: ConceptFilter[];
}

export interface DictionaryPlanExecutionResult {
	candidates: DictionaryExecutionCandidate[];
	queriedSql: CompiledQuery[];
	filteredCount: number;
	missingConceptCount: number;
	hydration?: DictionaryHydrationResult<Concept>;
}

/** Executes a planner result without turning decoupled stores into N+1 queries. */
export async function executeDictionaryPlan(
	plan: DictionaryExecutionPlan,
	request: DictionaryLookupRequest,
	dependencies: DictionaryPlanExecutionDependencies,
	context: DictionaryHydrationContext = {},
): Promise<DictionaryPlanExecutionResult> {
	const rows =
		plan.statements.length > 0
			? await queryPlanStatements(plan.statements, dependencies.sql)
			: [];
	const candidates: DictionaryExecutionCandidate[] = rows.map((row) => ({
		expressionId: String(row.id ?? row.expression_id ?? ""),
		conceptId: optionalString(row.concept_id),
		row,
	}));
	const conceptIds = [
		...new Set(
			candidates
				.map((candidate) => candidate.conceptId)
				.filter((id): id is string => !!id),
		),
	];
	let missingConceptCount = 0;
	let hydration: DictionaryHydrationResult<Concept> | undefined;

	if (plan.followUpDomains.includes("concepts")) {
		if (dependencies.conceptHydrator) {
			hydration = await dependencies.conceptHydrator.hydrate(
				conceptIds,
				context,
			);
		} else if (dependencies.concepts) {
			hydration = {
				records: await dependencies.concepts.getByIds(conceptIds),
				missingIds: [],
				staleIds: [],
				sources: [],
				cachedIds: [],
			};
		} else {
			throw new Error(
				"Dictionary plan requires a concept batch reader or hydrator.",
			);
		}
		const conceptMap = new Map(
			hydration.records.map((concept) => [concept.id, concept]),
		);
		for (const candidate of candidates) {
			candidate.concept = candidate.conceptId
				? conceptMap.get(candidate.conceptId)
				: undefined;
			if (!candidate.concept || candidate.concept.active === false)
				missingConceptCount++;
		}
	} else {
		for (const candidate of candidates) {
			if (rowConcept(candidate.row))
				candidate.concept = rowConcept(candidate.row);
		}
	}

	if (request.roleName && plan.followUpDomains.includes("filters")) {
		if (!dependencies.filters)
			throw new Error("Dictionary plan requires a filter batch reader.");
		const filterMap = await dependencies.filters.listForConceptRoleBatch(
			conceptIds,
			request.roleName,
		);
		for (const candidate of candidates) {
			candidate.filters = filterMap.get(candidate.conceptId ?? "") ?? [];
		}
	}

	const accepted = candidates.filter((candidate) => {
		if (
			candidate.conceptId &&
			(!candidate.concept || candidate.concept.active === false)
		)
			return false;
		return (
			!request.roleName ||
			isConceptAllowed(candidate.filters ?? [], request.roleName)
		);
	});
	return {
		candidates: accepted,
		queriedSql: plan.statements,
		filteredCount: candidates.length - accepted.length,
		missingConceptCount,
		hydration,
	};
}

async function queryPlanStatements(
	statements: CompiledQuery[],
	runner: DictionarySqlQueryRunner | undefined,
): Promise<Record<string, unknown>[]> {
	if (!runner)
		throw new Error("Dictionary SQL plan requires a SQL query runner.");
	const pages = [];
	for (const statement of statements)
		pages.push(await runner.query(statement.sql, statement.params));
	return pages.flat();
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function rowConcept(row: Record<string, unknown>): Concept | undefined {
	if (typeof row.concept === "object" && row.concept !== null)
		return row.concept as Concept;
	if (typeof row.concept_id !== "string" || typeof row.display !== "string")
		return undefined;
	return {
		id: row.concept_id,
		namespaceCode:
			typeof row.namespace_code === "string" ? row.namespace_code : "",
		standardCode:
			typeof row.standard_code === "string" ? row.standard_code : "",
		display: row.display,
		description:
			typeof row.description === "string" ? row.description : undefined,
		active: row.active !== false,
	};
}
