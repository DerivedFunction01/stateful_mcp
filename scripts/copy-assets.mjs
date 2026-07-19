// Copies non-TypeScript runtime assets into dist/ after `tsc` build.
// tsc only emits .js/.d.ts, so config JSON, markdown docs, and the
// Python dataframe bridge must be copied explicitly for distribution.
import { cp, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const tasks = [
  // The dataframe query engine spawns this Python bridge at runtime; the bundle
  // resolves it relative to the output file's directory.
  ["src/adapters/engines/dataframe-bridge.py", "adapters/engines/dataframe-bridge.py"],
];

await mkdir(dist, { recursive: true });

for (const [from, to] of tasks) {
  const src = resolve(root, from);
  const dst = resolve(dist, to);
  if (!(await exists(src))) {
    console.warn(`[copy-assets] skipping missing: ${from}`);
    continue;
  }
  await cp(src, dst, { recursive: true });
  console.log(`[copy-assets] copied ${from} -> ${to}`);
}

console.log("[copy-assets] done");
