import { sanitizeTrial } from "../../app/dashboard/analysis/constants";

export interface FilterCondition {
  property: string;
  operator:
    | "eq"
    | "neq"
    | "gt"
    | "geq"
    | "lt"
    | "leq"
    | "like"
    | "not_like"
    | "in_set"
    | "not_in_set"
    | "between"
    | "not_between";
  value: any;
}

export interface Aggregation {
  function:
    | "count"
    | "count_distinct"
    | "sum"
    | "avg"
    | "min"
    | "max"
    | "std_dev"
    | "median"
    | "q1"
    | "q3"
    | "range"
    | "stat";
  property: string; // use '*' or any field for count
  alias: string;
}

export interface SortInstruction {
  property: string;
  direction: "asc" | "desc";
}

export interface QueryDefinition {
  table?: "scans" | "trials";
  sourceViewId?: string;
  filters?: FilterCondition[];
  projections?: string[];
  group_by?: string[];
  aggregations?: Aggregation[];
  sort?: SortInstruction[];
  limit?: number;

  // Set operations
  union?: QueryDefinition;
  intersect?: QueryDefinition;
  except?: QueryDefinition; // Difference
}

// Evaluate a single filter condition on a row
function evaluateFilter(row: any, cond: FilterCondition): boolean {
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

  // Handle date properties specifically
  if (cond.property === "createdAt" && val) {
    try {
      val = new Date(val).getTime();
      if (typeof target === "string") {
        target = new Date(target).getTime();
      } else if (Array.isArray(target)) {
        target = target.map((t) => new Date(t).getTime());
      }
    } catch {}
  } else if (typeof val === "number") {
    // Convert targets to numbers if field is number
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

// Helper to deduplicate arrays of objects by id or JSON representation
function deduplicate(rows: any[]): any[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.id || JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Statistical helpers ────────────────────────────────────────────────────

/** Sample standard deviation (ddof=1, matches pandas default). */
function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance =
    nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

/** Linear-interpolated percentile (matches numpy/pandas default). */
function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Main execution function
export function executeQuery(
  scans: any[],
  query: QueryDefinition,
  allSavedQueries: any[] = [],
): any[] {
  // 1. Gather starting dataset
  let dataset: any[] = [];
  if (query.sourceViewId) {
    const parent = allSavedQueries.find((q) => q.id === query.sourceViewId);
    if (!parent) {
      throw new Error(
        `Parent view ID "${query.sourceViewId}" not found in saved queries.`,
      );
    }
    dataset = executeQuery(scans, parent.query, allSavedQueries);
  } else if (query.table === "scans") {
    dataset = scans;
  } else if (query.table === "trials") {
    // Flatten trials across all scans, mapping parent scan info for joins/context
    dataset = scans.flatMap((scan) => {
      const scanTrials = Array.isArray(scan.trials)
        ? scan.trials
        : typeof scan.trials === "string"
          ? JSON.parse(scan.trials)
          : [];
      return scanTrials.map((t: any) =>
        sanitizeTrial({
          ...t,
          scanId: scan.id,
          reportId: scan.reportId,
          targetModel: scan.targetModel,
          attackerModel: scan.attackerModel,
          forbiddenTask: scan.forbiddenTask,
          createdAt: scan.createdAt,
        }),
      );
    });
  }

  // Populate virtual date fields for any dataset that has a createdAt column
  dataset = dataset.map((row) => {
    if (row.createdAt && row.createdAt_year === undefined) {
      const dateObj = new Date(row.createdAt);
      if (!isNaN(dateObj.getTime())) {
        return {
          ...row,
          createdAt_year: dateObj.getFullYear(),
          createdAt_month: dateObj.getMonth() + 1,
          createdAt_day: dateObj.getDate(),
        };
      }
    }
    return row;
  });

  // Explode tags[] -> tag (singular) if the query references the virtual "tag" field.
  // Each scan row becomes one row per tag; rows with no tags are dropped (like UNNEST).
  const referencesTag = [
    ...(query.filters ?? []).map((f) => f.property),
    ...(query.projections ?? []),
    ...(query.group_by ?? []),
    ...(query.sort ?? []).map((s) => s.property),
  ].includes("tag");

  if (referencesTag) {
    dataset = dataset.flatMap((row) => {
      const tagsArr: string[] = Array.isArray(row.tags)
        ? row.tags
        : typeof row.tags === "string"
          ? JSON.parse(row.tags)
          : [];
      if (tagsArr.length === 0) return [];
      return tagsArr.map((t: string) => ({ ...row, tag: t }));
    });
  }

  let filtered = dataset;
  if (query.filters && query.filters.length > 0) {
    filtered = dataset.filter((row) => {
      return query.filters!.every((cond) => evaluateFilter(row, cond));
    });
  }

  // 3. Handle Grouping & Aggregations
  let processed = filtered;
  if (query.group_by && query.group_by.length > 0) {
    const groups: { [key: string]: any[] } = {};
    filtered.forEach((row) => {
      const groupKey = query
        .group_by!.map((prop) => String(row[prop] ?? ""))
        .join("||");
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(row);
    });

    processed = Object.keys(groups).map((key) => {
      const rows = groups[key];
      const resultRow: any = {};

      // Keep group columns
      query.group_by!.forEach((prop) => {
        resultRow[prop] = rows[0][prop];
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
              resultRow[agg.alias] = values.reduce(
                (sum, v) => sum + (Number(v) || 0),
                0,
              );
              break;
            case "avg":
              resultRow[agg.alias] =
                values.length > 0
                  ? values.reduce((sum, v) => sum + (Number(v) || 0), 0) /
                    values.length
                  : 0;
              break;
            case "min":
              resultRow[agg.alias] =
                values.length > 0 ? Math.min(...values.map(Number)) : null;
              break;
            case "max":
              resultRow[agg.alias] =
                values.length > 0 ? Math.max(...values.map(Number)) : null;
              break;
            case "std_dev": {
              const nums = values.map(Number);
              resultRow[agg.alias] =
                nums.length >= 2 ? Number(stdDev(nums).toFixed(4)) : 0;
              break;
            }
            case "median": {
              const nums = values.map(Number);
              resultRow[agg.alias] =
                nums.length > 0 ? Number(percentile(nums, 50).toFixed(4)) : 0;
              break;
            }
            case "q1": {
              const nums = values.map(Number);
              resultRow[agg.alias] =
                nums.length > 0 ? Number(percentile(nums, 25).toFixed(4)) : 0;
              break;
            }
            case "q3": {
              const nums = values.map(Number);
              resultRow[agg.alias] =
                nums.length > 0 ? Number(percentile(nums, 75).toFixed(4)) : 0;
              break;
            }
            case "range": {
              const nums = values.map(Number);
              resultRow[agg.alias] =
                nums.length > 0
                  ? Number((Math.max(...nums) - Math.min(...nums)).toFixed(4))
                  : 0;
              break;
            }
            case "stat": {
              const nums = values.map(Number).filter((v) => !isNaN(v));
              if (nums.length === 0) {
                resultRow[agg.alias] = {
                  min: 0,
                  q1: 0,
                  median: 0,
                  q3: 0,
                  max: 0,
                  mean: 0,
                  count: 0,
                  _isStatObj: true,
                };
              } else {
                const sortedNums = [...nums].sort((a, b) => a - b);
                const sumVal = sortedNums.reduce((s, x) => s + x, 0);
                resultRow[agg.alias] = {
                  min: sortedNums[0],
                  q1: Number(percentile(sortedNums, 25).toFixed(4)),
                  median: Number(percentile(sortedNums, 50).toFixed(4)),
                  q3: Number(percentile(sortedNums, 75).toFixed(4)),
                  max: sortedNums[sortedNums.length - 1],
                  mean: Number((sumVal / sortedNums.length).toFixed(4)),
                  count: sortedNums.length,
                  _isStatObj: true,
                };
              }
              break;
            }
          }
        });
      }
      return resultRow;
    });
  }

  // 4. Projections (Select columns)
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

  // 5. Multi-column Sort
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

  // 6. Limit
  if (query.limit && query.limit > 0) {
    processed = processed.slice(0, query.limit);
  }

  // 7. Set Operations (UNION, INTERSECT, EXCEPT)
  if (query.union) {
    const unionResults = executeQuery(scans, query.union, allSavedQueries);
    processed = deduplicate([...processed, ...unionResults]);
  }

  if (query.intersect) {
    const intersectResults = executeQuery(
      scans,
      query.intersect,
      allSavedQueries,
    );
    const intersectKeys = new Set(
      intersectResults.map((r) => r.id || JSON.stringify(r)),
    );
    processed = processed.filter((r) =>
      intersectKeys.has(r.id || JSON.stringify(r)),
    );
  }

  if (query.except) {
    const exceptResults = executeQuery(scans, query.except, allSavedQueries);
    const exceptKeys = new Set(
      exceptResults.map((r) => r.id || JSON.stringify(r)),
    );
    processed = processed.filter(
      (r) => !exceptKeys.has(r.id || JSON.stringify(r)),
    );
  }

  return processed;
}

export interface PivotDefinition {
  rowKey: string;
  colKey: string;
  valueKey: string;
  aggType: "count" | "sum" | "avg";
}

export function executePivot(
  data: any[],
  pivot: PivotDefinition,
): { pivotedData: any[]; columns: string[] } {
  const rowMap = new Map<
    string,
    { [key: string]: any; _values: { [key: string]: number[] } }
  >();
  const allColValues = new Set<string>();

  for (const row of data) {
    const rVal = String(row[pivot.rowKey] ?? "unknown");
    const cVal = String(row[pivot.colKey] ?? "unknown");
    let vVal = 0;
    if (pivot.valueKey === "*") {
      vVal = 1;
    } else {
      vVal = Number(row[pivot.valueKey] ?? 0);
    }

    allColValues.add(cVal);

    if (!rowMap.has(rVal)) {
      rowMap.set(rVal, {
        [pivot.rowKey]: rVal,
        _values: {},
      });
    }

    const rowGroup = rowMap.get(rVal)!;
    if (!rowGroup._values[cVal]) {
      rowGroup._values[cVal] = [];
    }
    rowGroup._values[cVal].push(vVal);
  }

  const columns = Array.from(allColValues).sort();
  const pivotedData: any[] = [];

  for (const [rVal, rowGroup] of rowMap.entries()) {
    const pivotedRow: any = { [pivot.rowKey]: rVal };
    for (const col of columns) {
      const list = rowGroup._values[col] || [];
      if (pivot.aggType === "count") {
        pivotedRow[col] = list.length;
      } else if (pivot.aggType === "sum") {
        pivotedRow[col] = list.reduce((a, b) => a + b, 0);
      } else if (pivot.aggType === "avg") {
        pivotedRow[col] = list.length
          ? Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(2))
          : 0;
      }
    }
    pivotedData.push(pivotedRow);
  }

  return { pivotedData, columns };
}
