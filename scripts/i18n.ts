#!/usr/bin/env -S bun
/**
 * i18n tooling — allocation phase.
 *
 * Subcommands:
 *   inventory   Scan packages/macro, macro-host, macro-protocol, macro-web for
 *               candidate user-visible error/message sites and emit a
 *               deterministic, machine-readable inventory JSON.
 *   check       Allocation-phase audit:
 *                 - duplicate EN/ES *modular* key detection
 *                 - allocation manifest validation (stale/scope/orphans/keys)
 *               The two gates can be run separately via --locales-only /
 *               --manifest-only, so a stale generated manifest never masks the
 *               locale-module result. Exits non-zero on problems.
 *   finalize    Validate (and, if absent, scaffold) the allocation manifest and
 *               write the finalized manifest. `--refresh` re-scaffolds a stale
 *               manifest against the current inventory, preserving curated
 *               decisions. Tooling never creates new locale keys; `allocate`
 *               entries must reference existing EN_LOCALE keys.
 *   replace     Constrained code rewrite that routes allocated sites through
 *               the i18n function. Dry-run by default; `--write` applies.
 *               Locale runtime files and i18n-keys.ts are never modified.
 *
 * Generated artifacts live under scripts/i18n/ as dotfiles (git-ignored):
 *   .inventory.json, .allocations.json, .allocations.final.json
 */

import { existsSync } from "node:fs";
import {
	detectDuplicateKeys,
	finalize as finalizeAlloc,
	hasAllocations,
	readAllocations,
	refresh,
	scaffold,
	validate,
	writeAllocations,
} from "./i18n/allocation.js";
import {
	ALLOCATIONS_FILE,
	EN_DIR,
	ES_DIR,
	INVENTORY_FILE,
} from "./i18n/config.js";
import { collectModuleKeys } from "./i18n/duplicates.js";
import {
	buildInventory,
	enLocaleKeys,
	readInventory,
	writeInventory,
} from "./i18n/inventory.js";
import { printReplace, runReplace } from "./i18n/replace.js";

function flag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

/** Collapse many same-kind validation errors into a summary + examples. */
function summarizeIssues(
	issues: { kind: string; message: string }[],
	sample = 5,
): string[] {
	const order = ["stale", "action", "key", "missing", "orphan"];
	const byKind = new Map<string, string[]>();
	for (const i of issues) {
		const arr = byKind.get(i.kind) ?? [];
		arr.push(i.message);
		byKind.set(i.kind, arr);
	}
	const label: Record<string, string> = {
		stale: "stale manifest",
		action: "invalid action",
		key: "unknown locale key",
		missing: "site with no allocation",
		orphan: "allocation for a site that no longer exists",
	};
	const out: string[] = [];
	for (const kind of [...order, ...byKind.keys()]) {
		const msgs = byKind.get(kind);
		if (!msgs) continue;
		byKind.delete(kind);
		out.push(`    ${msgs.length} x ${label[kind] ?? kind}`);
		for (const m of msgs.slice(0, sample)) out.push(`        - ${m}`);
		if (msgs.length > sample)
			out.push(`        ... and ${msgs.length - sample} more`);
	}
	return out;
}

async function cmdInventory(): Promise<void> {
	const includeSurface = flag("include-surface");
	const inv = buildInventory(includeSurface);
	if (flag("stdout")) {
		process.stdout.write(JSON.stringify(inv, null, 2) + "\n");
		return;
	}
	writeInventory(inv);
	console.log(
		`inventory: ${inv.sites.length} candidate site(s) across ${inv.roots.length} package(s) -> ${INVENTORY_FILE}`,
	);
	const byKind = inv.sites.reduce<Record<string, number>>((acc, s) => {
		acc[s.kind] = (acc[s.kind] ?? 0) + 1;
		return acc;
	}, {});
	console.log(
		`  kinds: ${Object.entries(byKind)
			.map(([k, v]) => `${k}=${v}`)
			.join(", ")}`,
	);
	console.log(`  digest: ${inv.digest}`);
}

