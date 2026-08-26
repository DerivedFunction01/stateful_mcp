import { describe, expect, test } from "bun:test";
import { createAssertionMacro } from "../../src/composition/assertion";
import type { MacroInput } from "../../src/contracts/input";

describe("Adverse & Multi-lingual Assertion Tests (Zero Hardcoded Heuristics)", () => {
	test("Adverse Substring: concept or word containing 'rule', 'not', 'true' does NOT falsely flip polarity", async () => {
		// Concept '#overrule_protocol' or '#ruler' or '#schedule' must remain affirmative
		const protocolMacro = createAssertionMacro(
			{
				macroName: "protocol",
				subjectSlotId: "action",
				defaultPolarity: "affirmative",
				clauses: [
					{
						role: "supporting",
						slotId: "rules",
						valueKind: "concept",
						connectors: ["following", "applied"],
					},
					{
						role: "qualifier",
						slotId: "polarity",
						valueKind: "string",
						connectors: ["status"],
					},
				],
			},
			(graph) => ({
				action: (graph.subject as { term: string }).term,
				polarity: graph.polarity,
				rules: graph.evidence.map((e) => (e.value as { term: string }).term),
			}),
			{
				syntax: {
					expressionToken: "#",
				},
			},
		);

		const input: MacroInput = {
			macroName: "protocol",
			sourceLines: [
				{
					line: 1,
					raw: "^protocol #schedule following #overrule_engine status affirmative",
				},
			],
			arguments: [
				{ name: "action", rawValue: "#schedule", source: "named" },
				{ name: "rules", rawValue: "#overrule_engine", source: "friendly" },
				{ name: "polarity", rawValue: "affirmative", source: "friendly" },
			],
			matches: [],
		};

		const result = (await protocolMacro.compile!([], input)) as Record<
			string,
			unknown
		>;
		expect(result.action).toBe("schedule");
		expect(result.polarity).toBe("affirmative");
		expect(result.rules).toEqual(["overrule_engine"]);
	});

	test("Spanish Clinical Assertion: parses Spanish connectors and medical concepts without English assumptions", async () => {
		const spanishAssessmentMacro = createAssertionMacro(
			{
				macroName: "evaluacion",
				subjectSlotId: "diagnostico",
				clauses: [
					{
						role: "supporting",
						slotId: "hallazgos",
						valueKind: "concept",
						repeatable: true,
						itemDelimiter: ",",
						connectors: ["con", "presentando"],
					},
					{
						role: "refuting",
						slotId: "descartes",
						valueKind: "concept",
						repeatable: true,
						itemDelimiter: ",",
						connectors: ["descartando", "sin"],
					},
					{
						role: "transition",
						slotId: "acciones",
						valueKind: "concept",
						connectors: ["iniciando", "ordenando"],
					},
				],
			},
			(graph) => ({
				dx: (graph.subject as { term: string }).term,
				hallazgos: graph.evidence
					.filter((e) => e.role === "supporting")
					.map((e) => (e.value as { term: string }).term),
				descartes: graph.evidence
					.filter((e) => e.role === "refuting")
					.map((e) => (e.value as { term: string }).term),
				acciones: graph.transitions.map(
					(t) => (t.value as { term: string }).term,
				),
			}),
			{
				syntax: {
					expressionToken: "#",
				},
			},
		);

		const input: MacroInput = {
			macroName: "evaluacion",
			sourceLines: [
				{
					line: 1,
					raw: "^evaluacion #asma con #sibilancias, #tos descartando #embolia_pulmonar iniciando #salbutamol",
				},
			],
			arguments: [
				{ name: "diagnostico", rawValue: "#asma", source: "named" },
				{
					name: "hallazgos",
					rawValue: "#sibilancias, #tos",
					source: "friendly",
					items: [
						{ rawValue: "#sibilancias", start: 0, end: 12 },
						{ rawValue: "#tos", start: 14, end: 18 },
					],
				},
				{
					name: "descartes",
					rawValue: "#embolia_pulmonar",
					source: "friendly",
				},
				{ name: "acciones", rawValue: "#salbutamol", source: "friendly" },
			],
			matches: [],
		};

		const result = (await spanishAssessmentMacro.compile!([], input)) as Record<
			string,
			unknown
		>;
		expect(result.dx).toBe("asma");
		expect(result.hallazgos).toEqual(["sibilancias", "tos"]);
		expect(result.descartes).toEqual(["embolia_pulmonar"]);
		expect(result.acciones).toEqual(["salbutamol"]);
	});

	test("Plain Text / No Concept Token: parses natural terms without '#' or '@' prefixes", async () => {
		const evaluacionMacro = createAssertionMacro(
			{
				macroName: "evaluacion",
				subjectSlotId: "diagnostico",
				clauses: [
					{
						role: "supporting",
						slotId: "hallazgos",
						valueKind: "concept",
						repeatable: true,
						itemDelimiter: ",",
						connectors: ["con", "presentando"],
					},
					{
						role: "refuting",
						slotId: "descartes",
						valueKind: "concept",
						repeatable: true,
						itemDelimiter: ",",
						connectors: ["descartando", "sin"],
					},
					{
						role: "transition",
						slotId: "acciones",
						valueKind: "concept",
						connectors: ["iniciando", "ordenando"],
					},
				],
			},
			(graph) => ({
				dx: (graph.subject as { term: string }).term,
				hallazgos: graph.evidence
					.filter((e) => e.role === "supporting")
					.map((e) => (e.value as { term: string }).term),
				descartes: graph.evidence
					.filter((e) => e.role === "refuting")
					.map((e) => (e.value as { term: string }).term),
				acciones: graph.transitions.map(
					(t) => (t.value as { term: string }).term,
				),
			}),
			{
				syntax: {
					expressionToken: "#",
				},
			},
		);

		// Plain text input with NO '#' tokens
		const input: MacroInput = {
			macroName: "evaluacion",
			sourceLines: [
				{
					line: 1,
					raw: "^evaluacion asma con sibilancias, tos descartando embolia_pulmonar iniciando salbutamol",
				},
			],
			arguments: [
				{ name: "diagnostico", rawValue: "asma", source: "named" },
				{
					name: "hallazgos",
					rawValue: "sibilancias, tos",
					source: "friendly",
					items: [
						{ rawValue: "sibilancias", start: 0, end: 11 },
						{ rawValue: "tos", start: 13, end: 16 },
					],
				},
				{
					name: "descartes",
					rawValue: "embolia_pulmonar",
					source: "friendly",
				},
				{ name: "acciones", rawValue: "salbutamol", source: "friendly" },
			],
			matches: [],
		};

		const result = (await evaluacionMacro.compile!([], input)) as {
			dx: string;
			hallazgos: string[];
			descartes: string[];
			acciones: string[];
		};

		expect(result.dx).toBe("asma");
		expect(result.hallazgos).toEqual(["sibilancias", "tos"]);
		expect(result.descartes).toEqual(["embolia_pulmonar"]);
		expect(result.acciones).toEqual(["salbutamol"]);
	});

	test("German Engineering Assertion: parses German connectors, comma decimals, and European units", async () => {
		const germanTelemetryMacro = createAssertionMacro(
			{
				macroName: "telemetrie",
				subjectSlotId: "aggregat",
				clauses: [
					{
						role: "supporting",
						slotId: "druck",
						valueKind: "quantity",
						connectors: ["bei druck", "mit druck"],
					},
					{
						role: "refuting",
						slotId: "ausschluss",
						valueKind: "concept",
						connectors: ["ohne", "ausschluss"],
					},
					{
						role: "transition",
						slotId: "massnahme",
						valueKind: "concept",
						connectors: ["ausloesend"],
					},
				],
			},
			(graph) => ({
				aggregat: (graph.subject as { term: string }).term,
				druck: graph.evidence.find((e) => e.slotId === "druck")?.value,
				ausschluss: graph.evidence.find((e) => e.slotId === "ausschluss")
					?.value,
				massnahme: graph.transitions.map(
					(t) => (t.value as { term: string }).term,
				),
			}),
			{
				grammar: {
					values: {
						numeric: { decimalSeparator: "," },
					},
					unitAliases: {
						bar: ["bar", "Bar"],
					},
				},
				syntax: {
					expressionToken: "#",
				},
			},
		);

		const input: MacroInput = {
			macroName: "telemetrie",
			sourceLines: [
				{
					line: 1,
					raw: "^telemetrie #turbine_1 mit druck 4,8 bar ohne #druckabfall ausloesend #kuehlung",
				},
			],
			arguments: [
				{ name: "aggregat", rawValue: "#turbine_1", source: "named" },
				{ name: "druck", rawValue: "4,8 bar", source: "friendly" },
				{ name: "ausschluss", rawValue: "#druckabfall", source: "friendly" },
				{ name: "massnahme", rawValue: "#kuehlung", source: "friendly" },
			],
			matches: [],
		};

		const result = (await germanTelemetryMacro.compile!([], input)) as Record<
			string,
			unknown
		>;
		expect(result.aggregat).toBe("turbine_1");
		expect(result.druck).toMatchObject({
			kind: "quantity",
			magnitude: 4.8,
			unit: "bar",
			rawText: "4,8 bar",
		});
		expect(result.ausschluss).toMatchObject({
			conceptId: "druckabfall",
			term: "druckabfall",
		});
		expect(result.massnahme).toEqual(["kuehlung"]);
	});

	test("Custom Syntax Tokens: strips user-defined expression and concept tokens cleanly", async () => {
		const customTokenMacro = createAssertionMacro(
			{
				macroName: "custom_claim",
				subjectSlotId: "target",
				clauses: [
					{
						role: "supporting",
						slotId: "evidence_ref",
						valueKind: "concept",
						connectors: ["via"],
					},
				],
			},
			(graph) => ({
				target: (graph.subject as { conceptId: string }).conceptId,
				evidence: (graph.evidence[0]?.value as { conceptId: string })!
					.conceptId,
			}),
			{
				syntax: {
					macroStartToken: "!",
					expressionToken: "§",
					conceptToken: "§",
				},
			},
		);

		const input: MacroInput = {
			macroName: "custom_claim",
			sourceLines: [
				{ line: 1, raw: "!custom_claim §security_breach via §log_entry_409" },
			],
			arguments: [
				{ name: "target", rawValue: "§security_breach", source: "named" },
				{
					name: "evidence_ref",
					rawValue: "§log_entry_409",
					source: "friendly",
				},
			],
			matches: [],
		};

		const result = (await customTokenMacro.compile!([], input)) as Record<
			string,
			unknown
		>;
		expect(result.target).toBe("security_breach");
		expect(result.evidence).toBe("log_entry_409");
	});
});
