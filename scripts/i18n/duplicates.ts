import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ROOT } from "./config.js";

export interface DuplicateKey {
	key: string;
	locations: { file: string; line: number }[];
}

/**
 * Object-literal key matcher for the flat `Record<string, string>` locale
 * modules. Deliberately kept identical in meaning to the parser used by
 * scripts/i18n-tools.ts (subcommand: keys), which generates i18n-keys.ts, so
 * that `check` audits exactly the key set that becomes the I18nKey union.
 *
 * Both key forms must be recognised, because `"project"` and a bare `project`
 * are the same runtime key; matching only quoted keys hid bare keys from
 * duplicate *and* EN/ES parity detection.
 *
 * Anchored to line start (`^\s*` with /m) because locale modules declare one
 * key per line. Anchoring is what keeps value text such as
 * `"project.settings.requires": "requires: {names}"` from being mis-read as a
 * second key on the same line, and skips wrapped continuation lines.
 */
const KEY_RE = /^\s*(?:"((?:\\.|[^"\\])*)"|([A-Za-z_$][\w$.]*))\s*:/gm;

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

/** Byte offset -> 1-based line number, via a precomputed line-start table. */
function lineIndex(src: string): (idx: number) => number {
	const starts: number[] = [0];
	for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
	return (idx: number): number => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= idx) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
}

function scanDir(dir: string): Map<string, { file: string; line: number }[]> {
	const found = new Map<string, { file: string; line: number }[]>();
	const walk = (d: string): void => {
		for (const ent of readdirSync(d)) {
			if (SKIP_DIRS.has(ent)) continue;
			const full = join(d, ent);
			if (statSync(full).isDirectory()) {
				walk(full);
				continue;
			}
			if (!ent.endsWith(".ts")) continue;
			const content = readFileSync(full, "utf8");
			// Repo-relative (not cwd-relative) so reported paths are stable no
			// matter which directory the tool is invoked from.
			const file = relative(ROOT, full).split(sep).join("/");
			const lineOf = lineIndex(content);
			KEY_RE.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = KEY_RE.exec(content))) {
				const key = m[1] ?? m[2];
				if (!key) continue;
				const loc = { file, line: lineOf(m.index) };
				const arr = found.get(key) ?? [];
				arr.push(loc);
				found.set(key, arr);
			}
		}
	};
	walk(dir);
	return found;
}

/** All distinct object-key literals defined across a locale module dir. */
export function collectModuleKeys(dir: string): Set<string> {
	const found = scanDir(dir);
	return new Set(found.keys());
}

/** Detect keys defined in more than one location within a locale module dir. */
export function findDuplicateKeys(dir: string): DuplicateKey[] {
	const found = scanDir(dir);
	const out: DuplicateKey[] = [];
	for (const [key, locations] of found) {
		if (locations.length > 1) out.push({ key, locations });
	}
	out.sort((a, b) => a.key.localeCompare(b.key));
	return out;
}
