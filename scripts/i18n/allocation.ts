import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	ALLOCATION_VERSION,
	ALLOCATIONS_FILE,
	EN_DIR,
	ES_DIR,
	FINAL_FILE,
} from "./config.js";
import { findDuplicateKeys } from "./duplicates.js";
import {
	enLocaleKeys,
	type Inventory,
	type InventorySite,
	readInventory,
} from "./inventory.js";

export type AllocationAction = "allocate" | "exempt" | "ignore";

export interface AllocationEntry {
	action: AllocationAction;
	/** Required when action === "allocate". Must already exist in EN_LOCALE. */
	key?: string;
	/** Reason for exempt/ignore. */
	reason?: string;
	/** Expression used by `replace` to wrap the key (default: t). */
	wrap?: string;
	/** Allow replace on interpolated sites (lossy). */
	force?: boolean;
	/**
	 * Line-independent fingerprint of the site this decision was made for.
	 * Site ids embed line/column, so any edit above a site changes its id.
	 * Recording the identity lets `finalize --refresh` carry curated decisions
	 * across unrelated edits instead of silently resetting them to defaults.
	 */
	identity?: string;
}

export interface AllocationManifest {
	version: number;
	inventoryDigest: string;
	generatedAt: string;
	sites: Record<string, AllocationEntry>;
}

/** Category of a validation issue, so reporting can group instead of spew. */
export type IssueKind = "stale" | "orphan" | "missing" | "key" | "action";

export interface ValidationIssue {
	severity: "error" | "warning";
	kind: IssueKind;
	message: string;
}

export interface ValidationResult {
	issues: ValidationIssue[];
	get errors(): ValidationIssue[];
	get warnings(): ValidationIssue[];
}

function makeValidation(issues: ValidationIssue[]): ValidationResult {
	return {
		issues,
		get errors() {
			return issues.filter((i) => i.severity === "error");
		},
		get warnings() {
			return issues.filter((i) => i.severity === "warning");
		},
	};
}

const SCAFFOLD_EXEMPT_REASON =
	"no existing EN_LOCALE key; new key creation is out of automated scope";

/**
 * Line-independent identity for a site: same file, same construct, same
 * message. Occurrence index disambiguates repeated identical literals in one
 * file so their decisions stay distinct and ordered.
 */
export function siteIdentity(site: InventorySite, occurrence: number): string {
	const construct = site.cls ?? site.call ?? "";
	return `${site.file}\u0000${site.kind}\u0000${construct}\u0000${site.raw}\u0000${occurrence}`;
}

/** Identity for every site in an inventory, in document order. */
function identityMap(inv: Inventory): Map<string, string> {
	const counts = new Map<string, number>();
	const byId = new Map<string, string>();
	for (const s of inv.sites) {
		const base = siteIdentity(s, 0).slice(0, -1);
		const n = counts.get(base) ?? 0;
		counts.set(base, n + 1);
		byId.set(s.id, `${base}${n}`);
	}
	return byId;
}

/** The default decision for a site with no prior human decision. */
function defaultEntry(
	site: InventorySite,
	enKeys: Set<string>,
): AllocationEntry {
	if (site.proposedKey && enKeys.has(site.proposedKey)) {
		return { action: "allocate", key: site.proposedKey };
	}
	return { action: "exempt", reason: SCAFFOLD_EXEMPT_REASON };
}

/** Build a default allocation manifest from an inventory. */
export function scaffold(
	inv: Inventory,
	enKeys: Set<string>,
): AllocationManifest {
	const identities = identityMap(inv);
	const sites: Record<string, AllocationEntry> = {};
	for (const s of inv.sites) {
		sites[s.id] = {
			...defaultEntry(s, enKeys),
			identity: identities.get(s.id),
		};
	}
	return {
		version: ALLOCATION_VERSION,
		inventoryDigest: inv.digest,
		generatedAt: new Date().toISOString(),
		sites,
	};
}

export interface RefreshReport {
	manifest: AllocationManifest;
	/** Decisions carried over because the site id was unchanged. */
	keptById: number;
	/** Decisions carried over by identity after the site moved. */
	keptByIdentity: number;
	/** New sites that received a default decision. */
	added: number;
	/** Stale entries dropped because the site no longer exists. */
	dropped: number;
}

/**
 * Re-scaffold a manifest against the current inventory while preserving prior
 * decisions. Without this, a stale manifest is a dead end: `finalize` only
 * scaffolds when the file is absent, so the sole recovery was deleting the
 * generated dotfile and losing every curated decision.
 *
 * Decisions are matched first by site id, then by line-independent identity, so
 * edits elsewhere in a producer file do not reset its allocations.
 */
