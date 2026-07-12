import type { QueryDefinition, FilterCondition } from "../filter/types";

export class SqliteEngine {
  /**
   * Translates a single filter condition to its SQL WHERE fragment.
   */
  private compileCondition(cond: FilterCondition): string {
    const prop = `\`${cond.property}\``;
    const val = cond.value;

    switch (cond.operator) {
      case "eq":
        return `${prop} = ${this.escapeValue(val)}`;
      case "neq":
        return `${prop} != ${this.escapeValue(val)}`;
      case "gt":
        return `${prop} > ${this.escapeValue(val)}`;
      case "geq":
        return `${prop} >= ${this.escapeValue(val)}`;
      case "lt":
        return `${prop} < ${this.escapeValue(val)}`;
      case "leq":
        return `${prop} <= ${this.escapeValue(val)}`;
      case "like":
        return `${prop} LIKE ${this.escapeValue(`%${val}%`)}`;
      case "not_like":
        return `${prop} NOT LIKE ${this.escapeValue(`%${val}%`)}`;
      case "in_set":
        return `${prop} IN (${this.escapeList(val)})`;
      case "not_in_set":
        return `${prop} NOT IN (${this.escapeList(val)})`;
      case "between":
        if (Array.isArray(val) && val.length === 2) {
          return `${prop} BETWEEN ${this.escapeValue(val[0])} AND ${this.escapeValue(val[1])}`;
        }
        throw new Error("Operator 'between' requires a 2-element array.");
      case "not_between":
        if (Array.isArray(val) && val.length === 2) {
          return `${prop} NOT BETWEEN ${this.escapeValue(val[0])} AND ${this.escapeValue(val[1])}`;
        }
        throw new Error("Operator 'not_between' requires a 2-element array.");
      default:
        throw new Error(`Unsupported SQL operator: ${cond.operator}`);
    }
  }

  private escapeValue(val: any): string {
    if (typeof val === "number") return String(val);
    if (typeof val === "boolean") return val ? "1" : "0";
    if (val === null || val === undefined) return "NULL";
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  private escapeList(val: any): string {
    const list = Array.isArray(val)
      ? val
      : typeof val === "string"
      ? val.split(",").map((s) => s.trim())
      : [val];
    return list.map((v) => this.escapeValue(v)).join(", ");
  }

  /**
   * Compiles a full QueryDefinition into a standard SELECT SQL statement.
   */
  public compile(tableName: string, query: QueryDefinition): string {
    let selectClause = "*";
    let whereClause = "";
    let groupByClause = "";
    let orderByClause = "";
    let limitClause = "";

    // 1. Projections & Aggregations
    if (query.group_by && query.group_by.length > 0) {
      const parts = query.group_by.map((col) => `\`${col}\``);
      if (query.aggregations) {
        query.aggregations.forEach((agg) => {
          let func = "";
          switch (agg.function) {
            case "count":
              func = `COUNT(${agg.property === "*" ? "*" : `\`${agg.property}\``})`;
              break;
            case "count_distinct":
              func = `COUNT(DISTINCT \`${agg.property}\`)`;
              break;
            case "sum":
              func = `SUM(\`${agg.property}\`)`;
              break;
            case "avg":
              func = `AVG(\`${agg.property}\`)`;
              break;
            case "min":
              func = `MIN(\`${agg.property}\`)`;
              break;
            case "max":
              func = `MAX(\`${agg.property}\`)`;
              break;
            default:
              throw new Error(`SQL aggregation function "${agg.function}" not implemented in SQLite example.`);
          }
          parts.push(`${func} AS \`${agg.alias}\``);
        });
      }
      selectClause = parts.join(", ");
      groupByClause = ` GROUP BY ${query.group_by.map((col) => `\`${col}\``).join(", ")}`;
    } else if (query.projections && query.projections.length > 0) {
      selectClause = query.projections.map((col) => `\`${col}\``).join(", ");
    }

    // 2. Filters (WHERE)
    if (query.filters && query.filters.length > 0) {
      whereClause = ` WHERE ${query.filters.map((cond) => this.compileCondition(cond)).join(" AND ")}`;
    }

    // 3. Sorting (ORDER BY)
    if (query.sort && query.sort.length > 0) {
      orderByClause = ` ORDER BY ${query.sort
        .map((s) => `\`${s.property}\` ${s.direction === "desc" ? "DESC" : "ASC"}`)
        .join(", ")}`;
    }

    // 4. Limit
    if (query.limit && query.limit > 0) {
      limitClause = ` LIMIT ${query.limit}`;
    }

    let sql = `SELECT ${selectClause} FROM \`${tableName}\`${whereClause}${groupByClause}${orderByClause}${limitClause}`;

    // 5. Set Operations
    if (query.union) {
      sql = `(${sql}) UNION (${this.compile(tableName, query.union)})`;
    } else if (query.intersect) {
      sql = `(${sql}) INTERSECT (${this.compile(tableName, query.intersect)})`;
    } else if (query.except) {
      sql = `(${sql}) EXCEPT (${this.compile(tableName, query.except)})`;
    }

    return sql;
  }
}
