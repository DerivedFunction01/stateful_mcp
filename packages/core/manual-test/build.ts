import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const output = resolve(import.meta.dir, "dist");
const sqliteDist = resolve(root, "node_modules/@sqlite.org/sqlite-wasm/dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = await Bun.build({
	entrypoints: [resolve(import.meta.dir, "main.ts")],
	outdir: output,
	target: "browser",
	minify: false,
	naming: "manual-test.js",
});
if (!result.success) {
	for (const log of result.logs) console.error(log);
	throw new Error("Manual test build failed");
}
await cp(resolve(import.meta.dir, "index.html"), resolve(output, "index.html"));
await cp(
	resolve(sqliteDist, "sqlite3-worker1.mjs"),
	resolve(output, "sqlite3-worker1.mjs"),
);
await cp(
	resolve(sqliteDist, "sqlite3-opfs-async-proxy.js"),
	resolve(output, "sqlite3-opfs-async-proxy.js"),
);
await cp(resolve(sqliteDist, "sqlite3.wasm"), resolve(output, "sqlite3.wasm"));
console.log(`Built ${dirname(output)}/manual-test/dist`);
