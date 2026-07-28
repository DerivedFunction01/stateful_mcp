import type { AttributeParserRule } from "../../store/interfaces";

// ── Input shape mirrors the router function signature ─────────────────────────

export interface FieldRegistryTestInput {
	/**
	 * namedGroups is keyed by sourceKey, value is the regex capture groups for
	 * that slot. Mirrors token.namedGroups inside FieldResolverEngine.transform.
	 *
	 * Example — blood pressure:
	 *   namedGroups: { blood_pressure: { systolic: "120", diastolic: "80", unit: "mmHg" } }
	 *
	 * Example — quantity (vitals):
	 *   namedGroups: { quantity: { quantity: "37.5", unit: "C" } }
	 */
	namedGroups?: Record<string, Record<string, string | undefined>>;

	/**
	 * Direct slot values on the token (fallback path in the engine).
	 * Used for non-compute rules like valueMap / direct slot reads.
	 */
	slots?: Record<string, any>;

	/**
	 * Concept defaults from the clinical dictionary.
	 */
	conceptDefaults?: Record<string, any> | null;

	/**
	 * Attribute rules injected into the registry factory.
	 */
	attributeRules?: AttributeParserRule[];

	/**
	 * Already-resolved concept fields (prevents overwrite by unmatched fallback).
	 */
	conceptFields?: Record<string, any>;

	/**
	 * Unmatched concept nodes passed from the router caller.
	 */
	unmatched?: any[];
}

// ── A single test case ────────────────────────────────────────────────────────

export interface FieldRegistryTestCase {
	/** Human-readable label shown in test output. */
	description: string;

	/** Input to feed through the router. */
	input: FieldRegistryTestInput;

	/** Full expected router output. Use `matchKeys` for partial assertions. */
	expected: Record<string, any>;

	/**
	 * When set, only these top-level keys are asserted.
	 * Useful when the router output contains many fields and you only care
	 * about the ones a specific rule produces.
	 */
	matchKeys?: string[];
}

// ── The test block exported from each registry file ───────────────────────────

export interface FieldRegistryTestBlock {
	/** Schema name — used as the describe() label in the test runner. */
	schema: string;

	/**
	 * The router function under test.
	 * Signature matches the pattern used by all field-registry routers.
	 */
	router: (
		token: Record<string, any>,
		conceptDefaults: Record<string, any> | null,
		targetSchema: string,
		profile: any,
		attributeRules?: AttributeParserRule[],
		conceptFields?: Record<string, any>,
		unmatched?: any[],
	) => Record<string, any>;

	cases: FieldRegistryTestCase[];
}

// ── Helper: build the token object the engine expects ────────────────────────

/**
 * Constructs the token object that FieldResolverEngine.transform receives from
 * a FieldRegistryTestInput, so test authors don't need to think about the
 * internal token shape.
 */
export function buildTestToken(
	input: FieldRegistryTestInput,
): Record<string, any> {
	const token: Record<string, any> = {
		...(input.slots ?? {}),
		namedGroups: input.namedGroups ?? {},
	};
	return token;
}
