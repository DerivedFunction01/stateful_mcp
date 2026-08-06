import { describe, expect, test } from "bun:test";
import {
	DEFAULT_SIDEBAR_TAB,
	nextSidebarTab,
	SIDEBAR_TABS,
	sidebarTabForAlt,
} from "../src/components/SidebarActivityBar";

describe("sidebar activity bar", () => {
	test("uses explicit manual views in activity-bar order", () => {
		expect(DEFAULT_SIDEBAR_TAB).toBe("branches");
		expect(SIDEBAR_TABS.map((tab) => tab.id)).toEqual([
			"branches",
			"slots",
			"history",
			"patient",
			"soap",
		]);
	});

	test("maps Alt+1 through Alt+5 to manual views", () => {
		expect(sidebarTabForAlt("1")).toBe("branches");
		expect(sidebarTabForAlt("2")).toBe("slots");
		expect(sidebarTabForAlt("3")).toBe("history");
		expect(sidebarTabForAlt("4")).toBe("patient");
		expect(sidebarTabForAlt("5")).toBe("soap");
	});

	test("cycles all contextual views", () => {
		expect(nextSidebarTab("branches")).toBe("slots");
		expect(nextSidebarTab("history")).toBe("patient");
		expect(nextSidebarTab("branches", -1)).toBe("soap");
	});
});
