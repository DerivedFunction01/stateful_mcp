import type {
	MacroChildHandler,
	MacroDefinitionAdapter,
	MacroPreviewValue,
} from "../../src/contracts/composition";
import {
	createMacroRuntimeContext,
	type MacroRuntimeContext,
} from "../../src/contracts/context";
import type { MacroSpec } from "../../src/contracts/macro";

export const testMacroSyntax = {
	macroStartToken: "^",
	argumentDelimiter: " ",
};

export const testMacroContext: MacroRuntimeContext =
	createMacroRuntimeContext(testMacroSyntax);

const previewSlot = (
	argumentId: string,
	value: string | undefined,
	status: MacroPreviewValue["status"] = value ? "bound" : "missing",
	previewKey?: string,
): MacroPreviewValue => ({
	argumentId,
	previewKey,
	value,
	status,
});

const acceptedChild = (
	argumentId: string,
	project: (
		input: Parameters<NonNullable<MacroChildHandler["validate"]>>[0]["input"],
	) => readonly MacroPreviewValue[],
): MacroChildHandler => ({
	type: "fixture-value",
	validate: ({ input }) => ({
		status: "accepted",
		binding: { displayValue: input.rawValue },
		previewValues: project(input),
	}),
});

const noteDefinition: MacroSpec = {
	id: "fixture.note",
	name: "note",
	version: 1,
	arguments: [
		{
			argumentId: "title",
			name: "title",
			path: "fixture.note.title",
			matcher: { kind: "pattern", pattern: "(?<title>[A-Za-z ]+)" },
			required: true,
		},
		{
			argumentId: "page",
			name: "page",
			path: "fixture.note.page",
			matcher: { kind: "pattern", pattern: "(?<page>\\d{1,3})" },
			required: true,
		},
		{
			argumentId: "year",
			name: "year",
			path: "fixture.note.year",
			matcher: { kind: "pattern", pattern: "(?<year>\\d{4})" },
			required: true,
		},
	],
	matching: { mode: "unordered", positionalFallback: true },
};

export const noteAdapter: MacroDefinitionAdapter = {
	definition: noteDefinition,
	previewTemplate: {
		version: 1,
		parts: [
			{ kind: "literal", text: "title: " },
			{ kind: "slot", argumentId: "title", occurrence: 0 },
			{ kind: "literal", text: ", page: " },
			{ kind: "slot", argumentId: "page", occurrence: 0 },
			{ kind: "literal", text: ", year: " },
			{ kind: "slot", argumentId: "year", occurrence: 0 },
		],
	},
	children: {
		title: acceptedChild("title", (input) => [
			previewSlot("title", input.rawValue),
		]),
		page: acceptedChild("page", (input) => [
			previewSlot("page", input.rawValue),
		]),
		year: acceptedChild("year", (input) => [
			previewSlot("year", input.rawValue),
		]),
	},
	compile: (bindings) => ({
		kind: "note",
		values: bindings.map((binding) => binding.binding?.displayValue),
	}),
};

const observationDefinition: MacroSpec = {
	id: "fixture.observation",
	name: "observation",
	version: 1,
	arguments: [
		{
			argumentId: "concept",
			name: "concept",
			path: "fixture.observation.concept",
			matcher: { kind: "pattern", pattern: "(?<concept>[A-Za-z ]+)" },
			required: true,
		},
		{
			argumentId: "severity",
			name: "severity",
			path: "fixture.observation.severity",
			matcher: {
				kind: "pattern",
				pattern: "(?<min>\\d+)(?:\\/(?<max>\\d+))?",
			},
			required: true,
		},
	],
	matching: { mode: "unordered", positionalFallback: true },
};

export const observationAdapter: MacroDefinitionAdapter = {
	definition: observationDefinition,
	previewTemplate: {
		version: 1,
		parts: [
			{ kind: "literal", text: "concept: " },
			{ kind: "slot", argumentId: "concept", occurrence: 0 },
			{ kind: "literal", text: ", severity: " },
			{
				kind: "slot",
				argumentId: "severity",
				occurrence: 0,
				previewKey: "severity.min",
			},
			{ kind: "literal", text: " to " },
			{
				kind: "slot",
				argumentId: "severity",
				occurrence: 0,
				previewKey: "severity.max",
			},
		],
	},
	children: {
		concept: acceptedChild("concept", (input) => [
			previewSlot("concept", "Harry Potter (Series)"),
		]),
		severity: {
			type: "fixture-measurement",
			validate: ({ input }) => {
				const min = input.captures?.min ?? input.rawValue;
				const max = input.captures?.max;
				return {
					status: "accepted",
					binding: {
						canonicalValue: {
							min: Number(min),
							max: max ? Number(max) : undefined,
						},
					},
					previewValues: [
						previewSlot("severity", min, "bound", "severity.min"),
						previewSlot(
							"severity",
							max,
							max ? "bound" : "missing",
							"severity.max",
						),
					],
				};
			},
		},
	},
	compile: (bindings) => ({
		kind: "observation",
		observation: {
			severity: bindings.find((binding) => binding.binding?.canonicalValue)
				?.binding?.canonicalValue,
		},
	}),
};
