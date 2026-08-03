import type {
	ClinicalInitSeedKind,
	ClinicalInitSeedLoadedRecord,
} from "../seed/record";
import type { ClinicalInitDiagnostic, ClinicalInitSeedPolicy } from "../types";
import { ClinicalInitSeedDiagnosticCode } from "../types";
import {
	compileTemporalRecord,
	normalizeAttributeRule,
	normalizeConceptRelation,
	normalizeDictionaryExpression,
	normalizeEvaluatorRule,
	normalizeFacility,
	normalizeJurisdictionalDisplay,
	normalizePersonnel,
	normalizeProfile,
	normalizeProseRule,
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
	diagnostics: ClinicalInitDiagnostic[],
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

registerHandler("prose_rule", async (stores, record) => {
	const template = normalizeProseRule(record);
	if (!template) return;
	await stores.proseTemplates.set(template);
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

registerHandler(
	"dictionary_expression",
	async (stores, record, diagnostics) => {
		const warnings: Array<{ message: string; path?: string }> = [];
		const expression = normalizeDictionaryExpression(
			record,
			warnings,
			stores.dictionaryStore.getAllowedTargetAssignments?.(),
		);
		for (const warning of warnings) {
			diagnostics.push({
				severity: "warning",
				code: ClinicalInitSeedDiagnosticCode.DICTIONARY_EXPRESSION_WARNING,
				message: warning.message,
				phase: "bootstrap",
				recordId: record.recordId,
				path: warning.path,
			});
		}
		if (!expression) return;
		await stores.dictionaryStore.addExpression(expression);
	},
);

registerHandler("concept_relation", async (stores, record) => {
	const relation = normalizeConceptRelation(record);
	if (!relation) return;
	await stores.dictionaryStore.addRelation(relation);
});

// ── Temporal kind handlers ────────────────────────────────────────────

registerHandler("calendar_vocabulary", async (stores, record, diagnostics) => {
	const result = compileTemporalRecord(record);
	if (!result) return;
	const profileId = result.profileId ?? record.profileId;
	if (!profileId) return;

	const profile = await stores.profiles.get(profileId);
	if (!profile) return;

	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload) return;

	const monthNames = payload.monthNames;
	const dayPeriods = payload.dayPeriods;

	const hasMonthNames =
		typeof monthNames === "object" &&
		monthNames !== null &&
		Object.keys(monthNames).length > 0;
	const hasDayPeriods =
		typeof dayPeriods === "object" &&
		dayPeriods !== null &&
		Object.keys(dayPeriods).length > 0;

	if (!hasMonthNames && !hasDayPeriods) return;

	const existingFormats = profile.calendarDateFormats ?? [];
	const updatedFormats = existingFormats.map((fmt) => {
		const opts = { ...fmt.options };
		if (hasMonthNames) {
			const names = Object.values(monthNames as Record<string, unknown>).filter(
				(v): v is string => typeof v === "string",
			);
			if (names.length > 0) opts.monthNames = names;
		}
		if (hasDayPeriods) {
			const dp = dayPeriods as Record<string, unknown>;
			const am = Array.isArray(dp.am) ? (dp.am as string[]) : [];
			const pm = Array.isArray(dp.pm) ? (dp.pm as string[]) : [];
			if (am.length > 0 || pm.length > 0) {
				opts.dayPeriods = { am, pm };
			}
		}
		return { ...fmt, options: opts };
	});

	profile.calendarDateFormats = updatedFormats;
	await stores.profiles.set(profile);
});

registerHandler("date_pattern", async (stores, record, diagnostics) => {
	const result = compileTemporalRecord(record);
	if (!result || !result.calendarDateFormats?.length) return;
	const profileId = result.profileId ?? record.profileId;
	if (!profileId) return;

	const profile = await stores.profiles.get(profileId);
	if (!profile) return;

	profile.calendarDateFormats = [
		...(profile.calendarDateFormats ?? []),
		...result.calendarDateFormats,
	];
	await stores.profiles.set(profile);
});

registerHandler("time_pattern", async (stores, record, diagnostics) => {
	const result = compileTemporalRecord(record);
	if (!result || !result.calendarDateFormats?.length) return;
	const profileId = result.profileId ?? record.profileId;
	if (!profileId) return;

	const profile = await stores.profiles.get(profileId);
	if (!profile) return;

	profile.calendarDateFormats = [
		...(profile.calendarDateFormats ?? []),
		...result.calendarDateFormats,
	];
	await stores.profiles.set(profile);
});

registerHandler("relative_time_rule", async (stores, record, diagnostics) => {
	const result = compileTemporalRecord(record);
	if (!result) return;
	if (result.attributeRules) {
		for (const rule of result.attributeRules) {
			await stores.attributeRules.set(rule);
		}
	}
	await appendAttributeRulesToProfile(stores, result);
});

registerHandler("range_rule", async (stores, record, diagnostics) => {
	const result = compileTemporalRecord(record);
	if (!result) return;
	if (result.attributeRules) {
		for (const rule of result.attributeRules) {
			await stores.attributeRules.set(rule);
		}
	}
	await appendAttributeRulesToProfile(stores, result);
});

registerHandler("cadence_rule", async (stores, record, diagnostics) => {
	const result = compileTemporalRecord(record);
	if (!result) return;
	if (result.attributeRules) {
		for (const rule of result.attributeRules) {
			await stores.attributeRules.set(rule);
		}
	}
	await appendAttributeRulesToProfile(stores, result);
});

registerHandler("exclusion_rule", async (stores, record, diagnostics) => {
	const result = compileTemporalRecord(record);
	if (!result) return;
	if (result.attributeRules) {
		for (const rule of result.attributeRules) {
			await stores.attributeRules.set(rule);
		}
	}
	await appendAttributeRulesToProfile(stores, result);
});

async function appendAttributeRulesToProfile(
	stores: BootstrapStores,
	result: import("./normalizers").TemporalCompilationResult,
): Promise<void> {
	if (!result.attributeRules?.length) return;
	const profileId = result.profileId;
	if (!profileId) return;

	const profile = await stores.profiles.get(profileId);
	if (!profile) return;

	profile.attributeRules = [
		...(profile.attributeRules ?? []),
		...result.attributeRules,
	];
	await stores.profiles.set(profile);
}

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
			await handler(stores, record, result.diagnostics);
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
		case "prose_rule": {
			const payload = record.payload as Record<string, unknown> | undefined;
			const existing = await stores.proseTemplates.getById(
				payload?.templateId as string,
			);
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
		case "dictionary_expression": {
			const payload = record.payload;
			const expressions = await stores.dictionaryStore.getExpressions();
			return !expressions.some(
				(expression) =>
					expression.term === payload.term &&
					expression.conceptId === payload.conceptId,
			);
		}
		case "concept_relation": {
			const relationId =
				(typeof record.payload.id === "string" && record.payload.id) ||
				record.recordId;
			const relations = await stores.dictionaryStore.getRelations();
			return !relations.some((relation) => relation.id === relationId);
		}
		case "calendar_vocabulary": {
			const pid = record.profileId;
			if (!pid) return true;
			const profile = await stores.profiles.get(pid);
			if (!profile) return true;
			const formats = profile.calendarDateFormats ?? [];
			return formats.length === 0;
		}
		case "date_pattern":
		case "time_pattern": {
			const pid = record.profileId;
			if (!pid) return true;
			const profile = await stores.profiles.get(pid);
			if (!profile) return true;
			const formats = profile.calendarDateFormats ?? [];
			return formats.length === 0;
		}
		case "relative_time_rule":
		case "cadence_rule":
		case "exclusion_rule":
		case "range_rule": {
			const compiled = compileTemporalRecord(record);
			if (!compiled) return true;

			for (const rule of compiled.attributeRules ?? []) {
				const existing = await stores.attributeRules.get(rule.ruleId);
				if (existing !== null) return false;
			}

			return true;
		}
		default:
			return true;
	}
}
