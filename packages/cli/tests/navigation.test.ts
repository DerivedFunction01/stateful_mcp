import { describe, expect, test } from "bun:test";
import { getSearchMatches } from "../src/components/SearchOverlay";
import { navigationDirectionFor } from "../src/lib/editor/navigation";

describe("navigation routing", () => {
	test("maps document movement to navigation directions", () => {
		expect(navigationDirectionFor({ type: "move", delta: -1 })).toBe("up");
		expect(navigationDirectionFor({ type: "move", delta: 1 })).toBe("down");
		expect(navigationDirectionFor({ type: "setActive", index: 2 })).toBeNull();
	});

	test("searches branch-like navigation records independently of cells", () => {
		const branches = [
			{ cellId: "pe", authored: { rawText: "pulmonary embolism tachycardia" } },
			{ cellId: "pna", authored: { rawText: "pneumonia fever" } },
		];

		expect(getSearchMatches("tachy", branches)).toEqual(["pe"]);
		expect(getSearchMatches("", branches)).toEqual([]);
	});
});
