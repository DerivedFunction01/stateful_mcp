import type { ClinicalInitSeedLoadedRecord, ClinicalInitSeedKind } from "../seed/record";
import type { ClinicalInitDiagnostic, ClinicalInitSeedPolicy } from "../types";
import { ClinicalInitSeedDiagnosticCode } from "../types";
import type { BootstrapStores } from "./stores";
import {
	normalizeProfile,
	normalizeAttributeRule,
	normalizeEvaluatorRule,
	normalizeFieldRule,
	normalizeConceptDefault,
	normalizeProseRule,
	normalizeSharedAnchor,
	normalizeStopWordList,
	normalizeStopWordProfile,
} from "./normalizers";

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
			const existing = await stores.profiles.get(record.profileId ?? record.recordId);
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
			const existing = await stores.proseTemplates.getById(payload?.templateId as string);
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
			const existing = await stores.stopWordProfiles.getProfile(payload?.profileId as string);
			return existing === null;
		}
		default:
			return true;
	}
}