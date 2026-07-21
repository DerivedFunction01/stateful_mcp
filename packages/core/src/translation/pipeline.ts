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
    if ("$var" in arg) return vars[arg.$var] !== undefined ? vars[arg.$var] : row[arg.$var];
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
    // Arithmetic (Variadic Lisp-style)
    case "add":
      return args.reduce<number>((sum, val) => sum + Number(val), 0);
    case "sub": {
      if (args.length === 0) return 0;
      if (args.length === 1) return -Number(args[0]);
      return args.slice(1).reduce<number>((acc, val) => acc - Number(val), Number(args[0]));
    }
    case "mul":
      return args.reduce<number>((prod, val) => prod * Number(val), 1);
    case "div": {
      if (args.length === 0) return 0;
      return args.slice(1).reduce<number>((acc, val) => {
        const divisor = Number(val);
        if (divisor === 0) throw new Error("Pipeline: division by zero");
        return acc / divisor;
      }, Number(args[0]));
    }
    case "mod": {
      if (args.length === 0) return 0;
      return args.slice(1).reduce<number>((acc, val) => acc % Number(val), Number(args[0]));
    }
    case "exp": {
      if (args.length === 0) return 0;
      return args.slice(1).reduce<number>((acc, val) => Math.pow(acc, Number(val)), Number(args[0]));
    }
    // Comparison (Chained Variadic)
    case "lt":  return args.every((val, i) => i === 0 || (args[i - 1] as any) < (val as any));
    case "leq": return args.every((val, i) => i === 0 || (args[i - 1] as any) <= (val as any));
    case "eq":  return args.every((val) => val === args[0]);
    case "neq": return new Set(args).size === args.length;
    case "geq": return args.every((val, i) => i === 0 || (args[i - 1] as any) >= (val as any));
    case "gt":  return args.every((val, i) => i === 0 || (args[i - 1] as any) > (val as any));
    // Set membership (args[0] = test value, args[1..] = allowed set)
    case "in_set": {
      if (args.length < 2) return false;
      const [testVal, ...set] = args;
      return set.some((member) => member === testVal);
    }
    case "not_in_set": {
      if (args.length < 2) return true;
      const [testVal, ...set] = args;
      return set.every((member) => member !== testVal);
    }
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
    // Conversion & Rounding
    case "to_string": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      return String(args[0]);
    }
    case "to_number": {
      if (args[0] === null || args[0] === undefined || args[0] === "") return missing(null);
      const val = Number(args[0]);
      if (isNaN(val)) return missing(null);
      const mode = typeof args[1] === "string" ? args[1].toLowerCase() : "float";
      if (mode === "int" || mode === "integer") {
        return Math.trunc(val);
      }
      return val;
    }
    case "round": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      const val = Number(args[0]);
      if (isNaN(val)) return missing(null);
      const decimals = typeof args[1] === "number" ? args[1] : 0;
      const factor = Math.pow(10, decimals);
      return Math.round(val * factor) / factor;
    }
    case "ceil": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      const val = Number(args[0]);
      if (isNaN(val)) return missing(null);
      return Math.ceil(val);
    }
    case "floor": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      const val = Number(args[0]);
      if (isNaN(val)) return missing(null);
      return Math.floor(val);
    }
    // String & Pattern Operations (Variadic)
    case "starts_with": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      const str = String(args[0]);
      const prefixes = args.slice(1).map((p) => String(p ?? ""));
      if (prefixes.length === 0) return true;
      return prefixes.some((p) => str.startsWith(p));
    }
    case "ends_with": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      const str = String(args[0]);
      const suffixes = args.slice(1).map((s) => String(s ?? ""));
      if (suffixes.length === 0) return true;
      return suffixes.some((s) => str.endsWith(s));
    }
    case "str_contains": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      let patterns = args.slice(1);
      let matchMode = "all";
      const lastArg = patterns[patterns.length - 1];
      if (typeof lastArg === "string" && (lastArg.toLowerCase() === "all" || lastArg.toLowerCase() === "any")) {
        matchMode = lastArg.toLowerCase();
        patterns = patterns.slice(0, -1);
      }
      if (patterns.length === 0) return true;

      const target = args[0];
      if (Array.isArray(target)) {
        return matchMode === "any"
          ? patterns.some((p) => target.includes(p))
          : patterns.every((p) => target.includes(p));
      }

      const str = String(target);
      return matchMode === "any"
        ? patterns.some((p) => str.includes(String(p ?? "")))
        : patterns.every((p) => str.includes(String(p ?? "")));
    }
    case "substring": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      const str = String(args[0]);
      const start = Number(args[1] ?? 0);
      const len = args[2] !== undefined ? Number(args[2]) : undefined;
      return len !== undefined ? str.slice(start, start + len) : str.slice(start);
    }
    case "trim": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      return String(args[0]).trim();
    }
    case "lower": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      return String(args[0]).toLowerCase();
    }
    case "upper": {
      if (args[0] === null || args[0] === undefined) return missing(null);
      return String(args[0]).toUpperCase();
    }
    case "concat": {
      return args.map((a) => (a === null || a === undefined ? "" : String(a))).join("");
    }
    default:
      throw new Error(`Pipeline: unsupported op "${(step as any).op}"`);
  }
}
