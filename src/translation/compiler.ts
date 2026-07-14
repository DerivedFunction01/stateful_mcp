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
        lastExpr = `(${args[0]} + ${args[1]})`;
        break;
      case "sub":
        lastExpr = `(${args[0]} - ${args[1]})`;
        break;
      case "mul":
        lastExpr = `(${args[0]} * ${args[1]})`;
        break;
      case "div":
        lastExpr = `(${args[0]} / ${args[1]})`;
        break;
      case "mod":
        lastExpr = `(${args[0]} % ${args[1]})`;
        break;
      case "exp":
        lastExpr = `POWER(${args[0]}, ${args[1]})`;
        break;
      case "lt":
        lastExpr = `(${args[0]} < ${args[1]})`;
        break;
      case "leq":
        lastExpr = `(${args[0]} <= ${args[1]})`;
        break;
      case "eq":
        lastExpr = `(${args[0]} = ${args[1]})`;
        break;
      case "neq":
        lastExpr = `(${args[0]} != ${args[1]})`;
        break;
      case "geq":
        lastExpr = `(${args[0]} >= ${args[1]})`;
        break;
      case "gt":
        lastExpr = `(${args[0]} > ${args[1]})`;
        break;
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
      default:
        throw new Error(`Pipeline compiler: unsupported op "${step.op}"`);
    }

    if (step.return_var) {
      vars[step.return_var] = lastExpr;
    }
  }

  return lastExpr;
}
