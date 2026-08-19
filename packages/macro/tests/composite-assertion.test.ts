import { describe, expect, test } from "bun:test";
import { createAssertionMacro } from "../src/composition/assertion";
import type { MacroInput } from "../src/contracts/input";

describe("Universal Composite Relational Assertion Engine (createAssertionMacro)", () => {
	test("Clinical Domain: parses composite assessment with supporting findings, refuting rule-outs, and triggers", async () => {
		const clinicalAssessmentMacro = createAssertionMacro(
			{
				macroName: "assessment",
				subjectSlotId: "diagnosis",
				clauses: [
					{
						role: "qualifier",
						slotId: "acuity",
						valueKind: "string",
						connectors: ["acuity", "status"],
					},
					{
						role: "supporting",
						slotId: "findings",
						valueKind: "concept",
						repeatable: true,
						connectors: ["with", "supporting", "due to"],
					},
					{
						role: "supporting",
						slotId: "vitals",
						valueKind: "quantity",
						connectors: ["vitals", "o2"],
					},
					{
						role: "refuting",
						slotId: "rule_outs",
						valueKind: "concept",
						repeatable: true,
						connectors: ["refuting", "ruled out", "excluding"],
					},
					{
						role: "transition",
						slotId: "plan_triggers",
						valueKind: "concept",
						repeatable: true,
						connectors: ["triggers", "order", "consult"],
					},
				],
			},
			(graph) => {
				return {
					recordType: "clinical_assessment",
					primaryDiagnosis: graph.subject,
					acuity: graph.qualifiers.acuity ?? "standard",
					supportingEvidence: graph.evidence.filter(
						(e) => e.role === "supporting",
					),
					refutedAlternatives: graph.evidence.filter(
						(e) => e.role === "refuting",
					),
					planActions: graph.transitions.map((t) => t.value),
				};
			},
			{
				syntax: {
					expressionToken: "#",
					conceptToken: "@",
				},
			},
		);

		expect(clinicalAssessmentMacro.definition.name).toBe("assessment");
		expect(clinicalAssessmentMacro.definition.arguments.length).toBeGreaterThan(
			4,
		);

		// Simulating parsed input from macro parser
		const mockInput: MacroInput = {
			macroName: "assessment",
			sourceLines: [
				{
					line: 1,
					raw: "^assessment #asthma acuity acute with #wheezing vitals 92% refuting #pe triggers #albuterol",
				},
			],
			arguments: [
				{ name: "diagnosis", rawValue: "#asthma", source: "named" },
				{ name: "acuity", rawValue: "acute", source: "friendly" },
				{ name: "findings", rawValue: "#wheezing", source: "friendly" },
				{ name: "vitals", rawValue: "92%", source: "friendly" },
				{ name: "rule_outs", rawValue: "#pe", source: "friendly" },
				{ name: "plan_triggers", rawValue: "#albuterol", source: "friendly" },
			],
			matches: [],
		};

		const result = (await clinicalAssessmentMacro.compile!(
			[],
			mockInput,
		)) as Record<string, unknown>;
		expect(result.recordType).toBe("clinical_assessment");
		expect(result.primaryDiagnosis).toEqual({
			conceptId: "asthma",
			term: "asthma",
			rawText: "#asthma",
		});
		expect(result.acuity).toBe("acute");

		const supporting = result.supportingEvidence as unknown[];
		expect(supporting).toHaveLength(2);
		expect(supporting[0]).toMatchObject({
			role: "supporting",
			slotId: "findings",
			value: { conceptId: "wheezing", term: "wheezing" },
		});
		expect(supporting[1]).toMatchObject({
			role: "supporting",
			slotId: "vitals",
			value: { kind: "quantity", magnitude: 92, unit: "%" },
		});

		const refuting = result.refutedAlternatives as unknown[];
		expect(refuting).toHaveLength(1);
		expect(refuting[0]).toMatchObject({
			role: "refuting",
			slotId: "rule_outs",
			value: { conceptId: "pe", term: "pe" },
		});

		const actions = result.planActions as unknown[];
		expect(actions).toHaveLength(1);
		expect(actions[0]).toEqual({
			conceptId: "albuterol",
			term: "albuterol",
			rawText: "#albuterol",
		});
	});

	test("DevOps Domain: parses incident triage with latency measurements, rule-outs, and mitigation triggers", async () => {
		const devopsIncidentMacro = createAssertionMacro(
			{
				macroName: "incident",
				subjectSlotId: "service",
				clauses: [
					{
						role: "qualifier",
						slotId: "severity",
						valueKind: "string",
						connectors: ["severity", "sev"],
					},
					{
						role: "supporting",
						slotId: "telemetry",
						valueKind: "quantity",
						connectors: ["with latency", "error_rate"],
					},
					{
						role: "refuting",
						slotId: "rule_outs",
						valueKind: "concept",
						connectors: ["refuting", "not"],
					},
					{
						role: "transition",
						slotId: "actions",
						valueKind: "concept",
						connectors: ["triggers", "dispatch"],
					},
				],
			},
			(graph) => ({
				incidentType: "production_triage",
				affectedService: (graph.subject as { term: string }).term,
				severity: graph.qualifiers.severity,
				corroboratingMetrics: graph.evidence
					.filter((e) => e.role === "supporting")
					.map((e) => e.value),
				ruledOutCauses: graph.evidence
					.filter((e) => e.role === "refuting")
					.map((e) => e.value),
				automatedDispatches: graph.transitions.map((t) => t.value),
			}),
			{
				syntax: {
					expressionToken: "#",
				},
			},
		);

		const mockInput: MacroInput = {
			macroName: "incident",
			sourceLines: [
				{
					line: 1,
					raw: "^incident #auth-service severity P1 with latency 1200ms refuting #db-failure triggers #restart-pods",
				},
			],
			arguments: [
				{ name: "service", rawValue: "#auth-service", source: "named" },
				{ name: "severity", rawValue: "P1", source: "friendly" },
				{ name: "telemetry", rawValue: "1200ms", source: "friendly" },
				{ name: "rule_outs", rawValue: "#db-failure", source: "friendly" },
				{ name: "actions", rawValue: "#restart-pods", source: "friendly" },
			],
			matches: [],
		};

		const result = (await devopsIncidentMacro.compile!(
			[],
			mockInput,
		)) as Record<string, unknown>;
		expect(result.incidentType).toBe("production_triage");
		expect(result.affectedService).toBe("auth-service");
		expect(result.severity).toBe("P1");
		expect(result.corroboratingMetrics).toEqual([
			{
				kind: "quantity",
				magnitude: 1200,
				unit: "ms",
				rawText: "1200ms",
			},
		]);
		expect(result.ruledOutCauses).toEqual([
			{ conceptId: "db-failure", term: "db-failure", rawText: "#db-failure" },
		]);
		expect(result.automatedDispatches).toEqual([
			{
				conceptId: "restart-pods",
				term: "restart-pods",
				rawText: "#restart-pods",
			},
		]);
	});

	test("FinTech Domain: parses financial fraud assertion with currency amount and freeze triggers", async () => {
		const fraudFlagMacro = createAssertionMacro(
			{
				macroName: "fraud_flag",
				subjectSlotId: "account",
				clauses: [
					{
						role: "supporting",
						slotId: "amount",
						valueKind: "currency",
						connectors: ["with amount", "flagging"],
					},
					{
						role: "refuting",
						slotId: "rule_outs",
						valueKind: "concept",
						connectors: ["refuting", "verified"],
					},
					{
						role: "transition",
						slotId: "triggers",
						valueKind: "concept",
						connectors: ["triggers", "action"],
					},
				],
			},
			(graph) => ({
				auditKind: "anti_money_laundering",
				account: (graph.subject as { term: string }).term,
				amount: graph.evidence.find((e) => e.slotId === "amount")?.value,
				actions: graph.transitions.map((t) => t.value),
			}),
			{
				grammar: {
					values: {
						currency: {
							currencies: { USD: ["$"] },
						},
					},
				},
				syntax: {
					expressionToken: "#",
				},
			},
		);

		const mockInput: MacroInput = {
			macroName: "fraud_flag",
			sourceLines: [
				{
					line: 1,
					raw: "^fraud_flag #acc-9843 with amount $500,000 refuting #whitelisted triggers #freeze-account",
				},
			],
			arguments: [
				{ name: "account", rawValue: "#acc-9843", source: "named" },
				{ name: "amount", rawValue: "$500,000", source: "friendly" },
				{ name: "rule_outs", rawValue: "#whitelisted", source: "friendly" },
				{ name: "triggers", rawValue: "#freeze-account", source: "friendly" },
			],
			matches: [],
		};

		const result = (await fraudFlagMacro.compile!([], mockInput)) as Record<
			string,
			unknown
		>;
		expect(result.auditKind).toBe("anti_money_laundering");
		expect(result.account).toBe("acc-9843");
		expect(result.amount).toMatchObject({
			kind: "currency",
			amount: 500000,
			currency: "USD",
			subunits: 50000000,
		});
	});

	test("Repeatable & List Clauses: supports comma-separated list items and repeated clause occurrences", async () => {
		const multiEvidenceMacro = createAssertionMacro(
			{
				macroName: "triage",
				subjectSlotId: "target",
				clauses: [
					{
						role: "supporting",
						slotId: "findings",
						valueKind: "concept",
						repeatable: true,
						itemDelimiter: ",",
						connectors: ["with", "supporting"],
					},
					{
						role: "refuting",
						slotId: "rule_outs",
						valueKind: "concept",
						repeatable: true,
						itemDelimiter: ",",
						connectors: ["refuting", "not"],
					},
				],
			},
			(graph) => ({
				target: (graph.subject as { term: string }).term,
				supportingCount: graph.evidence.filter((e) => e.role === "supporting")
					.length,
				supportingTerms: graph.evidence
					.filter((e) => e.role === "supporting")
					.map((e) => (e.value as { term: string }).term),
				refutingCount: graph.evidence.filter((e) => e.role === "refuting")
					.length,
				refutingTerms: graph.evidence
					.filter((e) => e.role === "refuting")
					.map((e) => (e.value as { term: string }).term),
			}),
			{
				syntax: {
					expressionToken: "#",
				},
			},
		);

		// Case 1: Comma-separated list items within single argument input
		const listInput: MacroInput = {
			macroName: "triage",
			sourceLines: [
				{
					line: 1,
					raw: "^triage #asthma with #wheezing, #cough, #dyspnea refuting #pe, #pneumonia",
				},
			],
			arguments: [
				{
					name: "target",
					rawValue: "#asthma",
					source: "named",
				},
				{
					name: "findings",
					rawValue: "#wheezing, #cough, #dyspnea",
					source: "friendly",
					items: [
						{ rawValue: "#wheezing", start: 0, end: 9 },
						{ rawValue: "#cough", start: 11, end: 17 },
						{ rawValue: "#dyspnea", start: 19, end: 27 },
					],
				},
				{
					name: "rule_outs",
					rawValue: "#pe, #pneumonia",
					source: "friendly",
					items: [
						{ rawValue: "#pe", start: 0, end: 3 },
						{ rawValue: "#pneumonia", start: 5, end: 15 },
					],
				},
			],
			matches: [],
		};

		const listResult = (await multiEvidenceMacro.compile!(
			[],
			listInput,
		)) as Record<string, unknown>;
		expect(listResult.target).toBe("asthma");
		expect(listResult.supportingCount).toBe(3);
		expect(listResult.supportingTerms).toEqual([
			"wheezing",
			"cough",
			"dyspnea",
		]);
		expect(listResult.refutingCount).toBe(2);
		expect(listResult.refutingTerms).toEqual(["pe", "pneumonia"]);

		// Case 2: Multiple distinct clause arguments repeated across sentence
		const repeatedArgsInput: MacroInput = {
			macroName: "triage",
			sourceLines: [
				{
					line: 1,
					raw: "^triage #asthma with #wheezing with #cough refuting #pe refuting #pneumothorax",
				},
			],
			arguments: [
				{ name: "target", rawValue: "#asthma", source: "named" },
				{ name: "findings", rawValue: "#wheezing", source: "friendly" },
				{ name: "findings", rawValue: "#cough", source: "friendly" },
				{ name: "rule_outs", rawValue: "#pe", source: "friendly" },
				{ name: "rule_outs", rawValue: "#pneumothorax", source: "friendly" },
			],
			matches: [],
		};

		const repeatedResult = (await multiEvidenceMacro.compile!(
			[],
			repeatedArgsInput,
		)) as Record<string, unknown>;
		expect(repeatedResult.supportingCount).toBe(2);
		expect(repeatedResult.supportingTerms).toEqual(["wheezing", "cough"]);
		expect(repeatedResult.refutingCount).toBe(2);
		expect(repeatedResult.refutingTerms).toEqual(["pe", "pneumothorax"]);
	});
});
