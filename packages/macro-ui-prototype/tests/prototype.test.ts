import { describe, expect, test } from "bun:test";
import { createFixture } from "../src/fixtures";
import { filteredCommands, reducePrototypeState } from "../src/reducer";

describe("macro UI prototype fixtures", () => {
	test("creates domain-neutral core and fixture states", () => {
		const core = createFixture("core");
		const retail = createFixture("retail");
		expect(core.fixture).toBe("core");
		expect(core.activeTabId).toBe("scratchpad");
		expect(retail.fixture).toBe("retail");
		expect(retail.scratchpadLines[0]?.text).toContain("product");
	});
});

describe("macro UI prototype interaction reducer", () => {
	test("switches tabs, views, and sidepanel state", () => {
		let state = createFixture();
		state = reducePrototypeState(state, { type: "tab", id: "notebook" });
		state = reducePrototypeState(state, { type: "view", id: "journal" });
		state = reducePrototypeState(state, { type: "toggle-panel" });
		expect(state.activeTabId).toBe("notebook");
		expect(state.activeViewId).toBe("journal");
		expect(state.sidepanelOpen).toBe(false);
	});

	test("filters and navigates command palette items", () => {
		let state = reducePrototypeState(createFixture(), { type: "palette-open" });
		state = reducePrototypeState(state, { type: "palette-query", query: "journal" });
		expect(filteredCommands(state)).toHaveLength(1);
		expect(filteredCommands(state)[0]?.title).toBe("Open Journal");
		state = reducePrototypeState(state, { type: "palette-move", delta: 1 });
		expect(state.paletteSelection).toBe(0);
	});

	test("supports dropdown and diagram focus states", () => {
		let state = createFixture("retail");
		state = reducePrototypeState(state, { type: "dropdown-select", value: "Grocery" });
		expect(state.selectedDropdownValue).toBe("Grocery");
		state = reducePrototypeState(state, { type: "diagram-node", node: "worker" });
		expect(state.focusedInteractionId).toBe("diagram.worker");
	});
});
