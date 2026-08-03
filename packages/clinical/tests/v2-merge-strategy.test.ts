import { describe, expect, it } from "bun:test";
import {
	applyMerge,
	MERGE_STRATEGIES,
	writePolicyToMergeStrategy,
} from "../src/v2/values/merge";

describe("V2 merge strategy vocabulary", () => {
	it("exposes the four canonical strategies", () => {
		expect(MERGE_STRATEGIES).toEqual([
			"replace",
			"append",
			"deep_merge",
			"partial_fill",
		]);
	});

	it("replace overwrites the existing value", () => {
		expect(applyMerge({ a: 1 }, { b: 2 }, "replace")).toEqual({ b: 2 });
		expect(applyMerge(1, 2, "replace")).toBe(2);
	});

	it("append pushes onto an array and coerces scalars", () => {
		expect(applyMerge([1, 2], 3, "append")).toEqual([1, 2, 3]);
		expect(applyMerge(1, 2, "append")).toEqual([1, 2]);
		expect(applyMerge(undefined, 2, "append")).toEqual([2]);
		expect(applyMerge(null, 2, "append")).toEqual([2]);
	});

	it("deep_merge shallow-merges incoming into existing", () => {
		expect(applyMerge({ a: 1, c: 3 }, { a: 2, b: 4 }, "deep_merge")).toEqual({
			a: 2,
			c: 3,
			b: 4,
		});
		expect(applyMerge({ a: 1 }, 5, "deep_merge")).toBe(5);
	});

	it("partial_fill lets existing populated fields win", () => {
		expect(applyMerge({ a: 1 }, { a: 2, b: 4 }, "partial_fill")).toEqual({
			a: 1,
			b: 4,
		});
		expect(applyMerge(7, 8, "partial_fill")).toBe(7);
		expect(applyMerge(undefined, 8, "partial_fill")).toBe(8);
	});

	it("maps clinical write policies onto canonical strategies", () => {
		expect(writePolicyToMergeStrategy("upsert")).toBe("deep_merge");
		expect(writePolicyToMergeStrategy("patch")).toBe("partial_fill");
		expect(writePolicyToMergeStrategy("append")).toBe("append");
		expect(writePolicyToMergeStrategy("replace")).toBe("replace");
	});
});
