import type { ClinicalRuntimeParserStores } from "../../store/clinical-runtime";
import { buildCalendarDateRules } from "../../store/rules-builder";
import {
	type ClinicalInitDiagnostic,
	ClinicalInitSeedDiagnosticCode,
} from "../types";

export type BootstrapReadiness =
	| "not-checked"
	| "bootstrap-ready"
	| "full-ready"
	| "degraded";

export interface BootstrapReadinessDiagnostics {
	declaredEmpty: string[];
	populated: string[];
	diagnostics: ClinicalInitDiagnostic[];
}

export async function validateBootstrapReadiness(
	stores: ClinicalRuntimeParserStores,
): Promise<BootstrapReadiness> {
	const profiles = await stores.profiles.list();
	if (profiles.length === 0) return "degraded";

	const activeProfile = profiles[0]!;

	// Empty declared stores are valid during the placeholder-seed phase. A
	// profile is the only required signal that the parser runtime exists.
	return activeProfile.profileId ? "bootstrap-ready" : "degraded";
}

export async function getBootstrapReadinessDiagnostics(
	stores: ClinicalRuntimeParserStores,
): Promise<BootstrapReadinessDiagnostics> {
	const profiles = await stores.profiles.list();
	if (profiles.length === 0) {
		return {
			declaredEmpty: [],
			populated: [],
			diagnostics: [],
		};
	}

	const activeProfile = profiles[0]!;
	const [
		attributeBindings,
		evaluatorBindings,
		conceptDefaults,
		sharedAnchors,
		proseTemplates,
		conceptFields,
		dictionaryExpressions,
	] = await Promise.all([
		stores.attributeBindings.listBindings(activeProfile.profileId),
		stores.evaluatorBindings.listBindings(activeProfile.profileId),
		stores.conceptDefaults.list(),
		stores.sharedFieldAnchors.listForContext({}),
		stores.proseTemplates.list(),
		stores.conceptFields.list(),
		stores.dictionaryStore?.getExpressions() ?? Promise.resolve([]),
	]);

	const populations: Array<[string, number]> = [
		["attributeBindings", attributeBindings.length],
		["evaluatorBindings", evaluatorBindings.length],
		["conceptDefaults", conceptDefaults.length],
		["sharedFieldAnchors", sharedAnchors.length],
		["proseTemplates", proseTemplates.length],
		["conceptFields", conceptFields.length],
		["dictionaryExpressions", dictionaryExpressions.length],
	];
	const declaredEmpty = populations
		.filter(([, count]) => count === 0)
		.map(([name]) => name);
	const populated = populations
		.filter(([, count]) => count > 0)
		.map(([name]) => name);

	return {
		declaredEmpty,
		populated,
		diagnostics: declaredEmpty.map((name) => ({
			severity: "info" as const,
			code: ClinicalInitSeedDiagnosticCode.DECLARED_EMPTY_STORE,
			message: `${name} is declared and wired but currently empty; populate it in a later seed phase.`,
			phase: "validation" as const,
			path: name,
		})),
	};
}

export async function getTemporalDiagnostics(
	stores: ClinicalRuntimeParserStores,
): Promise<{ hasCalendarDateFormats: boolean; compiledRuleCount: number }> {
	const profiles = await stores.profiles.list();
	const hasCalendarDateFormats = profiles.some(
		(p) => (p.calendarDateFormats?.length ?? 0) > 0,
	);

	const allRules = new Set<string>();
	for (const profile of profiles) {
		const effectiveRules = [
			...(profile.attributeRules ?? []),
			...(profile.calendarDateFormats
				? buildCalendarDateRules(profile.calendarDateFormats)
				: []),
		];
		for (const rule of effectiveRules) {
			allRules.add(rule.targetField);
		}
	}

	return {
		hasCalendarDateFormats,
		compiledRuleCount: allRules.size,
	};
}
