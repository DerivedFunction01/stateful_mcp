import { describe, expect, test } from "bun:test";
import { createFixture } from "../src/fixtures";
import { filteredCommands, reducePrototypeState } from "../src/reducer";

describe("macro UI prototype fixtures", () => {
	test("creates domain-neutral core and fixture states", () => {
		const core = createFixture("core");
		const retail = createFixture("retail");
		expect(core.fixture).toBe("core");
		expect(core.activeTabId).toBe("scratchpad");
		expect(core.activeActivityViewId).toBe("workspace");
		expect(core.activeInspectorViewId).toBe("explorer");
		expect(core.inspectorMode).toBe("follow");
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
		expect(state.activeInspectorViewId).toBe("journal");
		state = reducePrototypeState(state, { type: "inspector-pin" });
		state = reducePrototypeState(state, { type: "tab", id: "pos" });
		expect(state.inspectorMode).toBe("pinned");
		expect(state.activeInspectorViewId).toBe("journal");
		state = reducePrototypeState(state, { type: "inspector-pin" });
		expect(state.inspectorMode).toBe("follow");
		expect(state.panelRegions.inspector.open).toBe(false);
		state = reducePrototypeState(state, { type: "dock-region", region: "activity", dock: "end" });
		expect(state.panelRegions.activity.dock).toBe("end");
		state = reducePrototypeState(state, { type: "activity-view", id: "sessions" });
		expect(state.activeActivityViewId).toBe("sessions");
		expect(state.activeInspectorViewId).toBe("journal");
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
