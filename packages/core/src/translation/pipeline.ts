import type { PipelineStep, ArgRef } from "./types";

// Resolve one argument reference against the execution environment
function resolveArg(
  arg: ArgRef,
  row: Record<string, unknown>,
  constants: Record<string, unknown>,
  vars: Record<string, unknown>
): unknown {
  if (arg !== null && typeof arg === "object") {
    if ("$init" in arg) return row[arg.$init] !== undefined ? row[arg.$init] : constants[arg.$init];
    if ("$var" in arg) return vars[arg.$var];
    if ("$fn" in arg) {
      if (arg.$fn === "now") return new Date().toISOString().slice(0, 10);
      if (arg.$fn === "utc_time") return new Date().toISOString();
    }
  }
  return arg;  // literal
}

// Execute a full pipeline over one row, threading return_var results as vars
export function executePipeline(
  steps: PipelineStep[],
  row: Record<string, unknown>,
  constants: Record<string, unknown>
): unknown {
  const vars: Record<string, unknown> = {};
  let lastResult: unknown = undefined;

  for (const step of steps) {
    const args = step.args.map((a) => resolveArg(a, row, constants, vars));
    lastResult = applyOp(step, args);

    if (step.return_var !== undefined) {
      vars[step.return_var] = lastResult;
    }
  }

  return lastResult;
}

function applyOp(step: PipelineStep, args: unknown[]): unknown {
  const missing = (fallback: unknown) => {
    if (!step.on_missing || step.on_missing === "null") return null;
    if (step.on_missing === "error") throw new Error(`on_missing: error at op "${step.op}"`);
    if (typeof step.on_missing === "object" && "literal" in step.on_missing) return step.on_missing.literal;
    return fallback;
  };

  switch (step.op) {
    // Arithmetic
    case "add": return Number(args[0]) + Number(args[1]);
    case "sub": return Number(args[0]) - Number(args[1]);
    case "mul": return Number(args[0]) * Number(args[1]);
    case "div": {
      const divisor = Number(args[1]);
      if (divisor === 0) throw new Error("Pipeline: division by zero");
      return Number(args[0]) / divisor;
    }
    case "mod": return Number(args[0]) % Number(args[1]);
    case "exp": return Math.pow(Number(args[0]), Number(args[1]));
    // Comparison
    case "lt":  return (args[0] as any) < (args[1] as any);
    case "leq": return (args[0] as any) <= (args[1] as any);
    case "eq":  return args[0] === args[1];
    case "neq": return args[0] !== args[1];
    case "geq": return (args[0] as any) >= (args[1] as any);
    case "gt":  return (args[0] as any) > (args[1] as any);
    // Date
    case "year": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : d.getFullYear();
    }
    case "month": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : d.getMonth() + 1;
    }
    case "day": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : d.getDate();
    }
    case "quarter": {
      const d = new Date(args[0] as string);
      return isNaN(d.getTime()) ? missing(null) : Math.ceil((d.getMonth() + 1) / 3);
    }
    case "date_diff": {
      const a = new Date(args[0] as string), b = new Date(args[1] as string);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return missing(null);
      return Math.floor((b.getTime() - a.getTime()) / 86_400_000);  // days
    }
    // JSON / nested
    case "json_parse": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      try { return JSON.parse(args[0] as string); }
      catch { return missing(null); }
    }
    case "get": {
      const [obj, ...path] = args;
      if (obj === null || obj === undefined || typeof obj !== "object") return missing(null);
      let cur: unknown = obj;
      for (const segment of path) {
        if (cur === null || cur === undefined) return missing(null);
        cur = (cur as Record<string, unknown>)[segment as string];
      }
      return cur ?? missing(null);
    }
    default:
      throw new Error(`Pipeline: unsupported op "${(step as any).op}"`);
  }
}
