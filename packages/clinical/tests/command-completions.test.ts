import { describe, expect, test } from "bun:test";
import { SOAP_SECTIONS } from "../src/schemas/shared";
import { resolveArgCompletions } from "../src/session/command-completions";
import type { ParserSyntaxProfile } from "../src/store/interfaces";

function makeProfile(
	partial: Partial<ParserSyntaxProfile> = {},
): ParserSyntaxProfile {
	return {
		profileId: "test",
		personnelId: "system",
		tagToken: "#",
		stateDelimiter: "||",
		stateStartDelimiter: "|",
		stateEndDelimiter: "|",
		macroStartToken: "^",
		variableStartToken: "{",
		variableEndToken: "}",
		isDefault: true,
		fieldMappings: {
			"ObservationEvent.symptom": "ObservationEvent.symptom",
			"VitalsMeasurementEvent.systolic": "VitalsMeasurementEvent.systolic",
		},
		workspaceCommandMappings: {
			branch: "branch",
			rule_out: "rule_out",
			confirm: "confirm",
			suspend: "suspend",
			re_activate: "re_activate",
			elevate: "elevate",
			close: "close",
		},
		...partial,
	};
}

describe("SOAP_SECTIONS", () => {
	test("contains the four main locale-neutral section codes", () => {
		expect(SOAP_SECTIONS).toEqual([
			"subjective",
			"objective",
			"assessment",
			"plan",
		]);
	});
});

describe("resolveArgCompletions — workspace command", () => {
	test("returns no arg completions (workspace is the UI opener, not an action command)", () => {
		const profile = makeProfile();
		const codes = resolveArgCompletions("workspace", 0, profile);
		expect(codes).toEqual([]);
	});
});

describe("resolveArgCompletions — default command", () => {
	test("arg0 returns the four SOAP section codes", () => {
		const codes = resolveArgCompletions("default", 0, makeProfile());
		expect(codes.map((c) => c.code)).toEqual([...SOAP_SECTIONS]);
		expect(codes.every((c) => c.group === "section")).toBe(true);
	});

	test("arg1 with a chosen section returns section-scoped schemas", () => {
		const getSchemasForSection = (section: string) =>
			section === "objective"
				? ["vitalsmeasurementevent", "physicalexamobject"]
				: [];
		const codes = resolveArgCompletions(
			"default",
			1,
			makeProfile(),
			["objective"],
			getSchemasForSection,
		);
		expect(codes.map((c) => c.code)).toEqual([
			"vitalsmeasurementevent",
			"physicalexamobject",
		]);
		expect(codes.every((c) => c.group === "schema")).toBe(true);
	});

	test("arg1 without a resolved section returns empty", () => {
		const codes = resolveArgCompletions("default", 1, makeProfile(), []);
		expect(codes).toEqual([]);
	});
});

describe("resolveArgCompletions — mode", () => {
	test("arg0 returns cell modes", () => {
		const codes = resolveArgCompletions("mode", 0, makeProfile());
		expect(codes.map((c) => c.code)).toEqual([
			"cdsl",
			"narrative",
			"js_script",
		]);
		expect(codes.every((c) => c.group === "mode")).toBe(true);
	});
});

describe("resolveArgCompletions — set field", () => {
	test("arg0 returns fieldMappings keys", () => {
		const codes = resolveArgCompletions("set", 0, makeProfile());
		const values = codes.map((c) => c.code);
		expect(values).toContain("ObservationEvent.symptom");
		expect(values).not.toContain("subjective");
		expect(codes.every((c) => c.group === "field")).toBe(true);
	});
});

describe("resolveArgCompletions — unrelated verbs", () => {
	test("returns empty for verbs with no meaningful code completions", () => {
		const profile = makeProfile();
		expect(resolveArgCompletions("go", 0, profile)).toEqual([]);
		expect(resolveArgCompletions("run", 0, profile)).toEqual([]);
	});
});
