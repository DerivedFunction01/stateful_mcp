import { describe, expect, test } from "bun:test";
import {
	type MacroDefinition,
	NOTE_MACRO,
	VITALS_MACRO,
} from "@stateful-mcp/clinical";
import {
	activeMacroSlot,
	activeMacroTemplateArgument,
	applyMacroLocks,
	lockMacroSlot,
	nextMacroSlot,
	projectMacroSlots,
} from "../src/lib/editor/macro-slots";

const DEFINITION: MacroDefinition = {
	macroId: "assessment",
	macroName: "assessment",
	version: 3,
	status: "published",
	active: true,
	root: {
		roleName: "assessment",
		targetSchema: "Observation",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "severity",
			name: "severity",
			roleName: "assessment.severity",
			target: { targetSchema: "Observation", targetPath: "severity" },
			extraction: { kind: "scalar", patterns: ["(?<value>\\d+)"] },
			forms: [
				{
					formId: "severity-of",
					kind: "friendly",
					argumentId: "severity",
					template: {
						version: 1,
						parts: [
							{ kind: "literal", text: "severity of " },
							{ kind: "slot", argumentId: "severity", occurrence: 0 },
						],
					},
				},
			],
		},
		{
			argumentId: "score",
			name: "score",
			roleName: "assessment.score",
			target: { targetSchema: "Observation", targetPath: "score" },
			extraction: { kind: "scalar", patterns: ["(?<value>\\d+)"] },
		},
	],
};

describe("macro slot CLI integration", () => {
	test("projects parser matches without changing authored text", () => {
		const text = "^assessment severity of 120";
		const slots = projectMacroSlots(text, DEFINITION);

		expect(slots).toHaveLength(1);
		expect(slots[0]).toMatchObject({
			macroId: "assessment",
			macroVersion: 3,
			argumentId: "severity",
			start: 24,
			end: 27,
			rawText: "120",
			status: "bound",
			bindingSource: "friendly",
		});
	});

	test("selects slots by cursor-relative spans and creates transient locks", () => {
		const slots = projectMacroSlots(
			"^assessment severity of 120 score=80",
			DEFINITION,
		);
		const active = activeMacroSlot(slots, 26);
		const next = nextMacroSlot(slots, active?.end ?? 0);

		expect(active?.argumentId).toBe("severity");
		expect(next?.argumentId).toBe("score");
		expect(lockMacroSlot(active!, 7)).toEqual({
			argumentId: "severity",
			macroId: "assessment",
			macroVersion: 3,
			start: 24,
			end: 27,
			rawText: "120",
			lockedAtRevision: 7,
			source: "explicit",
		});
		expect(
			applyMacroLocks(slots, [lockMacroSlot(active!, 7)], active?.argumentId),
		).toEqual(
			slots.map((slot) => ({
				...slot,
				status: slot.argumentId === "severity" ? "locked" : slot.status,
			})),
		);
	});

	test("projects and navigates slots from a bootstrapped macro", () => {
		const text =
			"^vitals heart rate of 88 blood_pressure=120/80 respiration=16";
		const slots = projectMacroSlots(text, VITALS_MACRO);
		expect(slots.map((slot) => slot.argumentId)).toEqual([
			"heart_rate",
			"blood_pressure",
			"respiration",
		]);
		const first = slots[0]!;
		const active = activeMacroSlot(slots, first.start);
		expect(active?.argumentId).toBe("heart_rate");
		const next = nextMacroSlot(slots, first.end, 1);
		expect(next?.argumentId).toBe("blood_pressure");
	});

	test("allows a validated expression lock to claim a prefix of a broad span", () => {
		const text = "^note hp p";
		const slots = projectMacroSlots(text, NOTE_MACRO);
		const title = slots.find((slot) => slot.argumentId === "title");
		expect(title?.rawText).toBe("hp p");

		const projected = applyMacroLocks(
			slots,
			[
				{
					argumentId: "title",
					macroId: NOTE_MACRO.macroId,
					macroVersion: NOTE_MACRO.version,
					start: title!.start,
					end: title!.start + 2,
					rawText: "hp",
					binding: {
						kind: "custom-expression",
						conceptId: "c-hp",
						expressionId: "expr-hp",
						displayValue: "Harry Potter",
					},
				},
			],
			undefined,
			text,
		);

		expect(projected.find((slot) => slot.argumentId === "title")).toMatchObject(
			{
				start: title!.start,
				end: title!.start + 2,
				rawText: "hp",
				status: "locked",
			},
		);
	});

	test("targets an incomplete template slot before value validation", () => {
		expect(
			activeMacroTemplateArgument(
				"^note My favorite book is h",
				26,
				NOTE_MACRO,
			),
		).toBe("title");
		expect(
			activeMacroTemplateArgument("^note My has", 12, NOTE_MACRO),
		).toBeUndefined();
	});
});
