import { describe, expect, test } from "bun:test";
import { bootstrapCommandDefaults } from "../src/bootstrap/bootstrap-config";
import { NOTE_MACRO } from "../src/macros/default-macros";
import type { MacroDefinition } from "../src/macros/macro-definition";
import { parseMacroLine } from "../src/macros/macro-input-parser";
import { createSyntaxProfile } from "../src/macros/macro-profile";

const OBSERVATION: MacroDefinition = {
	macroId: "obs",
	macroName: "observation",
	version: 1,
	status: "published",
	active: true,
	root: {
		roleName: "observation",
		targetSchema: "Observation",
		outputCellKind: "structured",
	},
	arguments: [
		{
			argumentId: "concept",
			name: "concept",
			roleName: "observation.concept",
			position: 0,
			target: { targetSchema: "Observation", targetPath: "concept" },
			extraction: { kind: "concept", patterns: [`(?<concept>.+)`] },
		},
		{
			argumentId: "duration",
			name: "duration",
			roleName: "observation.duration",
			position: 1,
			target: { targetSchema: "Observation", targetPath: "duration" },
			extraction: {
				kind: "measurement",
				patterns: [
					`["']?(?<magnitude>\\d+(?:\\.\\d+)?)\\s+(?<unit>[\\w/°%]+)["']?`,
				],
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
		const result = parseMacroLine(
			"^observation concept=shortness of breath",
			0,
			{ definition: OBSERVATION },
		);
		const argument = result?.arguments[0];
		expect(argument).toMatchObject({
			name: "concept",
			rawValue: "shortness of breath",
			source: "rule",
		});
		expect(argument?.captures).toEqual({ concept: "shortness of breath" });
	});

	test("infers unnamed argument order from matching extraction patterns", () => {
		const definition: MacroDefinition = {
			...OBSERVATION,
			arguments: [
				{
					...OBSERVATION.arguments[1]!,
					argumentId: "severity",
					name: "severity",
					position: 0,
					extraction: {
						kind: "scalar",
						patterns: ["(?<value>\\d{1,2})"],
					},
				},
				{
					...OBSERVATION.arguments[0]!,
					argumentId: "concept",
					name: "concept",
					position: 1,
					extraction: {
						kind: "concept",
						patterns: ["(?<concept>[A-Za-z ]+)"],
					},
				},
			],
		};
		const result = parseMacroLine("^observation sob 10", 0, { definition });
		expect(result?.arguments.map((argument) => argument.position)).toEqual([
			1, 0,
		]);
		expect(result?.arguments.map((argument) => argument.rawValue)).toEqual([
			"sob",
			"10",
		]);
	});

	test("lets the measurement expression own its internal whitespace", () => {
		const result = parseMacroLine("^observation duration=2 hours", 0, {
			definition: OBSERVATION,
		});
		expect(result?.arguments[0]).toMatchObject({
			rawValue: "2 hours",
			source: "rule",
		});
		expect(result?.arguments[0]?.captures).toEqual({
			magnitude: "2",
			unit: "hours",
		});
		expect(result?.matches?.[0]).toMatchObject({
			argumentId: "duration",
			extraction: { start: 22, end: 29 },
		});
		expect(result?.matches?.[0]?.captureSpans).toEqual([
			{ name: "magnitude", value: "2", start: 22, end: 23 },
			{ name: "unit", value: "hours", start: 24, end: 29 },
		]);
	});

	test("captures note arguments in compatible positional order", () => {
		const result = parseMacroLine("^note 10 hp 2024", 0, {
			definition: NOTE_MACRO,
		});

		expect(result?.arguments.map((argument) => argument.position)).toEqual([
			1, 0, 2,
		]);
		expect(result?.arguments.map((argument) => argument.rawValue)).toEqual([
			"10",
			"hp",
			"2024",
		]);
	});

	test("preserves named assignments while inferring remaining values", () => {
		const result = parseMacroLine("^note hp page_num=10 2024", 0, {
			definition: NOTE_MACRO,
		});

		expect(result?.arguments.map((argument) => argument.name)).toEqual([
			undefined,
			"page_num",
			undefined,
		]);
		expect(result?.arguments.map((argument) => argument.rawValue)).toEqual([
			"hp",
			"10",
			"2024",
		]);
	});

	test("preserves separator whitespace outside positional spans", () => {
		const text = "^note hp  10  2024";
		const result = parseMacroLine(text, 0, { definition: NOTE_MACRO });

		expect(result?.arguments.map((argument) => argument.rawValue)).toEqual([
			"hp",
			"10",
			"2024",
		]);
		expect(
			text.slice(result?.arguments[0]?.end, result?.arguments[1]?.start),
		).toBe("  ");
	});

	test("does not let an unmatched leading token block later numeric slots", () => {
		const result = parseMacroLine("^note # 10 2004", 0, {
			definition: NOTE_MACRO,
		});

		expect(result?.arguments.map((argument) => argument.position)).toEqual([
			1, 2,
		]);
		expect(result?.arguments.map((argument) => argument.rawValue)).toEqual([
			"10",
			"2004",
		]);
	});

	test("does not let an invalid named value consume later positional values", () => {
		const result = parseMacroLine("^note title=2004 2004 60", 0, {
			definition: NOTE_MACRO,
		});

		expect(result?.arguments.map((argument) => argument.name)).toEqual([
			"title",
			undefined,
			undefined,
		]);
		expect(result?.arguments.map((argument) => argument.rawValue)).toEqual([
			"2004",
			"2004",
			"60",
		]);
	});

	test("keeps later values independent of invalid multi-word named text", () => {
		const result = parseMacroLine(
			"^note title=not a matching book 2004 60",
			0,
			{ definition: NOTE_MACRO },
		);

		expect(result?.arguments[0]?.rawValue).toBe("not a matching book");
		expect(result?.arguments.map((argument) => argument.rawValue)).toContain(
			"2004",
		);
	});

	test("keeps an unmatched lookup token in a non-lookup capture", () => {
		const definition: MacroDefinition = {
			...NOTE_MACRO,
			arguments: [
				{
					...NOTE_MACRO.arguments[0]!,
					argumentId: "text",
					name: "text",
					roleName: "note.text",
					extraction: {
						kind: "prose",
						patterns: ["(?<text>.+)"],
					},
				},
			],
		};
		const result = parseMacroLine("^note #favorite book", 0, {
			definition,
		});

		expect(result?.arguments[0]).toMatchObject({
			rawValue: "#favorite book",
		});
	});

	test("extracts a named argument after an incomplete template prefix", () => {
		const result = parseMacroLine("^note has page # year=2024", 0, {
			definition: NOTE_MACRO,
		});

		expect(result?.arguments).toHaveLength(1);
		expect(result?.arguments[0]).toMatchObject({
			name: "year",
			rawValue: "2024",
			source: "rule",
		});
	});

	test("matches a valid year template without treating it as a page value", () => {
		const result = parseMacroLine("^note has page # during 2024", 0, {
			definition: NOTE_MACRO,
		});

		expect(result?.arguments).toHaveLength(1);
		expect(result?.arguments[0]).toMatchObject({
			rawValue: "2024",
			source: "friendly",
		});
		expect(result?.arguments[0]?.match?.argumentId).toBe("year");
	});

	test("preserves quotes for expressions that use quotes themselves", () => {
		const result = parseMacroLine(
			'^observation concept="shortness of breath"',
			0,
			{ definition: OBSERVATION },
		);
		expect(result?.arguments[0]?.rawValue).toBe('"shortness of breath"');
	});

	test("supports configured delimiters without treating spaces as universal boundaries", () => {
		const result = parseMacroLine(
			"^observation concept=shortness of breath;duration=2 hours",
			0,
			{ definition: OBSERVATION },
		);
		expect(result?.arguments).toHaveLength(2);
		expect(result?.arguments[0]?.rawValue).toBe("shortness of breath");
		expect(result?.arguments[1]?.rawValue).toBe("2 hours");
	});

	test("matches a friendly form by argumentId and exposes anchor/extraction spans", () => {
		const definition: MacroDefinition = {
			...OBSERVATION,
			arguments: [
				{
					...OBSERVATION.arguments[1]!,
					forms: [
						{
							formId: "duration-hours",
							kind: "friendly",
							argumentId: "duration",
							template: {
								version: 1,
								parts: [
									{ kind: "literal", text: "duration of " },
									{
										kind: "slot",
										argumentId: "duration",
										occurrence: 0,
									},
								],
							},
						},
					],
				},
			],
		};
		const result = parseMacroLine("^observation duration of 2 hours", 0, {
			definition,
		});
		expect(result?.matches).toHaveLength(1);
		expect(result?.matches?.[0]).toMatchObject({
			argumentId: "duration",
			formId: "duration-hours",
			source: "friendly",
			anchor: { start: 13, end: 25 },
			extraction: { start: 25, end: 32 },
			rawValue: "2 hours",
		});
	});

	test("uses friendly-form precedence for overlapping successful matches", () => {
		const makeArgument = (argumentId: string, precedence: number) => ({
			...OBSERVATION.arguments[1]!,
			argumentId,
			name: argumentId,
			extraction: { kind: "scalar" as const, patterns: [`(?<value>\\d+)`] },
			forms: [
				{
					formId: `${argumentId}-form`,
					kind: "friendly" as const,
					argumentId,
					precedence,
					template: {
						version: 1 as const,
						parts: [
							{ kind: "literal" as const, text: "value " },
							{ kind: "slot" as const, argumentId, occurrence: 0 },
						],
					},
				},
			],
		});
		const result = parseMacroLine("^observation value 120", 0, {
			definition: {
				...OBSERVATION,
				arguments: [makeArgument("low", 1), makeArgument("high", 2)],
			},
		});
		expect(result?.matches?.map((match) => match.argumentId)).toEqual(["high"]);
	});

	test("does not project or lock a friendly form when extraction fails", () => {
		const definition: MacroDefinition = {
			...OBSERVATION,
			arguments: [
				{
					...OBSERVATION.arguments[1]!,
					extraction: { kind: "scalar", patterns: [`(?<value>\\d+)`] },
					forms: [
						{
							formId: "duration-of",
							kind: "friendly",
							argumentId: "duration",
							template: {
								version: 1,
								parts: [
									{ kind: "literal", text: "duration of " },
									{
										kind: "slot",
										argumentId: "duration",
										occurrence: 0,
									},
								],
							},
						},
					],
				},
			],
		};
		const result = parseMacroLine("^observation duration of unknown", 0, {
			definition,
		});
		expect(result?.matches).toEqual([]);
	});

	test("projects each slot in a multi-slot friendly form", () => {
		const definition: MacroDefinition = {
			...OBSERVATION,
			arguments: OBSERVATION.arguments.map((argument) => ({
				...argument,
				extraction: {
					...argument.extraction,
					patterns:
						argument.argumentId === "concept"
							? [`(?<concept>[a-z]+)`]
							: [`(?<duration>\\d+)`],
				},
				forms:
					argument.argumentId === "concept"
						? [
								{
									formId: "concept-and-duration",
									kind: "friendly" as const,
									argumentId: "concept",
									template: {
										version: 1 as const,
										parts: [
											{
												kind: "slot" as const,
												argumentId: "concept",
												occurrence: 0,
											},
											{ kind: "literal" as const, text: " at " },
											{
												kind: "slot" as const,
												argumentId: "duration",
												occurrence: 0,
											},
										],
									},
								},
							]
						: undefined,
			})),
		};
		const result = parseMacroLine("^observation shortness at 2", 0, {
			definition,
		});
		expect(result?.matches?.map((match) => match.argumentId)).toEqual([
			"concept",
			"duration",
		]);
	});

	test("matches top-level templates and alternate extraction patterns", () => {
		const definition: MacroDefinition = {
			...OBSERVATION,
			arguments: [
				OBSERVATION.arguments[0]!,
				{
					...OBSERVATION.arguments[1]!,
					extraction: {
						...OBSERVATION.arguments[1]!.extraction,
						patterns: ["(?<invalid>[a-z]+)", "(?<value>\\d+)"],
					},
				},
			],
			authoringTemplates: [
				{
					version: 1,
					parts: [
						{ kind: "literal", text: "duration of " },
						{ kind: "slot", argumentId: "duration", occurrence: 0 },
					],
				},
			],
		};
		const result = parseMacroLine("^observation duration of 120", 0, {
			definition,
		});
		expect(result?.matches).toHaveLength(1);
		expect(result?.matches?.[0]).toMatchObject({
			argumentId: "duration",
			formId: "template:0:duration:0",
			rawValue: "120",
			captures: { value: "120" },
		});
	});

	test("supports equals inside a quoted expression", () => {
		const result = parseMacroLine('^observation concept="a = b"', 0, {
			definition: OBSERVATION,
		});
		expect(result?.arguments[0]?.rawValue).toBe('"a = b"');
	});

	test("uses profile defaults without requiring a delimiter", () => {
		const profile = createSyntaxProfile(
			{
				profileId: "default",
				macroArgDelimiter: ";",
			},
			bootstrapCommandDefaults,
		);
		const result = parseMacroLine("^observation duration=2 hours", 0, {
			definition: OBSERVATION,
			profile,
		});
		expect(result?.arguments[0]?.captures).toEqual({
			magnitude: "2",
			unit: "hours",
		});
	});

	test("matches a configured expression token attached to a concept value", () => {
		const profile = createSyntaxProfile(
			{
				profileId: "expression-token",
				expressionToken: "#",
			},
			bootstrapCommandDefaults,
		);
		const result = parseMacroLine("^note #hp", 0, {
			definition: NOTE_MACRO,
			profile,
		});

		expect(result?.arguments[0]).toMatchObject({
			rawValue: "#hp",
			start: 6,
			end: 9,
		});
	});

	test("preserves configured list item spans for a value rule", () => {
		const definition: MacroDefinition = {
			...OBSERVATION,
			arguments: [
				{
					...OBSERVATION.arguments[0]!,
					argumentId: "qualifiers",
					name: "qualifiers",
					extraction: {
						kind: "concept_array",
						itemDelimiter: "~",
						patterns: [`(?<concept>.+)`],
					},
				},
			],
		};
		const result = parseMacroLine(
			"^observation qualifiers=shortness of breath~exertional",
			0,
			{ definition },
		);
		expect(result?.arguments[0]?.items?.map((item) => item.rawValue)).toEqual([
			"shortness of breath",
			"exertional",
		]);
		expect(result?.arguments[0]?.items?.[0]?.start).toBeGreaterThan(0);
	});

	test("reports invalid expressions without throwing", () => {
		const definition = {
			...OBSERVATION,
			arguments: [
				{
					...OBSERVATION.arguments[0]!,
					extraction: { kind: "concept" as const, patterns: ["("] },
				},
			],
		};
		const result = parseMacroLine("^observation concept=chest", 0, {
			definition,
		});
		expect(
			result?.diagnostics?.some(
				(diagnostic) => diagnostic.code === "INVALID_PATTERN",
			),
		).toBe(true);
	});

	test("returns null for non-macro input", () => {
		expect(parseMacroLine("Patient has shortness of breath")).toBeNull();
	});
});
