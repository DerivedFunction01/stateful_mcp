import type { PipelineStep, ArgRef } from "./types";

function compileArg(
  arg: ArgRef,
  vars: Record<string, string>,
  dialect: "sqlite" | "postgres"
): string {
  if (arg !== null && typeof arg === "object") {
    if ("$init" in arg) {
      return dialect === "sqlite" ? `\`${arg.$init}\`` : `"${arg.$init}"`;
    }
    if ("$var" in arg) {
      return vars[arg.$var] || "NULL";
    }
    if ("$fn" in arg) {
      if (arg.$fn === "now") {
        return dialect === "sqlite" ? "date('now')" : "CURRENT_DATE";
      }
      if (arg.$fn === "utc_time") {
        return dialect === "sqlite" ? "datetime('now')" : "CURRENT_TIMESTAMP";
      }
    }
  }
  if (typeof arg === "string") {
    return `'${arg.replace(/'/g, "''")}'`;
  }
  return String(arg);
}

export function compilePipelineToSQL(
  steps: PipelineStep[],
  dialect: "sqlite" | "postgres"
): string {
  const vars: Record<string, string> = {};
  let lastExpr = "NULL";

  for (const step of steps) {
    const args = step.args.map((a) => compileArg(a, vars, dialect));
    
    switch (step.op) {
      case "add":
        lastExpr = args.length === 0 ? "0" : `(${args.join(" + ")})`;
        break;
      case "sub":
        lastExpr = args.length === 0 ? "0" : args.length === 1 ? `(-${args[0]})` : `(${args.join(" - ")})`;
        break;
      case "mul":
        lastExpr = args.length === 0 ? "1" : `(${args.join(" * ")})`;
        break;
      case "div":
        lastExpr = args.length === 0 ? "0" : `(${args.join(" / ")})`;
        break;
      case "mod":
        lastExpr = args.length === 0 ? "0" : `(${args.join(" % ")})`;
        break;
      case "exp":
        lastExpr = args.length === 0 ? "0" : args.slice(1).reduce((acc, curr) => `POWER(${acc}, ${curr})`, args[0]!);
        break;
      case "lt": {
        const conds = args.slice(1).map((val, i) => `${args[i]} < ${val}`);
        lastExpr = conds.length === 0 ? "1=1" : `(${conds.join(" AND ")})`;
        break;
      }
      case "leq": {
        const conds = args.slice(1).map((val, i) => `${args[i]} <= ${val}`);
        lastExpr = conds.length === 0 ? "1=1" : `(${conds.join(" AND ")})`;
        break;
      }
      case "eq": {
        const conds = args.slice(1).map((val) => `${args[0]} = ${val}`);
        lastExpr = conds.length === 0 ? "1=1" : `(${conds.join(" AND ")})`;
        break;
      }
      case "neq": {
        const conds: string[] = [];
        for (let i = 0; i < args.length; i++) {
          for (let j = i + 1; j < args.length; j++) {
            conds.push(`${args[i]} != ${args[j]}`);
          }
        }
        lastExpr = conds.length === 0 ? "1=1" : `(${conds.join(" AND ")})`;
        break;
      }
      case "geq": {
        const conds = args.slice(1).map((val, i) => `${args[i]} >= ${val}`);
        lastExpr = conds.length === 0 ? "1=1" : `(${conds.join(" AND ")})`;
        break;
      }
      case "gt": {
        const conds = args.slice(1).map((val, i) => `${args[i]} > ${val}`);
        lastExpr = conds.length === 0 ? "1=1" : `(${conds.join(" AND ")})`;
        break;
      }
      case "year":
        lastExpr = dialect === "sqlite"
          ? `CAST(strftime('%Y', ${args[0]}) AS INTEGER)`
          : `EXTRACT(YEAR FROM CAST(${args[0]} AS TIMESTAMP))`;
        break;
      case "month":
        lastExpr = dialect === "sqlite"
          ? `CAST(strftime('%m', ${args[0]}) AS INTEGER)`
          : `EXTRACT(MONTH FROM CAST(${args[0]} AS TIMESTAMP))`;
        break;
      case "day":
        lastExpr = dialect === "sqlite"
          ? `CAST(strftime('%d', ${args[0]}) AS INTEGER)`
          : `EXTRACT(DAY FROM CAST(${args[0]} AS TIMESTAMP))`;
        break;
      case "quarter":
        lastExpr = dialect === "sqlite"
          ? `CAST((strftime('%m', ${args[0]}) + 2) / 3 AS INTEGER)`
          : `EXTRACT(QUARTER FROM CAST(${args[0]} AS TIMESTAMP))`;
        break;
      case "date_diff":
        lastExpr = dialect === "sqlite"
          ? `(julianday(${args[1]}) - julianday(${args[0]}))`
          : `DATE_PART('day', CAST(${args[1]} AS TIMESTAMP) - CAST(${args[0]} AS TIMESTAMP))`;
        break;
      case "json_parse":
        lastExpr = dialect === "sqlite"
          ? `json(${args[0]})`
          : `CAST(${args[0]} AS JSONB)`;
        break;
      case "get": {
        const obj = args[0] || "NULL";
        const path = args.slice(1);
        if (dialect === "sqlite") {
          const simplePath = path.every(p => p && p.startsWith("'") && p.endsWith("'"))
            ? `'$.${path.map(p => p!.slice(1, -1)).join(".")}'`
            : `'$.' || ${path.join(" || '.' || ")}`;
          lastExpr = `json_extract(${obj}, ${simplePath})`;
        } else {
          const segments = path.map(p => {
            const val = p || "NULL";
            return val.startsWith("'") && val.endsWith("'") ? val : `CAST(${val} AS TEXT)`;
          });
          if (segments.length === 0) {
            lastExpr = obj;
          } else {
            const allButLast = segments.slice(0, -1);
            const last = segments[segments.length - 1] || "NULL";
            const middle = allButLast.map(seg => `-> ${seg}`).join(" ");
            lastExpr = `(${obj} ${middle} ->> ${last})`;
          }
        }
        break;
      }
      case "to_string":
        lastExpr = `CAST(${args[0]} AS TEXT)`;
        break;
      case "to_number": {
        const mode = args[1] && (args[1] === "'int'" || args[1] === "'integer'") ? "INTEGER" : (dialect === "sqlite" ? "REAL" : "NUMERIC");
        lastExpr = `CAST(${args[0]} AS ${mode})`;
        break;
      }
      case "round": {
        const decimals = args[1] ?? "0";
        lastExpr = dialect === "sqlite"
          ? `ROUND(${args[0]}, ${decimals})`
          : `ROUND(CAST(${args[0]} AS NUMERIC), ${decimals})`;
        break;
      }
      case "ceil":
        lastExpr = dialect === "sqlite" ? `CEIL(${args[0]})` : `CEILING(${args[0]})`;
        break;
      case "floor":
        lastExpr = `FLOOR(${args[0]})`;
        break;
      case "starts_with": {
        const patterns = args.slice(1);
        if (patterns.length === 0) { lastExpr = "1=1"; break; }
        const conds = patterns.map((p) =>
          dialect === "sqlite" ? `${args[0]} LIKE ${p} || '%'` : `${args[0]} LIKE CONCAT(${p}, '%')`
        );
        lastExpr = `(${conds.join(" OR ")})`;
        break;
      }
      case "ends_with": {
        const patterns = args.slice(1);
        if (patterns.length === 0) { lastExpr = "1=1"; break; }
        const conds = patterns.map((p) =>
          dialect === "sqlite" ? `${args[0]} LIKE '%' || ${p}` : `${args[0]} LIKE CONCAT('%', ${p})`
        );
        lastExpr = `(${conds.join(" OR ")})`;
        break;
      }
      case "contains": {
        let patterns = args.slice(1);
        let mode = "all";
        const last = patterns[patterns.length - 1];
        if (last === "'any'" || last === "'all'") {
          mode = last === "'any'" ? "any" : "all";
          patterns = patterns.slice(0, -1);
        }
        if (patterns.length === 0) { lastExpr = "1=1"; break; }
        const conds = patterns.map((p) =>
          dialect === "sqlite" ? `${args[0]} LIKE '%' || ${p} || '%'` : `${args[0]} LIKE CONCAT('%', ${p}, '%')`
        );
        const joiner = mode === "any" ? " OR " : " AND ";
        lastExpr = `(${conds.join(joiner)})`;
        break;
      }
      case "substring": {
        const start = args[1] ?? "0";
        lastExpr = dialect === "sqlite"
          ? `SUBSTR(${args[0]}, (${start}) + 1${args[2] !== undefined ? `, ${args[2]}` : ""})`
          : `SUBSTRING(${args[0]} FROM (${start}) + 1${args[2] !== undefined ? ` FOR ${args[2]}` : ""})`;
        break;
      }
      case "trim":
        lastExpr = `TRIM(${args[0]})`;
        break;
      case "lower":
        lastExpr = `LOWER(${args[0]})`;
        break;
      case "upper":
        lastExpr = `UPPER(${args[0]})`;
        break;
      case "concat":
        lastExpr = dialect === "sqlite"
          ? `(${args.join(" || ")})`
          : `CONCAT(${args.join(", ")})`;
        break;
      default:
        throw new Error(`Pipeline compiler: unsupported op "${step.op}"`);
    }

    if (step.return_var) {
      vars[step.return_var] = lastExpr;
    }
  }

  return lastExpr;
}