export function refresh(
	inv: Inventory,
	enKeys: Set<string>,
	prev: AllocationManifest,
): RefreshReport {
	const identities = identityMap(inv);
	const prevByIdentity = new Map<string, AllocationEntry>();
	for (const entry of Object.values(prev.sites)) {
		if (entry.identity && !prevByIdentity.has(entry.identity)) {
			prevByIdentity.set(entry.identity, entry);
		}
	}

	const sites: Record<string, AllocationEntry> = {};
	let keptById = 0;
	let keptByIdentity = 0;
	let added = 0;
	const consumedIds = new Set<string>();

	for (const s of inv.sites) {
		const identity = identities.get(s.id);
		const byId = prev.sites[s.id];
		const byIdentity = identity ? prevByIdentity.get(identity) : undefined;
		let entry: AllocationEntry;
		if (byId) {
			entry = byId;
			consumedIds.add(s.id);
			keptById++;
		} else if (byIdentity) {
			entry = byIdentity;
			keptByIdentity++;
		} else {
			entry = defaultEntry(s, enKeys);
			added++;
		}
		sites[s.id] = { ...entry, identity };
	}

	const dropped = Object.keys(prev.sites).filter(
		(id) => !consumedIds.has(id) && !(id in sites),
	).length;

	return {
		manifest: {
			version: ALLOCATION_VERSION,
			inventoryDigest: inv.digest,
			generatedAt: new Date().toISOString(),
			sites,
		},
		keptById,
		keptByIdentity,
		added,
		dropped,
	};
}

export function writeAllocations(m: AllocationManifest): void {
	writeFileSync(ALLOCATIONS_FILE, JSON.stringify(m, null, 2) + "\n", "utf8");
}

export function readAllocations(): AllocationManifest {
	const raw = readFileSync(ALLOCATIONS_FILE, "utf8");
	return JSON.parse(raw) as AllocationManifest;
}

export function hasAllocations(): boolean {
	return existsSync(ALLOCATIONS_FILE);
}

/**
 * Validate an allocation manifest against the current inventory and the
 * runtime EN_LOCALE keys. Allocation never creates new locale keys, so every
 * `allocate` entry must reference an existing key.
 */
export async function validate(
	inv: Inventory,
	manifest: AllocationManifest,
	enKeys: Set<string>,
): Promise<ValidationResult> {
	const issues: ValidationIssue[] = [];

	if (manifest.inventoryDigest !== inv.digest) {
		issues.push({
			severity: "error",
			kind: "stale",
			message:
				"allocation manifest is stale (inventoryDigest mismatch); re-run `inventory` then `finalize --refresh`",
		});
	}

	const liveIds = new Set(inv.sites.map((s) => s.id));
	for (const id of Object.keys(manifest.sites)) {
		if (!liveIds.has(id)) {
			issues.push({
				severity: "error",
				kind: "orphan",
				message: `orphan allocation for unknown site id: ${id}`,
			});
		}
	}

	const validActions: AllocationAction[] = ["allocate", "exempt", "ignore"];
	for (const s of inv.sites) {
		const entry = manifest.sites[s.id];
		if (!entry) {
			issues.push({
				severity: "error",
				kind: "missing",
				message: `missing allocation for site ${s.id} (${s.file}:${s.line})`,
			});
			continue;
		}
		if (!validActions.includes(entry.action)) {
			issues.push({
				severity: "error",
				kind: "action",
				message: `site ${s.id}: invalid action "${entry.action}"`,
			});
			continue;
		}
		if (entry.action === "allocate") {
			if (!entry.key) {
				issues.push({
					severity: "error",
					kind: "key",
					message: `site ${s.id}: allocate requires a "key"`,
				});
			} else if (!enKeys.has(entry.key)) {
				issues.push({
					severity: "error",
					kind: "key",
					message: `site ${s.id}: allocate references key "${entry.key}" not present in EN_LOCALE (tooling never creates new keys)`,
				});
			}
		}
	}

	return makeValidation(issues);
}

/** Modular EN/ES duplicate key detection. */
export function detectDuplicateKeys(): {
	en: ReturnType<typeof findDuplicateKeys>;
	es: ReturnType<typeof findDuplicateKeys>;
} {
	return { en: findDuplicateKeys(EN_DIR), es: findDuplicateKeys(ES_DIR) };
}

export interface FinalizeReport {
	valid: boolean;
	total: number;
	allocated: number;
	exempt: number;
	ignored: number;
	errors: string[];
	path: string;
}

/** Validate (and optionally write) the finalized allocation manifest. */
export async function finalize(
	manifest: AllocationManifest,
): Promise<FinalizeReport> {
	const inv = readInventory();
	const enKeys = await enLocaleKeys();
	const result = await validate(inv, manifest, enKeys);
	const allocated = Object.values(manifest.sites).filter(
		(e) => e.action === "allocate",
	).length;
	const exempt = Object.values(manifest.sites).filter(
		(e) => e.action === "exempt",
	).length;
	const ignored = Object.values(manifest.sites).filter(
		(e) => e.action === "ignore",
	).length;
	const valid = result.errors.length === 0;
	if (valid) {
		writeFileSync(FINAL_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
	}
	return {
		valid,
		total: inv.sites.length,
		allocated,
		exempt,
		ignored,
		errors: result.errors.map((e) => e.message),
		path: FINAL_FILE,
	};
}

export function readFinal(): AllocationManifest {
	const raw = readFileSync(FINAL_FILE, "utf8");
	return JSON.parse(raw) as AllocationManifest;
}

export function hasFinal(): boolean {
	return existsSync(FINAL_FILE);
}
