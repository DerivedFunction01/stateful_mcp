import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PROTECTED_GLOBS, FINAL_FILE } from "./config.js";
import { readInventory } from "./inventory.js";
import { readFinal, hasFinal } from "./allocation.js";

interface Edit {
	start: number;
	end: number;
	text: string;
	line: number;
}

function isProtected(file: string): boolean {
	for (const g of PROTECTED_GLOBS) {
		if (g === "**/i18n/locales/**" && file.includes("/i18n/locales/")) return true;
		if (g === "**/i18n-keys.ts" && file.endsWith("i18n-keys.ts")) return true;
		if (g === "**/node_modules/**" && file.includes("/node_modules/")) return true;
		if (g === "**/dist/**" && file.includes("/dist/")) return true;
	}
	return false;
}

export interface ReplaceReport {
	applied: boolean;
	files: { file: string; edits: number }[];
	errors: string[];
}

/**
 * Constrained code rewrite. For every `allocate` site in the finalized
 * manifest, the hardcoded literal is replaced with `${wrap}("key")`. Never
 * touches locale runtime files or i18n-keys.ts. Interpolated sites are skipped
 * unless the entry sets `force`. Dry-run by default; pass write=true to apply.
 */
export function runReplace(write: boolean): ReplaceReport {
	if (!hasFinal()) {
		return {
			applied: false,
			files: [],
			errors: [`no finalized manifest at ${FINAL_FILE}; run \`finalize\` first`],
		};
	}
	const finalManifest = readFinal();
	const inv = readInventory();
	const sitesById = new Map(inv.sites.map((s) => [s.id, s]));
	const errors: string[] = [];
	const fileMap = new Map<string, Edit[]>();

	for (const [id, entry] of Object.entries(finalManifest.sites)) {
		if (entry.action !== "allocate" || !entry.key) continue;
		const site = sitesById.get(id);
		if (!site) {
			errors.push(`finalized site ${id} missing from inventory`);
			continue;
		}
		if (site.hasInterpolation && !entry.force) {
			errors.push(
				`skip ${site.file}:${site.line}: interpolated literal cannot be safely replaced (set force:true to override)`,
			);
			continue;
		}
		if (isProtected(site.file)) {
			errors.push(`refusing to edit protected path: ${site.file}`);
			continue;
		}
		const wrap = entry.wrap ?? "t";
		const text = `${wrap}("${entry.key}")`;
		const edits = fileMap.get(site.file) ?? [];
		edits.push({ start: site.start, end: site.end, text, line: site.line });
		fileMap.set(site.file, edits);
	}

	const files: { file: string; edits: number }[] = [];
	for (const [file, edits] of fileMap) {
		const abs = join(ROOT, file);
		if (!existsSync(abs)) {
			errors.push(`source file missing: ${file}`);
			continue;
		}
		const content = readFileSync(abs, "utf8");
		edits.sort((a, b) => b.start - a.start);
		let next = content;
		for (const e of edits) next = next.slice(0, e.start) + e.text + next.slice(e.end);
		if (write) writeFileSync(abs, next, "utf8");
		files.push({ file, edits: edits.length });
	}

	return { applied: write, files, errors };
}

export function printReplace(res: ReplaceReport): void {
	const mode = res.applied ? "APPLIED" : "DRY-RUN";
	console.log(`i18n replace [${mode}]`);
	for (const f of res.files) console.log(`  ${f.file}: ${f.edits} edit(s)`);
	for (const e of res.errors) console.log(`  ! ${e}`);
	if (!res.applied) {
		console.log("  (no files written; pass --write to apply; locale files are never modified)");
	}
}
