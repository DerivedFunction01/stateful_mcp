import { describe, expect, test } from "bun:test";
import { extractTypedValue } from "../src/macros/macro-value-extractor";
import { soapNoteSchema } from "../src/schemas/definitions/document-schema";
import { compileSetupMacro } from "../src/setup/setup-compiler";
import type {
	SetupGrammarBlock,
	SetupMacroComposition,
} from "../src/setup/setup-types";
import type { QuantityGrammarProfile } from "../src/values/quantity-profile-types";

describe("Quantity & Enum Grammar Profile Setup Integration", () => {
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
		{
			blockId: "note_status_block",
			version: 1,
			label: "Note Status",
			kind: "enum",
			target: {
				targetSchema: "Note",
				targetPath: "status",
			},
			valueKind: "enum",
			source: {
				kind: "value-rule",
				ruleId: "status_rule",
			},
			schemaVersion: 1,
			status: "active",
			enumMapping: {
				draft: "draft",
				prog: "signed", // maps prog to signed
				alright: "amended", // maps alright to amended
			},
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

	const statusComposition: SetupMacroComposition = {
		macroId: "status_macro",
		version: 1,
		macroName: "status",
		targetSchema: "Note",
		targetSchemaVersion: 1,
		allowedPlacementIds: ["header"],
		defaultPlacementId: "header",
		parameters: [
			{
				argumentId: "statusArg",
				blockId: "note_status_block",
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

	test("compiles setup macro with enum alias mapping and resolves alias at extraction time", async () => {
		const macro = compileSetupMacro(
			statusComposition,
			blocks,
			quantityProfiles,
		);

		expect(macro.macroId).toBe("status_macro");
		expect(macro.arguments.length).toBe(1);

		const arg = macro.arguments[0]!;
		expect(arg.argumentId).toBe("statusArg");
		expect(arg.extraction.kind).toBe("enum");
		expect(arg.extraction.enumMapping).toEqual({
			draft: "draft",
			prog: "signed",
			alright: "amended",
		});

		const statusField = soapNoteSchema.fields["status"];

		// Extracting standard value (should remain draft)
		const resDraft = await extractTypedValue("draft", arg, {
			field: statusField,
		});
		expect(resDraft.diagnostics.length).toBe(0);
		expect(resDraft.value?.kind).toBe("enum");
		expect((resDraft.value as any)?.value).toBe("draft");

		// Extracting alias "prog" (should map to signed)
		const resProg = await extractTypedValue("prog", arg, {
			field: statusField,
		});
		expect(resProg.diagnostics.length).toBe(0);
		expect(resProg.value?.kind).toBe("enum");
		expect((resProg.value as any)?.value).toBe("signed");

		// Extracting case-insensitive alias "Alright" (should map to amended)
		const resAlright = await extractTypedValue("Alright", arg, {
			field: statusField,
		});
		expect(resAlright.diagnostics.length).toBe(0);
		expect(resAlright.value?.kind).toBe("enum");
		expect((resAlright.value as any)?.value).toBe("amended");

		// Extracting an invalid value not in schema enums (should fail)
		const resInvalid = await extractTypedValue("invalid", arg, {
			field: statusField,
		});
		expect(resInvalid.diagnostics.length).toBe(1);
		expect(resInvalid.diagnostics[0]?.code).toBe("invalid_enum");
	});
});
