import { describe, expect, test } from "bun:test";
import { createMacroRuntimeContext } from "../src/contracts/context";
import type { MacroSpec } from "../src/contracts/macro";
import {
	applyMacroLocks,
	lockMacroSlot,
	projectMacroSlots,
	shiftMacroLocksForDeletion,
	shiftMacroLocksForInsertion,
} from "../src/slots/macro-slots";

const context = createMacroRuntimeContext({ macroStartToken: "^" });

const spec: MacroSpec = {
	id: "note",
	name: "note",
	matching: { positionalFallback: true },
	arguments: [
		{
			argumentId: "year",
			name: "year",
			path: "args.year",
			matcher: { kind: "pattern", pattern: "(?<value>20\\d{2})" },
			scalarType: "integer",
		},
	],
};

describe("neutral macro slots", () => {
	test("projects matches and shifts locks", () => {
		const slots = projectMacroSlots("^note 2004", spec, {
			context,
			mode: "live",
		});
		expect(slots[0]?.status).toBe("bound");
		const lock = lockMacroSlot(slots[0]!, 1);
		expect(shiftMacroLocksForInsertion([lock], 6, 2)[0]?.start).toBe(
			lock.start + 2,
		);
		expect(shiftMacroLocksForDeletion([lock], 0, 2)[0]?.start).toBe(
			lock.start - 2,
		);
		expect(applyMacroLocks(slots, [lock])[0]?.status).toBe("locked");
	});
});
