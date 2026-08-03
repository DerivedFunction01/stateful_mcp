import { describe, expect, it } from "bun:test";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";
import type { Cell } from "../src/session/cell";
import { CellCommandParser } from "../src/session/cell-command-parser";
import { CellCommandRegistry } from "../src/session/cell-command-registry";

const cell = (targetSchema: string | null): Cell => ({
	cellId: "cell-1",
	sessionId: "session-1",
	mode: "cdsl",
	rawInput: "",
	routing: { scope: "global", targetSchema },
	parsedOutput: null,
	status: "draft",
	updatedAt: new Date(0).toISOString(),
	context: { objects: {} },
});

describe("CellCommandParser", () => {
	it("parses colon commands and profile aliases", () => {
		const profile = {
			...SEED_PARSER_PROFILES[0]!,
			cellCommandMappings: { ejecutar: "run" },
		};
		expect(CellCommandParser.parse("  :ejecutar now", profile)).toEqual({
			verb: "run",
			args: ["now"],
			raw: ":ejecutar now",
		});
		expect(CellCommandParser.parse("ordinary text", profile)).toBeNull();
	});
});

describe("CellCommandRegistry", () => {
	it("dispatches built-in navigation and reports unknown commands", async () => {
		const registry = CellCommandRegistry.createDefault();
		const ctx = {
			sessionId: "session-1",
			cell: cell("ObservationEvent"),
			activeCellIndex: 2,
			cells: [
				cell("ObservationEvent"),
				cell("ObservationEvent"),
				cell("ObservationEvent"),
			],
			profile: SEED_PARSER_PROFILES[0]!,
		};
		expect(
			(await registry.dispatch({ verb: "up", args: [], raw: ":up" }, ctx))
				.targetCellIndex,
		).toBe(1);
		expect(
			(
				await registry.dispatch(
					{ verb: "unknown", args: [], raw: ":unknown" },
					ctx,
				)
			).success,
		).toBe(false);
	});
});