async function cmdCheck(): Promise<void> {
	// The two gates are independent: locale hygiene is a property of committed
	// source, while manifest freshness tracks a generated artifact against
	// churning producer files. Allow running either alone so a stale manifest
	// cannot mask (or be masked by) the locale-module result.
	const localesOnly = flag("locales-only");
	const manifestOnly = flag("manifest-only");
	const doLocales = !manifestOnly;
	const doManifest = !localesOnly;
	const problems: string[] = [];

	const enKeys = collectModuleKeys(EN_DIR);
	const esKeys = collectModuleKeys(ES_DIR);

	if (doLocales) {
		const dup = detectDuplicateKeys();

		// 1. Duplicate EN modular keys.
		if (dup.en.length > 0) {
			const lines = dup.en.flatMap((d) => [
				`    - ${d.key}`,
				...d.locations.map((l) => `        ${l.file}:${l.line}`),
			]);
			problems.push(
				`${dup.en.length} duplicate EN modular key(s):\n${lines.join("\n")}`,
			);
		}
		// 2. Duplicate ES modular keys.
		if (dup.es.length > 0) {
			const lines = dup.es.flatMap((d) => [
				`    - ${d.key}`,
				...d.locations.map((l) => `        ${l.file}:${l.line}`),
			]);
			problems.push(
				`${dup.es.length} duplicate ES modular key(s):\n${lines.join("\n")}`,
			);
		}

		// 3. EN/ES module parity.
		const missingInEs = [...enKeys].filter((k) => !esKeys.has(k)).sort();
		if (missingInEs.length > 0) {
			problems.push(
				`${missingInEs.length} EN modular key(s) missing from ES modules (parity):\n` +
					missingInEs.map((k) => `    - ${k}`).join("\n"),
			);
		}
		if (problems.length === 0) {
			console.log(
				`locale modules: OK (0 duplicate EN/ES keys, EN/ES parity clean; EN=${enKeys.size}, ES=${esKeys.size})`,
			);
		}
	}

	// 4. Allocation manifest validation.
	if (doManifest) {
		if (hasAllocations()) {
			if (!existsSync(INVENTORY_FILE)) {
				problems.push(
					"allocation manifest present but inventory missing; run `inventory` first",
				);
			} else {
				const inv = readInventory();
				const enKeysRt = await enLocaleKeys();
				const manifest = readAllocations();
				const result = await validate(inv, manifest, enKeysRt);
				if (result.errors.length > 0) {
					problems.push(
						"allocation manifest invalid:\n" +
							summarizeIssues(result.errors).join("\n") +
							"\n    remediation: bun scripts/i18n.ts inventory && bun scripts/i18n.ts finalize --refresh",
					);
				} else {
					console.log(
						`allocation manifest: valid (${Object.keys(manifest.sites).length} site(s))`,
					);
				}
				for (const w of result.warnings) console.log(`  warning: ${w.message}`);
			}
		} else {
			console.log("allocation manifest: not present (run `finalize` first)");
		}
	}

	if (problems.length > 0) {
		const scope = localesOnly
			? " (locales)"
			: manifestOnly
				? " (manifest)"
				: "";
		console.error(`i18n allocation check FAILED${scope}:\n`);
		console.error(problems.join("\n\n"));
		process.exit(1);
	}
	console.log(
		`i18n allocation check OK (EN/ES modular duplicates: 0; EN keys=${enKeys.size}, ES keys=${esKeys.size})`,
	);
}

async function cmdFinalize(): Promise<void> {
	if (!existsSync(INVENTORY_FILE)) {
		console.error("no inventory found; run `inventory` first");
		process.exit(1);
	}
	let manifest = hasAllocations() ? readAllocations() : null;
	if (!manifest) {
		const inv = readInventory();
		const enKeys = await enLocaleKeys();
		manifest = scaffold(inv, enKeys);
		writeAllocations(manifest);
		console.log(`allocations scaffolded -> ${ALLOCATIONS_FILE}`);
	} else if (flag("refresh")) {
		const inv = readInventory();
		const enKeys = await enLocaleKeys();
		const r = refresh(inv, enKeys, manifest);
		manifest = r.manifest;
		writeAllocations(manifest);
		console.log(
			`allocations refreshed -> ${ALLOCATIONS_FILE} ` +
				`(kept ${r.keptById} by id, ${r.keptByIdentity} by identity; added ${r.added}, dropped ${r.dropped})`,
		);
	}
	const report = await finalizeAlloc(manifest);
	if (!report.valid) {
		console.error("finalize FAILED:");
		for (const e of report.errors) console.error(`  - ${e}`);
		if (!flag("refresh")) {
			console.error(
				"  hint: pass --refresh to re-scaffold against the current inventory (curated decisions are preserved)",
			);
		}
		process.exit(1);
	}
	console.log(
		`finalize OK -> ${report.path} (total=${report.total}, allocate=${report.allocated}, exempt=${report.exempt}, ignore=${report.ignored})`,
	);
}

function cmdReplace(): void {
	const res = runReplace(flag("write"));
	printReplace(res);
	if (res.errors.some((e) => e.startsWith("no finalized"))) process.exit(1);
}

async function main(): Promise<void> {
	const sub = process.argv[2];
	switch (sub) {
		case "inventory":
			await cmdInventory();
			return;
		case "check":
			await cmdCheck();
			return;
		case "finalize":
			await cmdFinalize();
			return;
		case "replace":
			cmdReplace();
			return;
		case undefined:
		case "help":
		case "--help":
		case "-h":
			console.log(
				"usage: bun scripts/i18n.ts <inventory|check|finalize|replace>\n" +
					"  inventory   scan packages for candidate user-visible error/message sites -> .inventory.json\n" +
					"  check       duplicate EN/ES modular key detection + allocation manifest validation\n" +
					"                --locales-only   only the duplicate/parity gate (ignores the manifest)\n" +
					"                --manifest-only  only the allocation manifest gate\n" +
					"  finalize    scaffold/validate allocation manifest -> .allocations.final.json\n" +
					"                --refresh        re-scaffold a stale manifest, preserving decisions\n" +
					"  replace     constrained code rewrite (dry-run; --write to apply)",
			);
			return;
		default:
			console.error(`unknown subcommand: ${sub}`);
			process.exit(2);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
