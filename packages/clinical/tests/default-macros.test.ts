import { describe, expect, test } from "bun:test";
import {
	ASSESSMENT_MACRO,
	PHYSICAL_EXAM_MACRO,
	VITALS_MACRO,
} from "../src/macros/default-macros";
import type { MacroStore } from "../src/macros/macro-definition";
import { parseMacroLine } from "../src/macros/macro-input-parser";
import { validateMacroAuthoringTemplates } from "../src/macros/macro-template-matcher";
import type { ConceptLookup } from "../src/values/concept-value";

const STORE: MacroStore = {
	async list() {
		return [VITALS_MACRO, ASSESSMENT_MACRO, PHYSICAL_EXAM_MACRO];
	},
	async get(name: string) {
		return (
			[VITALS_MACRO, ASSESSMENT_MACRO, PHYSICAL_EXAM_MACRO].find(
				(macro) => macro.macroName === name,
			) ?? null
		);
	},
};

const DICTIONARY: ConceptLookup = {
	async search() {
		return [];
	},
};

describe("bootstrapped macros", () => {
	test("vitals canonical assignments project stable spans", () => {
		const result = parseMacroLine(
			"^vitals heart_rate=72 blood_pressure=120/80 respiration=16",
			0,
			{ definition: VITALS_MACRO },
		);
		expect(result?.matches?.map((match) => match.argumentId)).toEqual([
			"heart_rate",
			"blood_pressure",
			"respiration",
		]);
		const hr = result?.matches?.[0];
		expect(hr?.rawValue).toBe("72");
		expect(hr?.captures).toEqual({ value: "72" });
		const bp = result?.matches?.[1];
		expect(bp?.captures).toEqual({ systolic: "120", diastolic: "80" });
	});

	test("vitals friendly form resolves to the same argumentId", () => {
		const result = parseMacroLine("^vitals heart rate of 88", 0, {
			definition: VITALS_MACRO,
		});
		expect(result?.matches?.[0]).toMatchObject({
			argumentId: "heart_rate",
			source: "friendly",
			rawValue: "88",
		});
	});

	test("assessment friendly severity and canonical form share identity", () => {
		const friendly = parseMacroLine("^assessment severity of 5", 0, {
			definition: ASSESSMENT_MACRO,
		});
		const canonical = parseMacroLine("^assessment severity=5", 0, {
			definition: ASSESSMENT_MACRO,
		});
		expect(friendly?.matches?.map((m) => m.argumentId)).toEqual(["severity"]);
		expect(canonical?.matches?.[0]?.argumentId).toBe("severity");
		expect(friendly?.matches?.[0]?.argumentId).toBe(
			canonical?.matches?.[0]?.argumentId,
		);
	});

	test("assessment multi-slot friendly form projects both slots", () => {
		const result = parseMacroLine(
			"^assessment shortness of breath at severity 7",
			0,
			{
				definition: ASSESSMENT_MACRO,
			},
		);
		expect(result?.matches?.map((m) => m.argumentId)).toEqual([
			"concept",
			"severity",
		]);
		expect(result?.matches?.[0]?.rawValue).toBe("shortness of breath");
		expect(result?.matches?.[1]?.rawValue).toBe("7");
	});

	test("physical_exam multi-slot friendly template projects weight and height", () => {
		const result = parseMacroLine(
			"^physical_exam weight of 72 kg and height of 1.82 m",
			0,
			{
				definition: PHYSICAL_EXAM_MACRO,
			},
		);
		expect(result?.matches?.map((m) => m.argumentId)).toEqual([
			"weight",
			"height",
		]);
		expect(result?.matches?.map((m) => m.rawValue)).toEqual([
			"72 kg",
			"1.82 m",
		]);
	});

	test("bootstrapped authoring templates pass template validation", () => {
		for (const macro of [VITALS_MACRO, ASSESSMENT_MACRO, PHYSICAL_EXAM_MACRO]) {
			expect(validateMacroAuthoringTemplates(macro)).toEqual([]);
		}
	});

	test("vitals autocomplete resolves scalar bounds suggestions", async () => {
		const { MacroAutocomplete } = await import(
			"../src/macros/macro-autocomplete"
		);
		const service = new MacroAutocomplete({
			macros: STORE,
			dictionary: DICTIONARY,
		});
		const suggestions = await service.suggest({
			query: "7",
			macroName: "vitals",
			argumentName: "heart_rate",
			macroId: VITALS_MACRO.macroId,
			macroVersion: VITALS_MACRO.version,
		});
		expect(suggestions.some((s) => s.value === "72")).toBe(true);
	});
});
