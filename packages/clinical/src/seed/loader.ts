import * as fs from "fs";
import * as path from "path";
import type { DictionaryStore } from "@stateful-mcp/core";

export async function seedClinicalData(
	dictionaryStore: DictionaryStore,
	seedDir?: string,
): Promise<void> {
	const dir =
		seedDir || path.join(__dirname, "..", "..", "seed");

	const seedFiles = [
		"ucum_seed.json",
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
