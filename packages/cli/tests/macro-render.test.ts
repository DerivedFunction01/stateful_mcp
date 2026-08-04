import { describe, expect, test } from "bun:test";
import { buildMacroRenderSegments } from "../src/lib/editor/macro-render";
import type { MacroSlotProjection } from "../src/lib/editor/macro-slots";

const slot = (start: number, end: number, status: MacroSlotProjection["status"] = "bound"): MacroSlotProjection => ({
	macroId: "assessment",
	macroVersion: 1,
	argumentId: "severity",
	roleName: "assessment.severity",
	start,
	end,
	rawText: "120",
	displayText: "120",
	status,
	diagnostics: [],
});

describe("macro render segments", () => {
	test("renders authored text and one filled slot without a cursor", () => {
		expect(buildMacroRenderSegments("severity=120", [slot(9, 12)], 12, false)).toEqual([
			{ kind: "text", text: "severity=" },
			{ kind: "slot", text: "120", status: "bound" },
		]);
	});

	test("renders exactly one cursor in a slot", () => {
		const segments = buildMacroRenderSegments("severity=120", [slot(9, 12)], 10, true);
		expect(segments.filter((segment) => segment.kind === "cursor")).toHaveLength(1);
		expect(segments.find((segment) => segment.kind === "slot")).toMatchObject({ text: "120" });
	});

	test("preserves locked status in the render model", () => {
		expect(buildMacroRenderSegments("severity=120", [slot(9, 12, "locked")], 12, false)[1]).toEqual({
			kind: "slot",
			text: "120",
			status: "locked",
		});
	});
});
