import { describe, expect, it } from "bun:test";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";
import type { Cell } from "../src/session/cell";
import {
	resolveFieldTarget,
	setNestedField,
} from "../src/session/cell-command-context";
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

describe("cell command field targeting", () => {
	it("resolves explicit and inferred schema paths", () => {
		const profile = {
			...SEED_PARSER_PROFILES[0]!,
			fieldMappings: { sintoma: "ObservationEvent.symptom" },
		};
		expect(resolveFieldTarget("sintoma", "pain", cell(null), profile)).toEqual({
			targetSchema: "ObservationEvent",
			fieldPath: "symptom",
			value: "pain",
		});
		expect(
			resolveFieldTarget(
				"severity.score",
				"7",
				cell("ObservationEvent"),
				profile,
			),
		).toEqual({
			targetSchema: "ObservationEvent",
			fieldPath: "severity.score",
			value: "7",
		});
	});

	it("constructs nested extracted data", () => {
		const data: Record<string, unknown> = {};
		setNestedField(data, "symptom.severity.score", 7);
		expect(data).toEqual({ symptom: { severity: { score: 7 } } });
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
