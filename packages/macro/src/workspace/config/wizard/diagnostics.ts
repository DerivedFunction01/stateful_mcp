import type { SettingsDiagnosticDto } from "@stateful-mcp/macro-protocol";
import type { WizardCollectionKey, WizardStepId } from "./state";

/**
 * Maps structured diagnostic paths onto wizard fields (`step.domain.rest`)
 * for step-level badges. Unknown codes are passed through untouched; the full
 * structured list always stays available for graph-level rendering.
 */
export const DIAGNOSTIC_STEP_BY_ROOT: Readonly<Record<string, WizardStepId>> =
	Object.freeze({
		syntax: "scope-profile",
		id: "scope-profile",
		extends: "scope-profile",
		locale: "scope-profile",
		numberWords: "numerics-lexicon",
		localization: "numerics-lexicon",
		unitAliases: "numerics-lexicon",
		operatorAliases: "numerics-lexicon",
		statisticalAliases: "numerics-lexicon",
		argumentPolicies: "combinators",
	});

const NUMERIC_ROOTS = new Set(["values"]);
const LEXICON_COLLECTIONS = new Set<string>(["aliases"]);
const TEMPLATE_COLLECTIONS = new Set<string>(["dateTimeFormats"]);
const COMBINATOR_COLLECTIONS = new Set<string>(["fundamentals", "recipes"]);

export interface DiagnosticFieldBinding {
	readonly step: WizardStepId;
	readonly fieldKey: string;
}

/** Resolves the wizard field binding for one diagnostic's path, if mapped. */
export function bindDiagnosticToField(
	diagnostic: SettingsDiagnosticDto,
): DiagnosticFieldBinding | null {
	const path = diagnostic.path ?? [];
	const root = path[0];
	if (root === undefined) return null;
	if (root === "removedIds") {
		if (TEMPLATE_COLLECTIONS.has(String(path[1]))) {
			return { step: "base-templates", fieldKey: "templates.removedIds" };
		}
		return null;
	}
	if (NUMERIC_ROOTS.has(root)) {
		if (path[1] === "numeric") {
			return joinBinding("numerics-lexicon", "numerics", path.slice(2));
		}
		if (path[1] === "dateTime") {
			return joinBinding("base-templates", "templates", path.slice(2));
		}
		return null;
	}
	const collectionKey = root as WizardCollectionKey;
	if (LEXICON_COLLECTIONS.has(collectionKey)) {
		return joinBinding("numerics-lexicon", "lexicon", path.slice(1));
	}
	if (TEMPLATE_COLLECTIONS.has(collectionKey)) {
		return joinBinding("base-templates", "templates", path.slice(1));
	}
	if (COMBINATOR_COLLECTIONS.has(collectionKey)) {
		return joinBinding("combinators", "combinators", path.slice(1));
	}
	const fixed = DIAGNOSTIC_STEP_BY_ROOT[root];
	if (!fixed) return null;
	// single-segment paths carry their leaf as the field name
	return joinBinding(
		fixed,
		fixed,
		path.slice(1).length > 0 ? path.slice(1) : [root],
	);
}

function joinBinding(
	step: WizardStepId,
	prefix: string,
	tail: readonly string[],
): DiagnosticFieldBinding {
	const fieldKey = [prefix, ...tail].join(".");
	return { step, fieldKey };
}

/**
 * Projects a merged diagnostic list into a field-indexed map. The map retains
 * full structured DTOs; graph-level rendering reuses the original list.
 */
export function projectFieldDiagnostics(
	diagnostics: readonly SettingsDiagnosticDto[],
): Readonly<Record<string, readonly SettingsDiagnosticDto[]>> {
	const fields: Record<string, SettingsDiagnosticDto[]> = {};
	for (const diagnostic of diagnostics) {
		const binding = bindDiagnosticToField(diagnostic);
		if (!binding) continue;
		const bucket = fields[binding.fieldKey];
		if (bucket) bucket.push(diagnostic);
		else fields[binding.fieldKey] = [diagnostic];
	}
	return fields;
}

export function stepDiagnosticCount(
	fields: Readonly<Record<string, readonly SettingsDiagnosticDto[]>>,
	step: WizardStepId,
): number {
	let total = 0;
	for (const [key, list] of Object.entries(fields)) {
		if (key.startsWith(step)) total += list.length;
	}
	return total;
}
