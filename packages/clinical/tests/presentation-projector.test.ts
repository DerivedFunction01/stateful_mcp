import { describe, expect, test } from "bun:test";
import { createParsedItemPresentation } from "../src/presentation/projector";

describe("redo presentation projector", () => {
	test("uses schema descriptors instead of path-name inference", () => {
		const item = createParsedItemPresentation({
			targetSchema: "ObservationEvent",
			attributes: {},
			concept: [{ display: "Fever" }],
			rawText: "fever",
			tag: "#observation",
			extractedData: {
				concept: { display: "Fever" },
				severity: { score: 2, maxScore: 3, normalizedScore: 0.66 },
				duration: { magnitude: 3, unit: "day" },
				status: "present",
			},
		});
		const fields = item.groups.flatMap((group) => group.fields);
		expect(fields.find((field) => field.path === "severity")?.kind).toBe(
			"object",
		);
		expect(fields.find((field) => field.path === "duration")?.kind).toBe(
			"duration",
		);
		expect(fields.find((field) => field.path === "status")?.kind).toBe(
			"status",
		);
	});

	test("renders unknown schemas with structural fallback", () => {
		const item = createParsedItemPresentation({
			targetSchema: "FutureSchema",
			attributes: {},
			concept: [],
			rawText: "",
			tag: "",
			extractedData: { concept: { display: "X" }, count: 2, active: true },
		});
		expect(item.groups).toHaveLength(1);
		expect(item.groups[0]?.fields.map((field) => field.kind)).toEqual([
			"concept",
			"number",
			"boolean",
		]);
	});
});
