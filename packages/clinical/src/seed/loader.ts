/**
 * TEST/FIXTURE DEFAULTS ONLY — NOT FOR RUNTIME USE.
 *
 * ⚠️  This module is intentionally for prototype tests, mock fixtures, and
 *    local bootstrap data only. It is NOT the runtime source of truth.
 *
 * Production and long-lived clinical behavior MUST load from config-backed
 * stores/adapters instead of importing these values directly.
 *
 * For runtime usage:
 *   - Use `clinical-loader.ts` → `buildClinicalRuntime()` to resolve config
 *   - Use `CdslParser.create()` to resolve profiles from store, not seed arrays
 *
 * Existing direct imports are allowed only in test files and/or legacy
 * code paths that have not yet migrated to config-backed injection.
 */

import * as fs from "fs";
import * as path from "path";
import type { DictionaryStore } from "@stateful-mcp/core";
import type { StopWordWordListStore, StopWordStore } from "../store/reference/stop-words/interfaces";

export async function seedClinicalData(
	dictionaryStore: DictionaryStore,
	seedDir?: string,
): Promise<void> {
	const dir =
		seedDir || path.join(__dirname, "..", "..", "seed");

	const seedFiles = [
		"loinc_seed.json",
		"snomed_seed.json",
		"rxnorm_seed.json",
	];

	for (const fileName of seedFiles) {
		const filePath = path.join(dir, fileName);
		if (fs.existsSync(filePath)) {
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				const config = JSON.parse(content);
				await dictionaryStore.loadConfig(config);
			} catch (err: any) {
				console.error(`Failed to load seed file ${fileName}:`, err.message);
			}
		}
	}
}

export async function seedStopWordLists(
	wordListStore: StopWordWordListStore,
	lists: Array<{ id: string; words: string[] }>,
): Promise<void> {
	for (const item of lists) {
		await wordListStore.set(item.id, item.words);
	}
}

export async function seedStopWordProfiles(
	stopWordStore: StopWordStore,
	profiles: Array<{
		profileId: string;
		personnelId: string;
		wordListIds: string[];
		excludedWords: string[];
		additionalWords: string[];
	}>,
): Promise<void> {
	for (const p of profiles) {
		const existing = await stopWordStore.getProfile(p.personnelId);
		await stopWordStore.setProfile({
			profileId: existing?.profileId ?? p.profileId,
			personnelId: p.personnelId,
			localeFiles: existing?.localeFiles ?? [],
			specialtyFiles: existing?.specialtyFiles ?? [],
			customWords: existing?.customWords ?? [],
			wordListIds: p.wordListIds,
			excludedWords: p.excludedWords,
			additionalWords: p.additionalWords,
		});
	}
}
