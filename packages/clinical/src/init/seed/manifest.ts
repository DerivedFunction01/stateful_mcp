import {
	ClinicalInitSeedDiagnosticCode,
	type ClinicalInitDiagnostic,
} from "../types";
import type {
	ClinicalInitSeedLoadedRecord,
	ClinicalInitSeedManifest,
} from "./record";

export const STARTER_CLINICAL_INIT_MANIFEST: ClinicalInitSeedManifest = {
	manifestId: "starter.default",
	version: 1,
	description: "Language-neutral clinical parser bootstrap starter configuration",
	modules: [
		{
			moduleId: "starter.profile",
			version: 1,
			kinds: ["profile"],
			format: "typed",
			load: async () => (await import("./modules/profile")).records,
		},
		{
			moduleId: "starter.temporal",
			version: 1,
			requires: ["starter.profile"],
			kinds: ["calendar_vocabulary", "date_pattern", "time_pattern", "relative_time_rule", "range_rule", "cadence_rule", "exclusion_rule"],
			format: "typed",
			load: async () => (await import("./modules/temporal")).records,
		},
		{
			moduleId: "starter.parsing",
			version: 1,
			requires: ["starter.profile"],
			kinds: ["attribute_rule", "evaluator_rule", "field_rule", "concept_default"],
			format: "typed",
			load: async () => (await import("./modules/parsing")).records,
		},
		{
			moduleId: "starter.enrichment",
			version: 1,
			requires: ["starter.profile"],
			kinds: ["prose_rule", "prose_parser_template", "shared_field_anchor", "stop_word_list", "stop_word_profile"],
			format: "typed",
			load: async () => (await import("./modules/enrichment")).records,
		},
		{
			moduleId: "starter.reference-data",
			version: 1,
			requires: ["starter.profile"],
			kinds: ["personnel", "facility", "jurisdictional_display", "macro"],
			format: "typed",
			load: async () => (await import("./modules/reference-data")).records,
		},
		{
			moduleId: "starter.vocabulary",
			version: 1,
			requires: ["starter.profile"],
			kinds: ["dictionary_expression", "concept_relation"],
			format: "typed",
			load: async () => (await import("./modules/vocabulary")).records,
		},
		{
			moduleId: "starter.variations",
			version: 1,
			requires: ["starter.profile", "starter.temporal"],
			kinds: ["variation_group"],
			format: "typed",
			load: async () => (await import("./modules/variations")).records,
		},
	],
};

export async function loadClinicalInitSeedModules(
	manifest: ClinicalInitSeedManifest = STARTER_CLINICAL_INIT_MANIFEST,
	moduleIds?: string[],
): Promise<ClinicalInitSeedLoadedRecord[]> {
	const selected = new Set(moduleIds ?? manifest.modules.map((module) => module.moduleId));
	const byId = new Map(manifest.modules.map((module) => [module.moduleId, module]));
	const ordered: typeof manifest.modules = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();

	const visit = (moduleId: string): void => {
		if (visited.has(moduleId)) return;
		if (visiting.has(moduleId)) throw new Error(`Circular starter seed dependency at ${moduleId}`);
		const module = byId.get(moduleId);
		if (!module) throw new Error(`Unknown starter seed module ${moduleId}`);
		visiting.add(moduleId);
		for (const dependency of module.requires ?? []) visit(dependency);
		visiting.delete(moduleId);
		visited.add(moduleId);
		ordered.push(module);
	};

	for (const moduleId of selected) visit(moduleId);

	const records: ClinicalInitSeedLoadedRecord[] = [];
	const recordIds = new Set<string>();
	for (const module of ordered) {
		const loaded = await module.load();
		for (const record of loaded) {
			if (recordIds.has(record.recordId)) throw new Error(`Duplicate starter seed record ID ${record.recordId}`);
			recordIds.add(record.recordId);
			records.push({ ...record, sourceModuleId: module.moduleId, sourceModuleVersion: module.version });
		}
	}
	return records;
}

