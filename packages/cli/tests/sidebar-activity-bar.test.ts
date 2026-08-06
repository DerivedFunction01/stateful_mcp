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
		]);
	});

	test("maps Alt+1 through Alt+3 to manual views", () => {
		expect(sidebarTabForAlt("1")).toBe("branches");
		expect(sidebarTabForAlt("2")).toBe("slots");
		expect(sidebarTabForAlt("3")).toBe("history");
		expect(sidebarTabForAlt("4")).toBeNull();
	});

	test("cycles manual views without an automatic context tab", () => {
		expect(nextSidebarTab("branches")).toBe("slots");
		expect(nextSidebarTab("history")).toBe("branches");
		expect(nextSidebarTab("branches", -1)).toBe("history");
	});
});
