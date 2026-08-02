import { describe, expect, test } from "bun:test";
import {
	getSearchMatches,
	INITIAL_SEARCH_STATE,
	searchReducer,
} from "../src/components/SearchOverlay";
import { commandResultToEffects } from "../src/lib/windows/notebook/extension";

const mockCells = [
	{ cellId: "c1", rawInput: "Patient complains of chest pain" },
	{ cellId: "c2", rawInput: "Heart rate is elevated" },
	{ cellId: "c3", rawInput: "Prescribed aspirin for pain" },
];

describe("Search overlay state & mapping", () => {
	test("getSearchMatches returns matching cell IDs case-insensitively", () => {
		const matches = getSearchMatches("pain", mockCells);
		expect(matches).toEqual(["c1", "c3"]);

		const matchesLower = getSearchMatches("chest", mockCells);
		expect(matchesLower).toEqual(["c1"]);

		const noMatches = getSearchMatches("unknown", mockCells);
		expect(noMatches).toEqual([]);
	});

	test("search reducer OPEN and UPDATE_QUERY", () => {
		let state = INITIAL_SEARCH_STATE;
		state = searchReducer(state, {
			type: "OPEN",
			query: "pain",
			cells: mockCells,
		});

		expect(state.open).toBe(true);
		expect(state.query).toBe("pain");
		expect(state.matches).toEqual(["c1", "c3"]);
		expect(state.matchIndex).toBe(0);

		state = searchReducer(state, {
			type: "UPDATE_QUERY",
			query: "chest",
			cells: mockCells,
		});
		expect(state.query).toBe("chest");
		expect(state.matches).toEqual(["c1"]);
		expect(state.matchIndex).toBe(0);
	});

	test("search reducer NEXT, PREV cycling and wraparound", () => {
		let state = INITIAL_SEARCH_STATE;
		state = searchReducer(state, {
			type: "OPEN",
			query: "pain",
			cells: mockCells,
		}); // c1, c3

		expect(state.matchIndex).toBe(0); // c1

		state = searchReducer(state, { type: "NEXT" });
		expect(state.matchIndex).toBe(1); // c3

		state = searchReducer(state, { type: "NEXT" });
		expect(state.matchIndex).toBe(0); // wraparound to c1

		state = searchReducer(state, { type: "PREV" });
		expect(state.matchIndex).toBe(1); // wraparound back to c3
	});

	test("search reducer CLOSE and CLEAR", () => {
		let state = INITIAL_SEARCH_STATE;
		state = searchReducer(state, {
			type: "OPEN",
			query: "pain",
			cells: mockCells,
		});

		state = searchReducer(state, { type: "CLOSE" });
		expect(state.open).toBe(false);
		expect(state.query).toBe("pain"); // query is preserved on close

		state = searchReducer(state, { type: "CLEAR" });
		expect(state.open).toBe(false);
		expect(state.query).toBe("");
		expect(state.matches).toEqual([]);
	});

	test("command mappings convert search and clear_search to router effects", () => {
		const searchEffects = commandResultToEffects({
			success: true,
			action: "search",
			data: { query: "pain" },
		});
		expect(searchEffects).toEqual([
			{ type: "router.open", route: "search", payload: { query: "pain" } },
		]);

		const clearEffects = commandResultToEffects({
			success: true,
			action: "clear_search",
		});
		expect(clearEffects).toEqual([{ type: "router.close" }]);
	});
});
