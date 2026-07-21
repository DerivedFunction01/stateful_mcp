import { Pool } from "pg";
import type { QueryDefinition, FilterCondition } from "../../middleware/filter/types";
import type { QueryEngine } from "./interfaces";
import { registerAdapter } from "../../config/loader";

export class PgQueryEngine implements QueryEngine {
  public supportedOpFamilies = ["comparison", "set", "sort", "aggregation"];
  public supportedOperations = [
    "eq", "neq", "gt", "geq", "lt", "leq", "like", "not_like",
    "starts_with", "ends_with", "str_contains",
    "in_set", "not_in_set", "between", "not_between"
  ];

  private pool: Pool;

  constructor(poolOrConnectionString: Pool | string) {
    if (poolOrConnectionString instanceof Pool) {
      this.pool = poolOrConnectionString;
    } else {
      this.pool = new Pool({ connectionString: poolOrConnectionString });
    }
  }

  private compileCondition(cond: FilterCondition, params: any[]): string {
    const prop = `"${cond.property}"`;
    const val = cond.value;

    switch (cond.operator) {
      case "eq":
        params.push(val);
        return `${prop} = $${params.length}`;
      case "neq":
        params.push(val);
        return `${prop} != $${params.length}`;
      case "gt":
        params.push(val);
        return `${prop} > $${params.length}`;
      case "geq":
        params.push(val);
        return `${prop} >= $${params.length}`;
      case "lt":
        params.push(val);
        return `${prop} < $${params.length}`;
      case "leq":
        params.push(val);
        return `${prop} <= $${params.length}`;
      case "like": {
        const list = Array.isArray(val) ? val : [val];
        if (list.length === 0) return "1=0";
        const conds = list.map((item) => {
          params.push(item);
          return `${prop} LIKE $${params.length}`;
        });
        return `(${conds.join(" OR ")})`;
      }
      case "not_like": {
        const list = Array.isArray(val) ? val : [val];
        if (list.length === 0) return "1=1";
        const conds = list.map((item) => {
          params.push(item);
          return `${prop} NOT LIKE $${params.length}`;
        });
        return `(${conds.join(" AND ")})`;
      }
      case "starts_with": {
        params.push(`${val}%`);
        return `${prop} LIKE $${params.length}`;
      }
      case "ends_with": {
        params.push(`%${val}`);
        return `${prop} LIKE $${params.length}`;
      }
      case "str_contains": {
        params.push(`%${val}%`);
        return `${prop} LIKE $${params.length}`;
      }
      case "in_set": {
        const list = Array.isArray(val) ? val : String(val).split(",").map(s => s.trim());
        const placeholders = list.map((item) => {
          params.push(item);
          return `$${params.length}`;
        }).join(", ");
        return `${prop} IN (${placeholders})`;
      }
      case "not_in_set": {
        const list = Array.isArray(val) ? val : String(val).split(",").map(s => s.trim());
        const placeholders = list.map((item) => {
          params.push(item);
          return `$${params.length}`;
        }).join(", ");
        return `${prop} NOT IN (${placeholders})`;
      }
      case "between":
        if (Array.isArray(val) && val.length === 2) {
          params.push(val[0]);
          const idx1 = `$${params.length}`;
          params.push(val[1]);
          const idx2 = `$${params.length}`;
          return `${prop} BETWEEN ${idx1} AND ${idx2}`;
        }
        throw new Error("Operator 'between' requires a 2-element array.");
      case "not_between":
        if (Array.isArray(val) && val.length === 2) {
          params.push(val[0]);
          const idx1 = `$${params.length}`;
          params.push(val[1]);
          const idx2 = `$${params.length}`;
          return `${prop} NOT BETWEEN ${idx1} AND ${idx2}`;
        }
        throw new Error("Operator 'not_between' requires a 2-element array.");
      default:
        throw new Error(`Unsupported SQL operator: ${cond.operator}`);
    }
  }

  public compile(tableName: string, query: QueryDefinition, params: any[] = []): { sql: string; params: unknown[] } {
    let selectClause = "*";
    let whereClause = "";
    let groupByClause = "";
    let orderByClause = "";
    let limitClause = "";
    let offsetClause = "";

    // 1. Projections & Aggregations
    if (query.group_by && query.group_by.length > 0) {
      const parts = query.group_by.map((col) => `"${col}"`);
      if (query.aggregations) {
        query.aggregations.forEach((agg) => {
          let func = "";
          switch (agg.function) {
            case "count":
              func = `COUNT(${agg.property === "*" ? "*" : `"${agg.property}"`})`;
              break;
            case "count_distinct":
              func = `COUNT(DISTINCT "${agg.property}")`;
              break;
            case "sum":
              func = `SUM("${agg.property}")`;
              break;
            case "avg":
              func = `AVG("${agg.property}")`;
              break;
            case "min":
              func = `MIN("${agg.property}")`;
              break;
            case "max":
              func = `MAX("${agg.property}")`;
              break;
            default:
              throw new Error(`SQL aggregation function "${agg.function}" not implemented in Postgres.`);
          }
          parts.push(`${func} AS "${agg.alias}"`);
        });
      }
      selectClause = parts.join(", ");
      groupByClause = ` GROUP BY ${query.group_by.map((col) => `"${col}"`).join(", ")}`;
    } else if (query.projections && query.projections.length > 0) {
      selectClause = query.projections.map((col) => `"${col}"`).join(", ");
    }

    // 2. Filters (WHERE)
    if (query.filters && query.filters.length > 0) {
      whereClause = ` WHERE ${query.filters.map((cond) => this.compileCondition(cond, params)).join(" AND ")}`;
    }

    // 3. Sorting (ORDER BY)
    if (query.sort && query.sort.length > 0) {
      orderByClause = ` ORDER BY ${query.sort
        .map((s) => `"${s.property}" ${s.direction === "desc" ? "DESC" : "ASC"}`)
        .join(", ")}`;
    }

    // 4. Limit & Offset
    if (query.limit && query.limit > 0) {
      limitClause = ` LIMIT ${query.limit}`;
    }
    if (query.offset && query.offset > 0) {
      offsetClause = ` OFFSET ${query.offset}`;
    }

    let sql = `SELECT ${selectClause} FROM "${tableName}"${whereClause}${groupByClause}${orderByClause}${limitClause}${offsetClause}`;

    // 5. Set Operations
    if (query.union) {
      const sub = this.compile(tableName, query.union, params);
      sql = `(${sql}) UNION (${sub.sql})`;
    } else if (query.intersect) {
      const sub = this.compile(tableName, query.intersect, params);
      sql = `(${sql}) INTERSECT (${sub.sql})`;
    } else if (query.except) {
      const sub = this.compile(tableName, query.except, params);
      sql = `(${sql}) EXCEPT (${sub.sql})`;
    }

    return { sql, params };
  }

  async execute(tableName: string, query: QueryDefinition): Promise<unknown[]> {
    const { sql, params } = this.compile(tableName, query);
    const res = await this.pool.query(sql, params);
    return res.rows;
  }
}

// Register pg-engine adapter
registerAdapter("pg-engine", {
  create: async (options) => {
    const connStr = String(options.connection || options.connectionString || "postgresql://localhost:5432/postgres");
    return new PgQueryEngine(connStr);
  }
});
