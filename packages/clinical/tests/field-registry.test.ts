import { describe, expect, it } from "bun:test";
import type { FieldRegistryTestBlock } from "../src/parser/field-registry/test-types";
import { buildTestToken } from "../src/parser/field-registry/test-types";

// ── Import all registry test blocks ──────────────────────────────────────────
// Each registry exports an optional `registryTests: FieldRegistryTestBlock`.
// Add new imports here when a new field-registry file is created.

import { assessmentRegistryTests } from "../src/parser/field-registry/assessment";
import { medicationRegistryTests } from "../src/parser/field-registry/medication";
import { observationRegistryTests } from "../src/parser/field-registry/observation";
import { vitalsRegistryTests } from "../src/parser/field-registry/vitals";

// ── Generic test runner ───────────────────────────────────────────────────────

function runRegistryTestBlock(block: FieldRegistryTestBlock): void {
	describe(block.schema, () => {
		for (const testCase of block.cases) {
			it(testCase.description, () => {
				const token = buildTestToken(testCase.input);

				const result = block.router(
					token,
					testCase.input.conceptDefaults ?? null,
					block.schema,
					undefined, // profile — not needed for unit-level registry tests
					testCase.input.attributeRules,
					testCase.input.conceptFields,
					testCase.input.unmatched,
				);

				if (testCase.matchKeys) {
					// Partial assertion — only check the declared keys
					for (const key of testCase.matchKeys) {
						expect(result[key]).toEqual(testCase.expected[key]);
					}
				} else {
					// Full output assertion
					expect(result).toEqual(testCase.expected);
				}
			});
		}
	});
}

// ── Run all blocks ────────────────────────────────────────────────────────────

describe("Field Registry", () => {
	runRegistryTestBlock(vitalsRegistryTests);
	runRegistryTestBlock(observationRegistryTests);
	runRegistryTestBlock(medicationRegistryTests);
	runRegistryTestBlock(assessmentRegistryTests);
});
