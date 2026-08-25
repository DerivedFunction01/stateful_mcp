import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
	EN_AGGREGATOR,
	INVENTORY_FILE,
	INVENTORY_VERSION,
	LOCALES_DIR,
	ROOT,
	SCAN_PACKAGES,
	type ScanPackage,
	scanRoot,
} from "./config.js";

export type SiteKind = "throw" | "error" | "surface";

export interface InventorySite {
	/** Deterministic id: sha256(file|line|column|raw) truncated. */
	id: string;
	package: ScanPackage;
	/** Repo-relative path (forward slashes). */
	file: string;
	line: number;
	column: number;
	/** Absolute char offset of the opening quote in the file. */
	start: number;
	/** Absolute char offset just past the closing quote. */
	end: number;
	kind: SiteKind;
	/** Error class name for throw/error kinds. */
	cls?: string;
	/** Surface call name for surface kind. */
	call?: string;
	/** Unescaped literal content. */
	raw: string;
	quote: '"' | "'" | "`";
	hasInterpolation: boolean;
	/** Deterministic proposed i18n key. */
	proposedKey: string | null;
}

export interface Inventory {
	version: number;
	tool: "scripts/i18n";
	generatedAt: string;
	roots: string[];
	sites: InventorySite[];
	/** sha256 over the canonical site list (stable, excludes timestamps). */
	digest: string;
}

