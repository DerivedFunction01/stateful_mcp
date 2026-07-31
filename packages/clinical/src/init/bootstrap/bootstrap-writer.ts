import type {
	ClinicalInitSeedKind,
	ClinicalInitSeedLoadedRecord,
} from "../seed/record";
import type { ClinicalInitDiagnostic, ClinicalInitSeedPolicy } from "../types";
import { ClinicalInitSeedDiagnosticCode } from "../types";
import {
	normalizeAttributeRule,
	normalizeConceptDefault,
	normalizeEvaluatorRule,
	normalizeFacility,
	normalizeFieldRule,
	normalizeJurisdictionalDisplay,
	normalizeMacro,
	normalizePersonnel,
	normalizeProfile,
	normalizeProseParserTemplate,
	normalizeProseRule,
	normalizeSharedAnchor,
	normalizeStopWordList,
	normalizeStopWordProfile,
} from "./normalizers";
import type { BootstrapStores } from "./stores";

export interface ClinicalInitBootstrapResult {
	recordsWritten: Partial<Record<ClinicalInitSeedKind, number>>;
	recordsSkipped: Partial<Record<ClinicalInitSeedKind, number>>;
	unsupportedKinds: Array<{ kind: ClinicalInitSeedKind; recordId: string }>;
	diagnostics: ClinicalInitDiagnostic[];
}

const DEFAULT_BOOTSTRAP_RESULT: ClinicalInitBootstrapResult = {
	recordsWritten: {},
	recordsSkipped: {},
	unsupportedKinds: [],
	diagnostics: [],
};

function inc(
	map: Partial<Record<ClinicalInitSeedKind, number>>,
	kind: ClinicalInitSeedKind,
): void {
	map[kind] = (map[kind] ?? 0) + 1;
}

type KindHandler = (
	stores: BootstrapStores,
	record: ClinicalInitSeedLoadedRecord,
) => Promise<void>;

const kindHandlers: Map<ClinicalInitSeedKind, KindHandler> = new Map();

function registerHandler(
	kind: ClinicalInitSeedKind,
	handler: KindHandler,
): void {
	kindHandlers.set(kind, handler);
}

registerHandler("profile", async (stores, record) => {
	const profile = normalizeProfile(record);
	if (!profile) return;
	await stores.profiles.set(profile);
});

registerHandler("attribute_rule", async (stores, record) => {
	const rule = normalizeAttributeRule(record);
	if (!rule) return;
	await stores.attributeRules.set(rule);
});

registerHandler("evaluator_rule", async (stores, record) => {
	const rule = normalizeEvaluatorRule(record);
	if (!rule) return;
	await stores.evaluatorRules.set(rule);
});

registerHandler("field_rule", async (stores, record) => {
	const rule = normalizeFieldRule(record);
	if (!rule) return;
	await stores.conceptFields.set(rule);
});

registerHandler("concept_default", async (stores, record) => {
	const def = normalizeConceptDefault(record);
	if (!def) return;
	await stores.conceptDefaults.set(def);
});

registerHandler("prose_rule", async (stores, record) => {
	const template = normalizeProseRule(record);
	if (!template) return;
	await stores.proseTemplates.set(template);
});

registerHandler("prose_parser_template", async (stores, record) => {
	const template = normalizeProseParserTemplate(record);
	if (!template) return;
	await stores.proseParserTemplates.set(template);
});

registerHandler("shared_field_anchor", async (stores, record) => {
	const anchor = normalizeSharedAnchor(record);
	if (!anchor) return;
	await stores.sharedFieldAnchors.set(anchor);
});

registerHandler("stop_word_list", async (stores, record) => {
	const words = normalizeStopWordList(record);
	if (!words) return;
	await stores.stopWordWordLists.set(record.recordId, words);
});

registerHandler("stop_word_profile", async (stores, record) => {
	const profile = normalizeStopWordProfile(record);
	if (!profile) return;
	await stores.stopWordProfiles.setProfile(profile);
});

registerHandler("personnel", async (stores, record) => {
	const personnel = normalizePersonnel(record);
	if (!personnel) return;
	await stores.personnel.set(personnel);
});

registerHandler("facility", async (stores, record) => {
	const facility = normalizeFacility(record);
	if (!facility) return;
	await stores.facilities.set(facility);
});

registerHandler("jurisdictional_display", async (stores, record) => {
	const display = normalizeJurisdictionalDisplay(record);
	if (!display) return;
	await stores.jurisdictionalDisplays.set(display);
});

