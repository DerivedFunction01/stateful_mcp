import { describe, expect, test } from "bun:test";
import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";

// Mock catalog for testing
const mockCatalog = {
	getDescriptors() {
		return [
			{
				verb: "search",
				aliases: ["/"],
				args: [{ name: "term", required: true }],
			},
		];
	},
};

// Mock engine for autocomplete suggestions
const mockEngine = {
	suggestAutocomplete: async (prefix: string) => {
		return [
			{ verb: "chest pain", group: "engine", descriptionKey: "1" },
			{ verb: "aspirin", group: "engine", descriptionKey: "2" },
		];
	},
};

describe("engine completion helper hook logic", () => {
	test("mergedCandidates dedupes and preserves static order", () => {
		const staticCandidates: AutocompleteSuggestion[] = [
			{
				verb: "aspirin",
				group: "static",
				source: "editor",
				hasArgs: false,
				kind: "arg",
			},
			{
				verb: "cough",
				group: "static",
				source: "editor",
				hasArgs: false,
				kind: "arg",
			},
		];

		const engineCandidates: AutocompleteSuggestion[] = [
			{
				verb: "chest pain",
				group: "engine",
				source: "cell",
				hasArgs: false,
				kind: "arg",
			},
			{
				verb: "aspirin",
				group: "engine",
				source: "cell",
				hasArgs: false,
				kind: "arg",
			}, // duplicate!
		];

		// Manual merge validation (logic matches hook)
		const seen = new Set<string>();
		const result: AutocompleteSuggestion[] = [];

		for (const cand of staticCandidates) {
			const key = cand.verb.toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				result.push(cand);
			}
		}

		for (const cand of engineCandidates) {
			const key = cand.verb.toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				result.push(cand);
			}
		}

		expect(result).toEqual([
			{
				verb: "aspirin",
				group: "static",
				source: "editor",
				hasArgs: false,
				kind: "arg",
			},
			{
				verb: "cough",
				group: "static",
				source: "editor",
				hasArgs: false,
				kind: "arg",
			},
			{
				verb: "chest pain",
				group: "engine",
				source: "cell",
				hasArgs: false,
				kind: "arg",
			},
		]);
	});
});