const ERROR_RE =
	/(throw\s+new|new)\s+([A-Za-z_$][\w$]*)\s*\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`|'([^'\\]*(?:\\.[^'\\]*)*)')/g;

const SURFACE_CALLS = new Set([
	"error",
	"warn",
	"warning",
	"info",
	"notify",
	"toast",
	"message",
	"alert",
	"fail",
]);

const SURFACE_RE =
	/(?:^|[^.\w$])(error|warn|warning|info|notify|toast|message|alert|fail)\s*\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`|'([^'\\]*(?:\\.[^'\\]*)*)')/g;

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

function unescapeLiteral(s: string): string {
	return s
		.replace(/\\(["'`\\])/g, "$1")
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t")
		.replace(/\\r/g, "\r");
}

function hasInterpolation(literal: string, quote: string): boolean {
	if (quote === "`") return /\$\{/.test(literal);
	return false;
}

function lineCol(src: string, idx: number): { line: number; column: number } {
	let line = 1;
	let col = 1;
	for (let i = 0; i < idx && i < src.length; i++) {
		if (src[i] === "\n") {
			line++;
			col = 1;
		} else {
			col++;
		}
	}
	return { line, column: col };
}

export function proposeKey(raw: string, kind: SiteKind): string | null {
	let s = raw.replace(/\$\{[^}]*\}/g, " ").replace(/\{[^}]*\}/g, " ");
	s = s.replace(/['"`]/g, " ");
	const words = s
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	if (words.length === 0) return null;
	const camel =
		words[0] +
		words
			.slice(1)
			.map((w) => w[0].toUpperCase() + w.slice(1))
			.join("");
	const ns = kind === "throw" || kind === "error" ? "errors" : "messages";
	const safe = /^[0-9]/.test(camel) ? `k${camel}` : camel;
	return `${ns}.${safe}`;
}

function makeId(
	file: string,
	content: string,
	site: Omit<InventorySite, "id">,
): string {
	const basis = `${file}\u0000${site.line}\u0000${site.column}\u0000${site.raw}`;
	return createHash("sha256").update(basis).digest("hex").slice(0, 12);
}

function walk(
	dir: string,
	cb: (file: string, rel: string) => void,
	relPrefix = "",
): void {
	for (const ent of readdirSync(dir)) {
		if (SKIP_DIRS.has(ent)) continue;
		const full = join(dir, ent);
		const st = statSync(full);
		const rel = relPrefix ? `${relPrefix}/${ent}` : ent;
		if (st.isDirectory()) walk(full, cb, rel);
		else cb(full, rel);
	}
}

function isLocaleFile(abs: string): boolean {
	const rel = relative(LOCALES_DIR, abs);
	return rel === "" || (!rel.startsWith("..") && !rel.startsWith("."));
}

function collectFiles(base: string): { abs: string; rel: string }[] {
	const out: { abs: string; rel: string }[] = [];
	walk(base, (abs, rel) => out.push({ abs, rel }));
	return out;
}

function* candidates(
	pkg: ScanPackage,
	includeSurface: boolean,
): Generator<InventorySite> {
	const root = scanRoot(pkg);
	let base: string;
	try {
		base = statSync(join(root, "src")).isDirectory() ? join(root, "src") : root;
	} catch {
		base = root;
	}
	const seen = new Set<string>();
	for (const { abs, rel } of collectFiles(base)) {
		if (!/\.(tsx?|jsx?|svelte|vue)$/.test(rel)) continue;
		if (/\.test\.(tsx?|jsx?)$/.test(rel)) continue;
		if (isLocaleFile(abs)) continue;
		const content = readFileSync(abs, "utf8");
		const file = relative(ROOT, abs).split(sep).join("/");

		ERROR_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while (true) {
			m = ERROR_RE.exec(content);
			if (!m) break;
			const cls = m[2];
			if (!/Error$/i.test(cls)) continue;
			const literal = m[3] ?? m[4] ?? m[5] ?? "";
			const quote = m[3] !== undefined ? '"' : m[4] !== undefined ? "`" : "'";
			const start = m.index + m[0].indexOf(quote);
			const end = start + literal.length + 2;
			const { line, column } = lineCol(content, start);
			const raw = unescapeLiteral(literal);
			const site: Omit<InventorySite, "id"> = {
				package: pkg,
				file,
				line,
				column,
				start,
				end,
				kind: m[1] === "throw new" ? "throw" : "error",
				cls,
				raw,
				quote,
				hasInterpolation: hasInterpolation(literal, quote),
				proposedKey: proposeKey(raw, "error"),
			};
			const id = makeId(file, content, site);
			if (seen.has(id)) continue;
			seen.add(id);
			yield { ...site, id };
		}

		if (includeSurface) {
			SURFACE_RE.lastIndex = 0;
			let sm: RegExpExecArray | null;
			while (true) {
				sm = SURFACE_RE.exec(content);
				if (!sm) break;
				const call = sm[1];
				if (!SURFACE_CALLS.has(call)) continue;
				const literal = sm[2] ?? sm[3] ?? sm[4] ?? "";
				if (!literal) continue;
				const quote =
					sm[2] !== undefined ? '"' : sm[3] !== undefined ? "`" : "'";
				const start = sm.index + sm[0].lastIndexOf(quote);
				const end = start + literal.length + 2;
				const { line, column } = lineCol(content, start);
				const raw = unescapeLiteral(literal);
				const site: Omit<InventorySite, "id"> = {
					package: pkg,
					file,
					line,
					column,
					start,
					end,
					kind: "surface",
					call,
					raw,
					quote,
					hasInterpolation: hasInterpolation(literal, quote),
					proposedKey: proposeKey(raw, "surface"),
				};
				const id = makeId(file, content, site);
				if (seen.has(id)) continue;
				seen.add(id);
				yield { ...site, id };
			}
		}
	}
}

export function buildInventory(includeSurface: boolean): Inventory {
	const sites: InventorySite[] = [];
	const roots: string[] = [];
	for (const pkg of SCAN_PACKAGES) {
		roots.push(`packages/${pkg}`);
		for (const s of candidates(pkg, includeSurface)) sites.push(s);
	}
	sites.sort(
		(a, b) =>
			a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
	);
	return {
		version: INVENTORY_VERSION,
		tool: "scripts/i18n",
		generatedAt: new Date().toISOString(),
		roots,
		sites,
		digest: digestSites(sites),
	};
}

export function digestSites(sites: InventorySite[]): string {
	const canonical = JSON.stringify(
		sites.map((s) => ({ ...s, start: undefined, end: undefined })),
	);
	return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function writeInventory(inv: Inventory): void {
	writeFileSync(INVENTORY_FILE, JSON.stringify(inv, null, 2) + "\n", "utf8");
}

export function readInventory(): Inventory {
	const raw = readFileSync(INVENTORY_FILE, "utf8");
	return JSON.parse(raw) as Inventory;
}

/** Load the runtime EN_LOCALE key set (read-only import of the aggregator). */
export async function enLocaleKeys(): Promise<Set<string>> {
	const mod = await import(pathToFileURL(EN_AGGREGATOR).href);
	const dict = (mod as Record<string, Record<string, string>>).EN_LOCALE ?? {};
	return new Set(Object.keys(dict));
}