registerHandler("macro", async (stores, record) => {
	const macro = normalizeMacro(record);
	if (!macro) return;
	await stores.macros.set(macro);
});

export async function bootstrapClinicalStores(
	stores: BootstrapStores,
	records: ClinicalInitSeedLoadedRecord[],
	options?: { seedPolicy?: ClinicalInitSeedPolicy },
): Promise<ClinicalInitBootstrapResult> {
	const seedPolicy = options?.seedPolicy ?? "never";
	const result: ClinicalInitBootstrapResult = {
		...DEFAULT_BOOTSTRAP_RESULT,
		recordsWritten: {},
		recordsSkipped: {},
	};

	for (const record of records) {
		const handler = kindHandlers.get(record.kind);
		if (!handler) {
			inc(result.recordsSkipped, record.kind);
			result.unsupportedKinds.push({
				kind: record.kind,
				recordId: record.recordId,
			});
			continue;
		}

		if (seedPolicy === "never") {
			inc(result.recordsSkipped, record.kind);
			continue;
		}

		if (seedPolicy === "if_empty") {
			const empty = await isStoreEmpty(stores, record.kind, record);
			if (!empty) {
				inc(result.recordsSkipped, record.kind);
				continue;
			}
		}

		try {
			await handler(stores, record);
			inc(result.recordsWritten, record.kind);
		} catch (e) {
			inc(result.recordsSkipped, record.kind);
			result.diagnostics.push({
				severity: "error",
				code: ClinicalInitSeedDiagnosticCode.BOOTSTRAP_WRITE_ERROR,
				message: `Failed to write seed record ${record.recordId}: ${(e as Error).message}`,
				phase: "bootstrap",
				recordId: record.recordId,
			});
		}
	}

	return result;
}

async function isStoreEmpty(
	stores: BootstrapStores,
	kind: ClinicalInitSeedKind,
	record: ClinicalInitSeedLoadedRecord,
): Promise<boolean> {
	switch (kind) {
		case "profile": {
			const existing = await stores.profiles.get(
				record.profileId ?? record.recordId,
			);
			return existing === null;
		}
		case "attribute_rule": {
			const existing = await stores.attributeRules.get(record.recordId);
			return existing === null;
		}
		case "evaluator_rule": {
			const existing = await stores.evaluatorRules.get(record.recordId);
			return existing === null;
		}
		case "field_rule": {
			const existing = await stores.conceptFields.get(
				(record.payload as any)?.conceptId,
				(record.payload as any)?.targetSchema,
				(record.payload as any)?.fieldPath,
			);
			return existing === null;
		}
		case "concept_default": {
			const payload = record.payload as Record<string, unknown> | undefined;
			const existing = await stores.conceptDefaults.get(
				payload?.anchorConceptId as string,
				payload?.targetSchema as string,
			);
			return existing === null;
		}
		case "prose_rule": {
			const payload = record.payload as Record<string, unknown> | undefined;
			const existing = await stores.proseTemplates.getById(
				payload?.templateId as string,
			);
			return existing === null;
		}
		case "prose_parser_template": {
			const payload = record.payload as Record<string, unknown> | undefined;
			const templateId = payload?.templateId;
			if (typeof templateId !== "string") return true;
			const existing = await stores.proseParserTemplates.get(templateId);
			return existing === null;
		}
		case "shared_field_anchor": {
			const existing = await stores.sharedFieldAnchors.get(record.recordId);
			return existing === null;
		}
		case "stop_word_list": {
			const existing = await stores.stopWordWordLists.get(record.recordId);
			return existing === null;
		}
		case "stop_word_profile": {
			const payload = record.payload as Record<string, unknown> | undefined;
			const existing = await stores.stopWordProfiles.getProfile(
				payload?.profileId as string,
			);
			return existing === null;
		}
		case "personnel": {
			const existing = await stores.personnel.get(record.recordId);
			return existing === null;
		}
		case "facility": {
			const existing = await stores.facilities.get(record.recordId);
			return existing === null;
		}
		case "jurisdictional_display": {
			const payload = record.payload as Record<string, unknown> | undefined;
			const existing = await stores.jurisdictionalDisplays.get(
				payload?.conceptId as string,
				payload?.jurisdictionId as string,
				payload?.source as string,
			);
			return existing === null;
		}
		case "macro": {
			const payload = record.payload as Record<string, unknown> | undefined;
			const existing = await stores.macros.get(
				(payload?.macroName as string) ?? record.recordId,
			);
			return existing === null;
		}
		default:
			return true;
	}
}
