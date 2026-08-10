import { describe, expect, test } from "bun:test";
import { compileSetupMacro } from "../src/setup/setup-compiler";
import type {
	SetupGrammarBlock,
	SetupMacroComposition,
} from "../src/setup/setup-types";
import type { QuantityGrammarProfile } from "../src/values/quantity-profile-types";

describe("Quantity Grammar Profile Setup Integration", () => {
	const quantityProfiles: QuantityGrammarProfile[] = [
		{
			profileId: "vitals_qty_profile",
			label: "Vitals Profile",
			version: 1,
			decimalSeparator: ".",
			thousandsSeparator: ",",
			unitAliases: {
				bpm: "beats/min",
				mmhg: "mmHg",
				temp: "Celsius",
			},
			operatorAliases: {
				">": "gt",
				"<": "lt",
			},
			rangeDelimiters: ["to", "-"],
			ordering: {
				unitOrder: "suffix",
				rangePattern: "distributive_suffix",
			},
			measurementWordBoundary: "both",
		},
	];

	const blocks: SetupGrammarBlock[] = [
		{
			blockId: "pulse_rate_block",
			version: 1,
			label: "Pulse Rate",
			kind: "measurement",
			target: {
				targetSchema: "Observation",
				targetPath: "valueQuantity",
			},
			valueKind: "measurement",
			source: {
				kind: "concept",
				conceptId: "pulse_rate",
			},
			schemaVersion: 1,
			status: "active",
			quantityProfileId: "vitals_qty_profile",
			activeUnits: ["bpm"], // only bpm is active
		},
	];

	const composition: SetupMacroComposition = {
		macroId: "pulse_macro",
		version: 1,
		macroName: "pulse",
		targetSchema: "Observation",
		targetSchemaVersion: 1,
		allowedPlacementIds: ["body"],
		defaultPlacementId: "body",
		parameters: [
			{
				argumentId: "pulse",
				blockId: "pulse_rate_block",
			},
		],
		status: "active",
	};

	test("compiles setup macro with scoped quantity pattern matching", () => {
		const macro = compileSetupMacro(composition, blocks, quantityProfiles);

		// Assert macro properties
		expect(macro.macroId).toBe("pulse_macro");
		expect(macro.arguments.length).toBe(1);

		const arg = macro.arguments[0]!;
		expect(arg.argumentId).toBe("pulse");
		expect(arg.extraction.kind).toBe("measurement");

		// Compiled patterns should contain the scoped regex pattern
		const patterns = arg.extraction.patterns;
		expect(patterns).toBeDefined();
		expect(patterns?.length).toBe(1);

		const compiledPattern = patterns![0]!;
		const regex = new RegExp(compiledPattern);

		// Should match active units (bpm)
		expect(regex.test("72 bpm")).toBe(true);
		expect(regex.test("90 to 100 bpm")).toBe(true);

		// Should reject inactive units (mmHg, temp)
		expect(regex.test("120 mmHg")).toBe(false);
		expect(regex.test("37 temp")).toBe(false);
	});
});
