import type {
	FilterCondition,
	QueryDefinition,
} from "../../middleware/filter/types";
import type {
	QueryCondition,
	QueryField,
	QuerySort,
	SelectQuery,
} from "../../translation/sql-compiler";
import { QueryCompiler } from "../../translation/sql-compiler";
import type { SqlBackend } from "../storage/sql/backend";
import type { QueryEngine } from "./interfaces";

export class SqlQueryEngine implements QueryEngine {
	public supportedOpFamilies = ["comparison", "set", "sort", "aggregation"];
	public supportedOperations = [
		"eq",
		"neq",
		"gt",
		"geq",
		"lt",
		"leq",
		"like",
		"not_like",
		"starts_with",
		"ends_with",
		"str_contains",
		"in_set",
		"not_in_set",
		"between",
		"not_between",
	];

	private compiler: QueryCompiler;

	constructor(private backend: SqlBackend) {
		this.compiler = new QueryCompiler(backend.dialect);
	}

	public compile(
		tableName: string,
		query: QueryDefinition,
	): { sql: string; params: unknown[] } {
		const ast = mapQueryDefinitionToSelectQuery(tableName, query);
		return this.compiler.compileSelect(ast);
	}

	async execute(tableName: string, query: QueryDefinition): Promise<unknown[]> {
		const { sql, params } = this.compile(tableName, query);
		return this.backend.query(sql, params);
	}
}

export function mapQueryDefinitionToSelectQuery(
	tableName: string,
	query: QueryDefinition,
): SelectQuery {
	const select: QueryField[] = [];

	if (query.group_by && query.group_by.length > 0) {
		for (const col of query.group_by) {
			select.push({ column: col });
		}
		if (query.aggregations) {
			for (const agg of query.aggregations) {
				let raw = "";
				const colEscaped =
					agg.property === "*" ? "*" : `"${agg.property.replace(/"/g, '""')}"`;
				switch (agg.function) {
					case "count":
						raw = `COUNT(${colEscaped})`;
						break;
					case "count_distinct":
						raw = `COUNT(DISTINCT ${colEscaped})`;
						break;
					case "sum":
						raw = `SUM(${colEscaped})`;
						break;
					case "avg":
						raw = `AVG(${colEscaped})`;
						break;
					case "min":
						raw = `MIN(${colEscaped})`;
						break;
					case "max":
						raw = `MAX(${colEscaped})`;
						break;
					default:
						throw new Error(
							`Unsupported aggregation function: ${agg.function}`,
						);
				}
				select.push({ raw, alias: agg.alias });
			}
		}
	} else if (query.projections && query.projections.length > 0) {
		for (const col of query.projections) {
			select.push({ column: col });
		}
	}

	const where: QueryCondition[] = [];
	if (query.filters) {
		for (const cond of query.filters) {
			where.push(mapFilterConditionToQueryCondition(cond));
		}
	}

	const orderBy: QuerySort[] = [];
	if (query.sort) {
		for (const s of query.sort) {
			orderBy.push({
				column: s.property,
				direction: s.direction === "desc" ? "DESC" : "ASC",
			});
		}
	}

	const ast: SelectQuery = {
		table: tableName,
		select: select.length > 0 ? select : undefined,
		where: where.length > 0 ? where : undefined,
		groupBy:
			query.group_by && query.group_by.length > 0
				? query.group_by.map((c) => ({ column: c }))
				: undefined,
		orderBy: orderBy.length > 0 ? orderBy : undefined,
		limit: query.limit,
		offset: query.offset,
	};

	if (query.union) {
		ast.compoundOps = [
			{
				operator: "UNION",
				query: mapQueryDefinitionToSelectQuery(tableName, query.union),
			},
		];
	} else if (query.intersect) {
		ast.compoundOps = [
			{
				operator: "INTERSECT",
				query: mapQueryDefinitionToSelectQuery(tableName, query.intersect),
			},
		];
	} else if (query.except) {
		ast.compoundOps = [
			{
				operator: "EXCEPT",
				query: mapQueryDefinitionToSelectQuery(tableName, query.except),
			},
		];
	}

	return ast;
}

function mapFilterConditionToQueryCondition(
	cond: FilterCondition,
): QueryCondition {
	const base: QueryCondition = {
		column: cond.property,
		op: cond.operator as any,
	};

	const val = cond.value;

	if (cond.operator === "like" || cond.operator === "not_like") {
		const list = Array.isArray(val) ? val : [val];
		if (list.length === 0) {
			return cond.operator === "like"
				? { raw: "1=0", op: "eq" }
				: { raw: "1=1", op: "eq" };
		}
		const conds = list.map((item) => ({
			column: cond.property,
			op: cond.operator,
			value: item,
		}));
		return cond.operator === "like"
			? { OR: conds as any[] }
			: { AND: conds as any[] };
	}

	if (cond.operator === "starts_with") {
		base.op = "like";
		base.value = `${val}%`;
	} else if (cond.operator === "ends_with") {
		base.op = "like";
		base.value = `%${val}`;
	} else if (cond.operator === "str_contains") {
		base.op = "like";
		base.value = `%${val}%`;
	} else if (cond.operator === "in_set" || cond.operator === "not_in_set") {
		const list = Array.isArray(val)
			? val
			: String(val)
					.split(",")
					.map((s) => s.trim());
		base.values = list;
	} else if (cond.operator === "between" || cond.operator === "not_between") {
		if (Array.isArray(val) && val.length === 2) {
			base.values = val;
		} else {
			throw new Error(
				`Operator '${cond.operator}' requires a 2-element array.`,
			);
		}
	} else {
		base.value = val;
	}

	return base;
}
