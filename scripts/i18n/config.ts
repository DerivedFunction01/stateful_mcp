import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const I18N_DIR = here; // scripts/i18n
export const SCRIPTS_DIR = dirname(here); // scripts
export const ROOT = dirname(SCRIPTS_DIR); // repo root

/** Packages scanned for candidate user-visible error/message sites. */
export const SCAN_PACKAGES = [
	"macro",
	"macro-host",
	"macro-protocol",
	"macro-web",
] as const;

export type ScanPackage = (typeof SCAN_PACKAGES)[number];

export function scanRoot(pkg: ScanPackage): string {
	return join(ROOT, "packages", pkg);
}

export const LOCALES_DIR = join(
	ROOT,
	"packages",
	"macro",
	"src",
	"workspace",
	"i18n",
	"locales",
);
export const EN_DIR = join(LOCALES_DIR, "en");
export const ES_DIR = join(LOCALES_DIR, "es");
export const EN_AGGREGATOR = join(LOCALES_DIR, "en.ts");
export const ES_AGGREGATOR = join(LOCALES_DIR, "es.ts");

/** Machine-readable generated artifacts (dotfiles => already git-ignored). */
export const INVENTORY_FILE = join(I18N_DIR, ".inventory.json");
export const ALLOCATIONS_FILE = join(I18N_DIR, ".allocations.json");
export const FINAL_FILE = join(I18N_DIR, ".allocations.final.json");

/** Paths that must never be modified by any i18n tooling command. */
export const PROTECTED_GLOBS = [
	"**/i18n/locales/**",
	"**/i18n-keys.ts",
	"**/node_modules/**",
	"**/dist/**",
];

export const INVENTORY_VERSION = 1;
export const ALLOCATION_VERSION = 1;
