import { describe, expect, it } from "bun:test";
import {
	createExplicitMacroLock,
	type MacroLockLike,
	removeMacroLock,
	shiftMacroLocksForDeletion,
	shiftMacroLocksForInsertion,
	upsertMacroLock,
} from "../src/macros/macro-slots";

const lock = (
	start: number,
	end: number,
	rawText = "value",
): MacroLockLike => ({
	argumentId: "title",
	macroId: "note",
	macroVersion: 1,
	start,
	end,
	rawText,
});

describe("macro lock range transitions", () => {
	it("shifts locks at or after inserted text and invalidates interior edits", () => {
		const locks = [lock(5, 10)];

		expect(shiftMacroLocksForInsertion(locks, 5, 2)[0]).toMatchObject({
			start: 7,
			end: 12,
		});
		expect(shiftMacroLocksForInsertion(locks, 7, 2)).toEqual([]);
	});

	it("removes overlapping locks and shifts later locks after deletion", () => {
		const locks = [lock(2, 5), lock(8, 12)];
		const result = shiftMacroLocksForDeletion(locks, 6, 8);

		expect(result).toHaveLength(2);
		expect(result[1]).toMatchObject({ start: 6, end: 10 });
		const overlapResult = shiftMacroLocksForDeletion(locks, 3, 7);
		expect(overlapResult).toHaveLength(1);
		expect(overlapResult[0]).toMatchObject({ start: 4, end: 8 });
	});

	it("removes and upserts locks by macro slot identity", () => {
		const original = lock(2, 5);
		const updated = lock(2, 6, "updated");
		const upserted = upsertMacroLock([original], updated);
		const unchanged = upsertMacroLock(upserted, updated);

		expect(upserted).toEqual([updated]);
		expect(unchanged).toBe(upserted);
		expect(removeMacroLock(upserted, updated)).toEqual([]);
	});

	it("creates an explicit lock with canonical suggestion binding", () => {
		const created = createExplicitMacroLock(
			{
				...lock(0, 2),
				macroId: "note",
			},
			{
				label: "Harry Potter",
				value: "BOOK::HP",
				conceptId: "c-harry-potter",
				expressionId: "expr-hp",
				lookupTerm: "hp",
			},
		);

		expect(created).toMatchObject({
			source: "explicit",
			binding: {
				kind: "custom-expression",
				conceptId: "c-harry-potter",
				expressionId: "expr-hp",
				displayValue: "Harry Potter",
			},
		});
	});
});