export function validateClinicalInitSeedManifest(
	manifest: ClinicalInitSeedManifest,
): ClinicalInitDiagnostic[] {
	const diagnostics: ClinicalInitDiagnostic[] = [];
	const moduleIds = new Set<string>();
	const kinds = new Set<string>();
	const requiredKinds = [
		"profile",
		"attribute_rule",
		"evaluator_rule",
		"field_rule",
		"concept_default",
		"prose_rule",
		"prose_parser_template",
		"shared_field_anchor",
		"stop_word_list",
		"stop_word_profile",
		"personnel",
		"facility",
		"jurisdictional_display",
		"macro",
		"dictionary_expression",
		"concept_relation",
	];

	for (const module of manifest.modules) {
		if (moduleIds.has(module.moduleId))
			diagnostics.push({
				severity: "error",
				code: ClinicalInitSeedDiagnosticCode.DUPLICATE_SEED_MODULE_ID,
				message: `Starter module ID ${module.moduleId} is duplicated.`,
				phase: "bootstrap",
			});
		moduleIds.add(module.moduleId);
		for (const kind of module.kinds) kinds.add(kind);
		for (const dependency of module.requires ?? []) {
			if (
				!manifest.modules.some(
					(candidate) => candidate.moduleId === dependency,
				)
			)
				diagnostics.push({
					severity: "error",
					code: ClinicalInitSeedDiagnosticCode.MISSING_SEED_MODULE_DEPENDENCY,
					message: `Starter module ${module.moduleId} requires missing module ${dependency}.`,
					phase: "bootstrap",
				});
		}
	}
	for (const kind of requiredKinds)
		if (!kinds.has(kind))
			diagnostics.push({
				severity: "error",
				code: ClinicalInitSeedDiagnosticCode.MISSING_STARTER_KIND,
				message: `Starter manifest is missing required record kind ${kind}.`,
				phase: "bootstrap",
			});

	return diagnostics;
}

export interface ClinicalInitVariationResolution {
	variationGroup: string;
	semanticTarget: string;
	selectedVariationId: string;
	selectedPriority: number;
	allVariationIds: string[];
	ambiguityPolicy: "first" | "highest_priority" | "reject" | "collect";
}

export function resolveVariations(
	records: ClinicalInitSeedLoadedRecord[],
): ClinicalInitVariationResolution[] {
	const groups = new Map<string, ClinicalInitSeedLoadedRecord[]>();

	for (const record of records) {
		if (record.kind !== "variation_group") continue;
		const group = record.variationGroup;
		if (!group) continue;
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)!.push(record);
	}

	const resolutions: ClinicalInitVariationResolution[] = [];

	for (const [group, variants] of groups) {
		const enabled = variants.filter((v) => v.enabled !== false);
		if (enabled.length === 0) continue;

		const ambiguityPolicy = enabled[0]?.ambiguityPolicy ?? "first";
		const semanticTarget = enabled[0]?.payload.semanticTarget as string | undefined;

		let selected: ClinicalInitSeedLoadedRecord;

		if (ambiguityPolicy === "highest_priority") {
			selected = enabled.reduce((best, current) =>
				(current.variationPriority ?? 0) > (best.variationPriority ?? 0) ? current : best,
			);
		} else {
			selected = enabled[0]!;
		}

		resolutions.push({
			variationGroup: group,
			semanticTarget: semanticTarget ?? group,
			selectedVariationId: selected.variationId ?? selected.recordId,
			selectedPriority: selected.variationPriority ?? 0,
			allVariationIds: variants.map((v) => v.variationId ?? v.recordId),
			ambiguityPolicy,
		});
	}

	return resolutions;
}

export function validateLoadedVariations(
	records: ClinicalInitSeedLoadedRecord[],
): ClinicalInitDiagnostic[] {
	const diagnostics: ClinicalInitDiagnostic[] = [];
	const variationIds = new Set<string>();
	const groups = new Map<string, string[]>();

	for (const record of records) {
		if (record.kind !== "variation_group") continue;
		const group = record.variationGroup;
		if (!group) continue;

		const variationId = record.variationId ?? record.recordId;
		if (variationIds.has(variationId)) {
			diagnostics.push({
				severity: "error",
				code: ClinicalInitSeedDiagnosticCode.DUPLICATE_VARIATION_ID,
				message: `Duplicate variation ID ${variationId} in group ${group}.`,
				phase: "bootstrap",
				recordId: record.recordId,
			});
		}
		variationIds.add(variationId);

		const groupVariants = groups.get(group) ?? [];
		groupVariants.push(variationId);
		groups.set(group, groupVariants);
	}

	for (const [group, ids] of groups) {
		if (ids.length < 2) continue;
		const priorities = ids.map((id) => {
			const record = records.find(
				(r) => (r.variationId ?? r.recordId) === id,
			);
			return record?.variationPriority ?? 0;
		});
		const uniquePriorities = new Set(priorities);
		if (uniquePriorities.size < priorities.length) {
			diagnostics.push({
				severity: "warning",
				code: ClinicalInitSeedDiagnosticCode.OVERLAPPING_VARIANTS,
				message: `Variation group ${group} has multiple variants with the same priority.`,
				phase: "bootstrap",
			});
		}
	}

	return diagnostics;
}
