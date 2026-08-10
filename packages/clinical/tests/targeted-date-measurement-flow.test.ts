import { describe, expect, test } from "bun:test";
import { applySetupPrimitiveProfile } from "../src/setup/setup-profile";
import { createNumericalSyntaxProfile } from "../src/values/numerical-syntax-profile";
import { parseQuantity } from "../src/values/quantity-grammar";
import { assembleClinicalDateRange } from "../src/values/date-range-assembler";
import { compileTemporalGrammar, matchTemporalGrammar } from "../src/setup/temporal-grammar-compiler";
import { DateRangeChildExecutor } from "../src/macros/child-executors/date-range-child-executor";

describe("Targeted Date, Measurement, and Child Macro Flow", () => {
	test("Phase 1: setup primitive profile overlay preserves numerical profile separation", () => {
		const base = createNumericalSyntaxProfile({ profileId: "base:numerical" });
		const updated = applySetupPrimitiveProfile(base, {
			profileId: "test",
			version: 1,
			dateExamples: [],
			timeExamples: [],
			measurementExamples: [],
			unitAliases: { bpm: "beats/min" },
			temporalAliases: { today: "0" },
		});

		expect(updated.temporal.relativeDayAliases["today"]).toBe(0);
		expect(updated.temporal.unitAliases["bpm"]).toBeUndefined();
	});

	test("Phase 2: quantity parsing with measurement unit aliases and consumer policy", () => {
		const config = {
			unitAliases: { bpm: "beats/min", mmhg: "mmHg" },
			rangeDelimiters: ["to", "-"],
			operatorAliases: { ">": "gt" as const },
		};
		const policy = {
			allowRange: true,
			allowOperator: true,
			statistics: "accept" as const,
			allowDataPointCount: false,
		};

		const res = parseQuantity("120-130 mmHg", config, policy);
		expect(res.value).toBeDefined();
		expect(res.value?.lower).toBe(120);
		expect(res.value?.upper).toBe(130);
		expect(res.value?.unit).toBe("mmHg");

		const noRangePolicy = { ...policy, allowRange: false };
		const noRangeRes = parseQuantity("120-130 mmHg", config, noRangePolicy);
		expect(noRangeRes.value).toBeUndefined();
		expect(noRangeRes.diagnostics[0]?.code).toBe("range_not_allowed");
	});

	test("Phase 4 & Strict Semantics: DateRange exclusion lookahead and anchor matching", () => {
		const grammar = compileTemporalGrammar({
			grammarId: "test_date_range",
			template: {
				templateId: "abs_range",
				version: 1,
				parts: [
					{ kind: "slot", slotId: "start", blockId: "date_b", required: true },
					{ kind: "literal", text: "to" },
					{ kind: "slot", slotId: "end", blockId: "date_b", required: true },
					{ kind: "literal", text: "except", optional: true },
					{ kind: "slot", slotId: "exclude", blockId: "date_b", required: false },
				],
				gaps: [],
				whitespace: "flexible",
				punctuation: "flexible",
				precedence: 100,
				status: "published",
			},
			slotPatterns: {
				start: { blockId: "date_b", targetPath: "time.start", pattern: "\\d{2}\\.\\d{2}\\.\\d{4}" },
				end: { blockId: "date_b", targetPath: "time.end", pattern: "\\d{2}\\.\\d{2}\\.\\d{4}" },
				exclude: { blockId: "date_b", targetPath: "time.excluded", pattern: "\\d{2}\\.\\d{2}\\.\\d{4}" },
			},
		});

		const matchPos = matchTemporalGrammar(grammar, "31.01.2026 to 05.02.2026 except 02.02.2026");
		expect(matchPos.match).toBeDefined();
		expect(matchPos.match?.slots["start"]).toBe("31.01.2026");
		expect(matchPos.match?.slots["exclude"]).toBe("02.02.2026");

		const matchNeg = matchTemporalGrammar(grammar, "all usual symptoms except SOB");
		expect(matchNeg.match).toBeUndefined();
	});

	test("Phase 4: DateRange child executor output structure", async () => {
		const executor = new DateRangeChildExecutor();
		const grammar = compileTemporalGrammar({
			grammarId: "test_date_range",
			template: {
				templateId: "abs_range",
				version: 1,
				parts: [
					{ kind: "slot", slotId: "start", blockId: "date_b", required: true },
					{ kind: "literal", text: "to" },
					{ kind: "slot", slotId: "end", blockId: "date_b", required: true },
				],
				gaps: [],
				whitespace: "flexible",
				punctuation: "flexible",
				precedence: 100,
				status: "published",
			},
			slotPatterns: {
				start: { blockId: "date_b", targetPath: "time.start", pattern: "\\d{2}\\.\\d{2}\\.\\d{4}" },
				end: { blockId: "date_b", targetPath: "time.end", pattern: "\\d{2}\\.\\d{2}\\.\\d{4}" },
			},
		});

		const result = await executor.execute({
			parentInput: {
				macroName: "observation",
				sourceLines: [{ line: 1, raw: "^observation pneumonia 31.01.2026 to 05.02.2026" }],
				arguments: [{ position: 0, rawValue: "31.01.2026 to 05.02.2026", source: "positional" }],
			},
			parentDefinition: {
				macroId: "observation",
				macroName: "observation",
				version: 1,
				status: "published",
				active: true,
				root: { roleName: "observation", targetSchema: "Observation", outputCellKind: "structured" },
				arguments: [],
			},
			childDefinition: {
				childMacroName: "^date",
				parentRoleName: "observation",
				parentTargetPath: "Observation.dateRange",
				mergeStrategy: "replace",
				input: { mode: "positional", position: 0 },
			},
			compiledGrammar: grammar,
			groupId: "grp_test",
		});

		expect(result.operations.length).toBe(1);
		expect(result.operations[0]?.targetPath).toBe("Observation.dateRange");
		expect(result.operations[0]?.value.kind).toBe("temporal");
	});
});
