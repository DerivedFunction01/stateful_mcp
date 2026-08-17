import { describe, expect, test } from "bun:test";
import { createDifferentialScratchpadAdapter } from "../src/lib/scratchpad/differential-scratchpad-adapter";
import {
	clearScratchpadCellTexts,
	duplicateScratchpadCell,
	moveScratchpadCellIndex,
	populatedScratchpadCells,
} from "../src/lib/scratchpad/scratchpad-cell-state";
import type { ScratchpadCell } from "../src/lib/scratchpad/scratchpad-types";
import { bootstrapSession } from "../src/lib/session/bootstrap-session";
import {
	createClinicalPinnedLineSeed,
	toClinicalDifferentialProjection,
} from "../src/lib/workspace/assessment-workspace-view";

const cells: ScratchpadCell[] = [
	{
		cellId: "one",
		text: "first",
		pinnedMacroIds: ["active-v2"],
		explicitPins: true,
	},
	{
		cellId: "two",
		text: "",
		pinnedMacroIds: ["rule_out"],
		explicitPins: true,
	},
];

describe("scratchpad cell state", () => {
	test("resolves pinned Differential action macros through the bootstrap syntax profile", async () => {
		const session = await bootstrapSession({
			sessionId: `scratchpad-adapter-${Date.now()}`,
		});
		const adapter = createDifferentialScratchpadAdapter();
		const parsed = adapter.parse(
			[
				{
					cellId: "rule-out-cell",
					text: "pulmonary embolism",
					pinnedMacroIds: ["v2-differential-rule-out-1"],
					explicitPins: true,
				},
			],
			session.syntaxProfile,
		);
		expect(parsed[0]?.macroId).toBe("v2-differential-rule-out-1");
		expect(parsed[0]?.status).toBe("ruled_out");
	});

	test("creates an explicit clinical pinned-line seed without changing authored text", async () => {
		const session = await bootstrapSession({
			sessionId: `scratchpad-seed-${Date.now()}`,
		});
		const seed = createClinicalPinnedLineSeed(
			{
				macroId: "v2-differential-rule-out-1",
				macroName: "differential_ruleout",
				macroStartToken: "^",
			},
			session.syntaxProfile,
		);
		expect(seed).toBe("rule_out ");
	});

	test("adapts differential lines into an extension-owned projection", async () => {
		const session = await bootstrapSession({
			sessionId: `scratchpad-projection-${Date.now()}`,
		});
		const adapter = createDifferentialScratchpadAdapter();
		const parsed = adapter.parse(
			[
				{
					cellId: "assessment",
					text: "rule_out pulmonary embolism",
					pinnedMacroIds: [],
					explicitPins: false,
				},
			],
			session.syntaxProfile,
		);
		const projection = toClinicalDifferentialProjection(
			adapter.deduplicate(parsed)[0]!,
		);
		expect(projection.ownerExtensionId).toBe("@stateful-mcp/clinical");
		expect(projection.kind).toBe("clinical.differential");
		expect((projection.data as { status: string }).status).toBe("ruled_out");
	});

	test("duplicates pins but never text", () => {
		expect(duplicateScratchpadCell(cells, "one", "three")).toEqual([
			cells[0],
			{
				cellId: "three",
				text: "",
				pinnedMacroIds: ["active-v2"],
				explicitPins: true,
			},
			cells[1],
		]);
	});

	test("duplicates an empty cell context", () => {
		const next = duplicateScratchpadCell(cells, "two", "three");
		expect(next[2]).toEqual({
			cellId: "three",
			text: "",
			pinnedMacroIds: ["rule_out"],
			explicitPins: true,
		});
	});

	test("clears text while retaining cells and pins", () => {
		expect(clearScratchpadCellTexts(cells)).toEqual([
			{ ...cells[0], text: "" },
			cells[1],
		]);
	});

	test("moves within cell boundaries", () => {
		expect(moveScratchpadCellIndex(cells, 0, -1)).toBe(0);
		expect(moveScratchpadCellIndex(cells, 0, 1)).toBe(1);
		expect(moveScratchpadCellIndex(cells, 1, 1)).toBe(1);
	});

	test("selects populated cells without changing state", () => {
		expect(populatedScratchpadCells(cells)).toEqual([cells[0]]);
	});
});
