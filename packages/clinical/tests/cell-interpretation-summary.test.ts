import { describe, expect, it } from "bun:test";
import type { ParsedItem } from "../src/parser/schema-parsers";
import type { Cell } from "../src/session/cell";
import { createCellInterpretationSummary } from "../src/session/cell-interpretation-summary";

function makeCell(overrides: Partial<Cell> = {}): Cell {
	return {
		cellId: "cell_1",
		sessionId: "session_1",
		collection: { kind: "notebook", collectionId: "session_1" },
		intentKind: "prose",
		mode: "cdsl",
		rawInput: "#vital temp 38.9 C",
		routing: { scope: "global", targetSchema: "VitalsMeasurementEvent" },
		parsedOutput: null,
		status: "draft",
		context: { objects: {} },
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function makeParsedItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
	return {
		targetSchema: "VitalsMeasurementEvent",
		attributes: {},
		concept: [{ conceptId: "LOINC::8310-5", display: "Temperature" }],
		rawText: "#vital temp 38.9 C",
		tag: "#vital",
		extractedData: {
			measurement: { magnitude: 38.9, unit: { display: "C" } },
			comment: null,
		},
		...overrides,
	};
}

describe("createCellInterpretationSummary", () => {
	it("projects routing, source, concepts, and flattened fields", () => {
		const summary = createCellInterpretationSummary(
			makeCell({
				status: "committed",
				routing: {
					scope: "branch_local",
					targetSchema: "VitalsMeasurementEvent",
					resolvedSchema: "VitalsMeasurementEvent",
					resolvedSection: "objective",
					branchId: "branch_1",
				},
				parsedOutput: [makeParsedItem()],
			}),
		);

		expect(summary.status).toBe("committed");
		expect(summary.rawInput).toBe("#vital temp 38.9 C");
		expect(summary.routing).toMatchObject({
			scope: "branch_local",
			section: "objective",
			targetSchema: "VitalsMeasurementEvent",
			branchId: "branch_1",
		});
		expect(summary.items[0]?.fields).toEqual([
			{ path: "measurement.magnitude", value: 38.9, state: "resolved" },
			{ path: "measurement.unit.display", value: "C", state: "resolved" },
			{ path: "comment", value: null, state: "unresolved" },
		]);
		expect(summary.items[0]?.concepts[0]?.display).toBe("Temperature");
	});

	it("does not expose context, metadata, or arbitrary object graphs", () => {
		const summary = createCellInterpretationSummary(
			makeCell({
				metadata: { internal: { secret: true } },
				context: { objects: { hidden: { value: { secret: true } } } },
				parsedOutput: [
					makeParsedItem({
						extractedData: { nested: { value: "visible" } },
					}),
				],
			}),
		);

		expect(summary).not.toHaveProperty("metadata");
		expect(summary).not.toHaveProperty("context");
		expect(summary.items[0]?.fields).toEqual([
			{ path: "nested.value", value: "visible", state: "resolved" },
		]);
	});

	it("uses explicit diagnostics for errors and unavailable engine data", () => {
		const summary = createCellInterpretationSummary(
			makeCell({ status: "error", errorMessage: "unresolved routing scope" }),
		);

		expect(summary.diagnostics).toEqual({
			error: { message: "unresolved routing scope" },
			confidence: { state: "unavailable" },
			alternatives: "unavailable",
			validation: "not-run",
		});
	});

	it("projects compact persisted confidence", () => {
		const summary = createCellInterpretationSummary(
			makeCell({
				interpretation: {
					confidence: { score: 0.82, level: "high" },
				},
			}),
		);

		expect(summary.diagnostics.confidence).toEqual({
			state: "available",
			level: "high",
			score: 0.82,
		});
	});

	it("supports workspace read-model cells without widening the projection", () => {
		const summary = createCellInterpretationSummary({
			cellId: "workspace-cell",
			workspaceId: "workspace_1",
			rawInput: ":branch chest-pain",
			routing: { scope: "global", targetSchema: null },
			parsedOutput: null,
			status: "committed",
		});

		expect(summary.mode).toBe("workspace");
		expect(summary).not.toHaveProperty("workspaceId");
	});
});
