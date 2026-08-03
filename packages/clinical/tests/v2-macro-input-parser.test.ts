import { describe, expect, test } from "bun:test";
import { parseMacroLine } from "../src/v2/macros/macro-input-parser";
import type { V2MacroDefinition } from "../src/v2/macros/macro-definition";

const OBSERVATION: V2MacroDefinition = {
	macroId: "obs",
	macroName: "observation",
	version: 1,
	status: "published",
	active: true,
	root: { roleName: "observation", targetSchema: "Observation", outputCellKind: "structured" },
	arguments: [
		{
			argumentId: "concept",
			name: "concept",
			roleName: "observation.concept",
			position: 0,
			target: { targetSchema: "Observation", targetPath: "concept" },
			extraction: { kind: "concept", patterns: [String.raw`(?<concept>.+)`] },
		},
		{
			argumentId: "duration",
			name: "duration",
			roleName: "observation.duration",
			position: 1,
			target: { targetSchema: "Observation", targetPath: "duration" },
			extraction: {
				kind: "measurement",
				patterns: [String.raw`["']?(?<magnitude>\d+(?:\.\d+)?)\s+(?<unit>[\w/°%]+)["']?`],
			},
		},
	],
	syntax: { argumentDelimiter: ";" },
};

describe("macro-input-parser", () => {
	test("recognizes the macro envelope without tokenizing prose", () => {
		const result = parseMacroLine("^observation shortness of breath", 4);
		expect(result?.macroName).toBe("observation");
		expect(result?.arguments).toHaveLength(1);
		expect(result?.arguments[0]).toMatchObject({
			rawValue: "shortness of breath",
			source: "positional",
			start: 13,
		});
	});

	test("matches a multi-word concept with a named capture and no quotes", () => {
		const result = parseMacroLine("^observation concept=shortness of breath", 0, { definition: OBSERVATION });
		const argument = result?.arguments[0];
		expect(argument).toMatchObject({ name: "concept", rawValue: "shortness of breath", source: "rule" });
		expect(argument?.captures).toEqual({ concept: "shortness of breath" });
	});

	test("lets the measurement expression own its internal whitespace", () => {
		const result = parseMacroLine("^observation duration=2 hours", 0, { definition: OBSERVATION });
		expect(result?.arguments[0]).toMatchObject({ rawValue: "2 hours", source: "rule" });
		expect(result?.arguments[0]?.captures).toEqual({ magnitude: "2", unit: "hours" });
	});

	test("preserves quotes for expressions that use quotes themselves", () => {
		const result = parseMacroLine('^observation concept="shortness of breath"', 0, { definition: OBSERVATION });
		expect(result?.arguments[0]?.rawValue).toBe('"shortness of breath"');
	});

	test("supports configured delimiters without treating spaces as universal boundaries", () => {
		const result = parseMacroLine("^observation concept=shortness of breath;duration=2 hours", 0, { definition: OBSERVATION });
		expect(result?.arguments).toHaveLength(2);
		expect(result?.arguments[0]?.rawValue).toBe("shortness of breath");
		expect(result?.arguments[1]?.rawValue).toBe("2 hours");
	});

	test("supports equals inside a quoted expression", () => {
		const result = parseMacroLine('^observation concept="a = b"', 0, { definition: OBSERVATION });
		expect(result?.arguments[0]?.rawValue).toBe('"a = b"');
	});

	test("reports invalid expressions without throwing", () => {
		const definition = {
			...OBSERVATION,
			arguments: [{
				...OBSERVATION.arguments[0]!,
				extraction: { kind: "concept" as const, patterns: ["("] },
			}],
		};
		const result = parseMacroLine("^observation concept=chest", 0, { definition });
		expect(result?.diagnostics?.some((diagnostic) => diagnostic.code === "INVALID_PATTERN")).toBe(true);
	});

	test("returns null for non-macro input", () => {
		expect(parseMacroLine("Patient has shortness of breath")).toBeNull();
	});
});
