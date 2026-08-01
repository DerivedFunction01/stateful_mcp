import { describe, expect, test } from "bun:test";
import { countFrequencies, rankHistory } from "../src/session/history-ranker";

describe("countFrequencies", () => {
	test("counts command occurrences", () => {
		const freq = countFrequencies([":run", ":set x", ":run"]);
		expect(freq[":run"]).toBe(2);
		expect(freq[":set x"]).toBe(1);
	});
});

describe("rankHistory", () => {
	test("most recent command ranks first by default", () => {
		const ranked = rankHistory([":run", ":save", ":quit"]);
		expect(ranked[0]).toBe(":run");
	});

	test("frequently used command ranks above single-use", () => {
		const history = [":run", ":set subjective", ":run", ":save"];
		const freq = countFrequencies(history);
		const top = rankHistory(history, { frequency: freq })[0];
		expect(top).toBe(":run");
	});

	test("respects limit", () => {
		const history = [":a", ":b", ":c", ":d", ":e"];
		const ranked = rankHistory(history, { limit: 2 });
		expect(ranked.length).toBeLessThanOrEqual(2);
	});

	test("deduplicates output", () => {
		const ranked = rankHistory([":run", ":run", ":save"]);
		const seen = new Set(ranked);
		expect(seen.size).toBe(ranked.length);
	});
});
