import type {
	Aggregation,
	FilterCondition,
	QueryDefinition,
} from "../../middleware/filter/types";
import type { KvBackend } from "../storage/generic/kv/KvBackend";
import type { QueryEngine } from "./interfaces";

function sqlLikeToRegex(pattern: string): RegExp {
	const escapeRegExp = (str: string) =>
		str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = pattern.split(/(%|_)/);
	const regexStr = parts
		.map((part) => {
			if (part === "%") return ".*";
			if (part === "_") return ".";
			return escapeRegExp(part);
		})
		.join("");
	return new RegExp(`^${regexStr}$`, "i");
}

function evaluateLike(val: any, pattern: string): boolean {
	return sqlLikeToRegex(pattern).test(String(val));
}

export function evaluateFilter(row: any, cond: FilterCondition): boolean {
	const val = row[cond.property];
	let target = cond.value;

	if (
		typeof target === "string" &&
		(cond.operator === "between" ||
			cond.operator === "not_between" ||
			cond.operator === "in_set" ||
			cond.operator === "not_in_set")
	) {
		target = target.split(",").map((s) => s.trim());
	}

	switch (cond.operator) {
		case "eq":
			return String(val) === String(target);
		case "neq":
			return String(val) !== String(target);
		case "gt":
			return Number(val) > Number(target);
		case "geq":
			return Number(val) >= Number(target);
		case "lt":
			return Number(val) < Number(target);
		case "leq":
			return Number(val) <= Number(target);
		case "like": {
			const list = Array.isArray(target) ? target : [target];
			return list.some((pat) => evaluateLike(val, String(pat)));
		}
		case "not_like": {
			const list = Array.isArray(target) ? target : [target];
			return list.every((pat) => !evaluateLike(val, String(pat)));
		}
		case "starts_with":
			return String(val).toLowerCase().startsWith(String(target).toLowerCase());
		case "ends_with":
			return String(val).toLowerCase().endsWith(String(target).toLowerCase());
		case "str_contains":
			return String(val).toLowerCase().includes(String(target).toLowerCase());
		case "in_set": {
			const list = Array.isArray(target) ? target : [target];
			return list.map(String).includes(String(val));
		}
		case "not_in_set": {
			const list = Array.isArray(target) ? target : [target];
			return !list.map(String).includes(String(val));
		}
		case "between": {
			if (!Array.isArray(target) || target.length !== 2) return false;
			const n = Number(val);
			return n >= Number(target[0]) && n <= Number(target[1]);
		}
		case "not_between": {
			if (!Array.isArray(target) || target.length !== 2) return false;
			const n = Number(val);
			return n < Number(target[0]) || n > Number(target[1]);
		}
		default:
			return false;
	}
}

export function executeQuery(
	dataset: any[],
	query: QueryDefinition,
): unknown[] {
	let processed = [...dataset];

	// 1. Filtering
	if (query.filters && query.filters.length > 0) {
		processed = processed.filter((row) =>
			query.filters!.every((cond) => evaluateFilter(row, cond)),
		);
	}

	// 2. Sorting
	if (query.sort && query.sort.length > 0) {
		processed.sort((a, b) => {
			for (const instruction of query.sort!) {
				const valA = a[instruction.property];
				const valB = b[instruction.property];
				if (valA !== valB) {
					const order = valA < valB ? -1 : 1;
					return instruction.direction === "desc" ? -order : order;
				}
			}
			return 0;
		});
	}

	// 3. Projections, Group By, Aggregations
	if (query.group_by && query.group_by.length > 0) {
		const groups = new Map<string, any[]>();
		for (const row of processed) {
			const key = query.group_by.map((col) => String(row[col])).join("::");
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(row);
		}

		const aggregatedRows: any[] = [];
		for (const [_, groupRows] of groups.entries()) {
			const sample = groupRows[0]!;
			const outRow: any = {};
			for (const col of query.group_by) {
				outRow[col] = sample[col];
			}

			if (query.aggregations) {
				for (const agg of query.aggregations) {
					outRow[agg.alias] = calculateAggregation(groupRows, agg);
				}
			}
			aggregatedRows.push(outRow);
		}
		processed = aggregatedRows;
	} else if (query.projections && query.projections.length > 0) {
		processed = processed.map((row) => {
			const out: any = {};
			for (const col of query.projections!) {
				out[col] = row[col];
			}
			return out;
		});
	}

	// 4. Limit & Offset
	const offset = query.offset || 0;
	const limit = query.limit;
	if (limit !== undefined && limit > 0) {
		processed = processed.slice(offset, offset + limit);
	} else if (offset > 0) {
		processed = processed.slice(offset);
	}

	// 5. Compound Set Operations
	if (query.union) {
		const subResults = executeQuery(dataset, query.union);
		const unionMap = new Map<string, any>();
		const getKey = (r: any) => r.id || JSON.stringify(r);
		for (const r of [...processed, ...subResults]) {
			unionMap.set(getKey(r), r);
		}
		processed = Array.from(unionMap.values());
	} else if (query.intersect) {
		const subResults = executeQuery(dataset, query.intersect);
		const subKeys = new Set(
			subResults.map((r: any) => r.id || JSON.stringify(r)),
		);
		const getKey = (r: any) => r.id || JSON.stringify(r);
		processed = processed.filter((r) => subKeys.has(getKey(r)));
	} else if (query.except) {
		const subResults = executeQuery(dataset, query.except);
		const subKeys = new Set(
			subResults.map((r: any) => r.id || JSON.stringify(r)),
		);
		const getKey = (r: any) => r.id || JSON.stringify(r);
		processed = processed.filter((r) => !subKeys.has(getKey(r)));
	}

	return processed;
}

function calculateAggregation(rows: any[], agg: Aggregation): any {
	const values = rows
		.map((r) => r[agg.property])
		.filter((v) => v !== undefined && v !== null);
	const nums = values.map(Number).filter((n) => !Number.isNaN(n));

	switch (agg.function) {
		case "count":
			return agg.property === "*" ? rows.length : values.length;
		case "count_distinct":
			return new Set(values).size;
		case "sum":
			return nums.reduce((sum, n) => sum + n, 0);
		case "avg":
			return nums.length === 0
				? 0
				: nums.reduce((sum, n) => sum + n, 0) / nums.length;
		case "min":
			return nums.length === 0 ? 0 : Math.min(...nums);
		case "max":
			return nums.length === 0 ? 0 : Math.max(...nums);
		default:
			throw new Error(`Unsupported aggregation: ${agg.function}`);
	}
}

export class KvQueryEngine implements QueryEngine {
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

	constructor(private backend: KvBackend) {}

	async execute(tableName: string, query: QueryDefinition): Promise<unknown[]> {
		const allData = await this.backend.load();
		let data: any[] = [];
		const directVal = allData[tableName];
		if (Array.isArray(directVal)) {
			data = directVal;
		} else {
			data = Object.entries(allData)
				.filter(([k]) => k.startsWith(`${tableName}::`))
				.map(([_, v]) => v);
		}
		return executeQuery(data, query);
	}
}
