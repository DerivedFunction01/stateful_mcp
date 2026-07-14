import type { QueryDefinition, FilterCondition } from "../filter/types";

// Evaluate a single filter condition on a row
export function evaluateFilter(row: any, cond: FilterCondition): boolean {
  let val = row[cond.property];
  let target = cond.value;

  // Pre-process comma-separated inputs for array-based operators
  if (
    typeof target === "string" &&
    (cond.operator === "between" ||
      cond.operator === "not_between" ||
      cond.operator === "in_set" ||
      cond.operator === "not_in_set")
  ) {
    target = target.split(",").map((s) => s.trim());
  }

  // Type-coercion based on property value type
  if (typeof val === "number") {
    if (typeof target === "string") {
      target = Number(target);
    } else if (Array.isArray(target)) {
      target = target.map((t) => (t === "" ? 0 : Number(t)));
    }
  }

  // Handle missing properties
  if (val === undefined || val === null) {
    if (cond.operator === "neq") return true;
    if (cond.operator === "not_in_set") return true;
    return false;
  }

  switch (cond.operator) {
    case "eq":
      return String(val).toLowerCase() === String(target).toLowerCase();
    case "neq":
      return String(val).toLowerCase() !== String(target).toLowerCase();
    case "gt":
      return val > target;
    case "geq":
      return val >= target;
    case "lt":
      return val < target;
    case "leq":
      return val <= target;
    case "like":
      return String(val).toLowerCase().includes(String(target).toLowerCase());
    case "not_like":
      return !String(val).toLowerCase().includes(String(target).toLowerCase());
    case "in_set":
      if (Array.isArray(target)) {
        return target
          .map((t) => String(t).toLowerCase())
          .includes(String(val).toLowerCase());
      }
      if (Array.isArray(val)) {
        return val
          .map((t) => String(t).toLowerCase())
          .includes(String(target).toLowerCase());
      }
      return false;
    case "not_in_set":
      if (Array.isArray(target)) {
        return !target
          .map((t) => String(t).toLowerCase())
          .includes(String(val).toLowerCase());
      }
      if (Array.isArray(val)) {
        return !val
          .map((t) => String(t).toLowerCase())
          .includes(String(target).toLowerCase());
      }
      return true;
    case "between":
      if (Array.isArray(target) && target.length === 2) {
        return val >= target[0] && val <= target[1];
      }
      return false;
    case "not_between":
      if (Array.isArray(target) && target.length === 2) {
        return val < target[0] || val > target[1];
      }
      return true;
    default:
      return false;
  }
}

// Deduplicate rows by id or string representation
function deduplicate(rows: any[]): any[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.id || JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance =
    nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi
    ? (sorted[lo] ?? 0)
    : (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (idx - lo);
}

export function executeQuery(
  dataset: any[],
  query: QueryDefinition
): any[] {
  let processed = [...dataset];

  // 1. Filter
  if (query.filters && query.filters.length > 0) {
    processed = processed.filter((row) => {
      return query.filters!.every((cond) => evaluateFilter(row, cond));
    });
  }

  // 2. Group By & Aggregations
  if (query.group_by && query.group_by.length > 0) {
    const groups: Record<string, any[]> = {};
    processed.forEach((row) => {
      const groupKey = query
        .group_by!.map((prop) => String(row[prop] ?? ""))
        .join("||");
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey]!.push(row);
    });

    processed = Object.keys(groups).map((key) => {
      const rows = groups[key] || [];
      const resultRow: any = {};

      // Keep group columns
      query.group_by!.forEach((prop) => {
        if (rows[0]) {
          resultRow[prop] = rows[0][prop];
        }
      });

      // Calculate aggregations
      if (query.aggregations) {
        query.aggregations.forEach((agg) => {
          const values = rows
            .map((r) => r[agg.property])
            .filter((v) => v !== undefined && v !== null);

          switch (agg.function) {
            case "count":
              resultRow[agg.alias] = rows.length;
              break;
            case "count_distinct":
              resultRow[agg.alias] = new Set(values).size;
              break;
            case "sum":
              resultRow[agg.alias] = values.reduce((sum, v) => sum + (Number(v) || 0), 0);
              break;
            case "avg":
              resultRow[agg.alias] =
                values.length > 0
                  ? values.reduce((sum, v) => sum + (Number(v) || 0), 0) / values.length
                  : 0;
              break;
            case "min":
              resultRow[agg.alias] = values.length > 0 ? Math.min(...values.map(Number)) : null;
              break;
            case "max":
              resultRow[agg.alias] = values.length > 0 ? Math.max(...values.map(Number)) : null;
              break;
            case "std_dev":
              resultRow[agg.alias] = Number(stdDev(values.map(Number)).toFixed(4));
              break;
            case "median":
              resultRow[agg.alias] = Number(percentile(values.map(Number), 50).toFixed(4));
              break;
            case "q1":
              resultRow[agg.alias] = Number(percentile(values.map(Number), 25).toFixed(4));
              break;
            case "q3":
              resultRow[agg.alias] = Number(percentile(values.map(Number), 75).toFixed(4));
              break;
            case "range": {
              const nums = values.map(Number);
              resultRow[agg.alias] = nums.length > 0 ? Math.max(...nums) - Math.min(...nums) : 0;
              break;
            }
          }
        });
      }
      return resultRow;
    });
  }

  // 3. Projections
  if (
    query.projections &&
    query.projections.length > 0 &&
    (!query.group_by || query.group_by.length === 0)
  ) {
    processed = processed.map((row) => {
      const projectedRow: any = {};
      query.projections!.forEach((prop) => {
        projectedRow[prop] = row[prop];
      });
      return projectedRow;
    });
  }

  // 4. Sort
  if (query.sort && query.sort.length > 0) {
    processed.sort((a, b) => {
      for (const inst of query.sort!) {
        const valA = a[inst.property];
        const valB = b[inst.property];
        if (valA === valB) continue;
        const dirMultiplier = inst.direction === "desc" ? -1 : 1;
        if (typeof valA === "number" && typeof valB === "number") {
          return (valA - valB) * dirMultiplier;
        }
        return String(valA).localeCompare(String(valB)) * dirMultiplier;
      }
      return 0;
    });
  }

  // 5. Limit
  if (query.limit && query.limit > 0) {
    processed = processed.slice(0, query.limit);
  }

  // 6. Set Operations
  if (query.union) {
    const unionResults = executeQuery(dataset, query.union);
    processed = deduplicate([...processed, ...unionResults]);
  }

  if (query.intersect) {
    const intersectResults = executeQuery(dataset, query.intersect);
    const intersectKeys = new Set(intersectResults.map((r) => r.id || JSON.stringify(r)));
    processed = processed.filter((r) => intersectKeys.has(r.id || JSON.stringify(r)));
  }

  if (query.except) {
    const exceptResults = executeQuery(dataset, query.except);
    const exceptKeys = new Set(exceptResults.map((r) => r.id || JSON.stringify(r)));
    processed = processed.filter((r) => !exceptKeys.has(r.id || JSON.stringify(r)));
  }

  return processed;
}
