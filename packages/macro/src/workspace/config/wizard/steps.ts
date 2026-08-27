import type { SettingsDiagnosticDto } from "@stateful-mcp/macro-protocol";
import type {
	ValueAuthoringWizardState,
	WizardGuardDenial,
	WizardStepId,
} from "./state";
import { WIZARD_STEPS } from "./state";
import { isRecipeReferenceGraphResolvable } from "./steps/combinators";

export type { WizardStepId };
export { WIZARD_STEPS };

/**
 * Structured denial codes. `reasonKey` reuses existing i18n keys so the model
 * requires no new translations (Phase 4 renders copy purely by key).
 */
export const GUARD_CODES = {
	profileNotResolved: "PROFILE_NOT_RESOLVED",
	malformedSyntaxFailure: "MALFORMED_SYNTAX_FAILURE",
	referencesUnresolved: "REFERENCES_UNRESOLVED",
	catalogUnavailable: "CATALOG_UNRESOLVED",
	conflictFrozen: "CONFLICT_FROZEN",
} as const;

const GUARD_REASON_KEYS: Record<string, string> = Object.freeze({
	[GUARD_CODES.profileNotResolved]: "settings.unavailable",
	[GUARD_CODES.malformedSyntaxFailure]: "settings.values.parseError",
	[GUARD_CODES.referencesUnresolved]: "settings.diagnostic.invalidValue",
	[GUARD_CODES.catalogUnavailable]: "settings.unavailable",
	[GUARD_CODES.conflictFrozen]: "settings.conflict",
});

export function guardReasonKey(code: string): string {
	return GUARD_REASON_KEYS[code] ?? "settings.unavailable";
}

/**
 * Detects malformed mandatory authored-graph syntax failures from settled
 * validation diagnostics (computed from state; never a hardcoded boolean).
 */
export function hasMalformedSyntaxFailure(
	diagnostics: readonly SettingsDiagnosticDto[],
): boolean {
	return diagnostics.some(
		(diagnostic) =>
			diagnostic.severity === "error" &&
			typeof diagnostic.code === "string" &&
			diagnostic.code.includes("MALFORMED"),
	);
}

export interface StepGuardDecision {
	readonly enterable: boolean;
	readonly denials: readonly WizardGuardDenial[];
}

function profileResolved(state: ValueAuthoringWizardState): boolean {
	return (
		state.editedProfileId !== null &&
		state.editedProfileId !== undefined &&
		state.localProfile !== null
	);
}

function guardDenial(to: WizardStepId, code: string): WizardGuardDenial {
	return { from: null, to, code, reasonKey: guardReasonKey(code) };
}

/**
 * Typed navigation guards computed purely from wizard state:
 * - `scope-profile` is always enterable.
 * - `numerics-lexicon` requires a resolved target profile (load ok or new-local).
 * - `base-templates` denies malformed mandatory-syntax failures only.
 * - `combinators` requires referenced formats/terminals to resolve against
 *   the catalog carried from load.
 * - `sandbox` mirrors template gating; run actions are rejected separately so
 *   invalid graphs may still be inspected here.
 */
export function evaluateStepGuards(
	state: ValueAuthoringWizardState,
): Readonly<Record<WizardStepId, StepGuardDecision>> {
	const decisions = {} as Record<WizardStepId, StepGuardDecision>;
	for (const step of WIZARD_STEPS)
		decisions[step] = { enterable: true, denials: [] };

	const notResolved = profileResolved(state)
		? []
		: [guardDenial("numerics-lexicon", GUARD_CODES.profileNotResolved)];
	decisions["scope-profile"] = { enterable: true, denials: [] };

	const malformed = hasMalformedSyntaxFailure(state.validation.diagnostics);
	const malformedDenials = malformed
		? [guardDenial("base-templates", GUARD_CODES.malformedSyntaxFailure)]
		: [];

	decisions["numerics-lexicon"] = {
		enterable: notResolved.length === 0,
		denials: notResolved,
	};
	decisions["base-templates"] = {
		enterable: notResolved.length === 0 && malformedDenials.length === 0,
		denials: [...notResolved, ...malformedDenials],
	};

	let combinatorDenials: WizardGuardDenial[] = [...notResolved];
	if (notResolved.length === 0 && state.localProfile) {
		const references = isRecipeReferenceGraphResolvable(
			state.localProfile,
			state.catalog,
		);
		combinatorDenials = [
			...combinatorDenials,
			...(references.ok
				? []
				: [
						guardDenial(
							"combinators",
							state.catalog
								? GUARD_CODES.referencesUnresolved
								: GUARD_CODES.catalogUnavailable,
						),
					]),
		];
	}
	decisions["combinators"] = {
		enterable: combinatorDenials.length === 0,
		denials: combinatorDenials,
	};
	decisions["sandbox"] = {
		enterable: notResolved.length === 0 && malformedDenials.length === 0,
		denials: [...notResolved, ...malformedDenials],
	};
	return decisions;
}
