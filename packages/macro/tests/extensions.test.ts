import { describe, expect, test } from "bun:test";
import {
	defineExtension,
	ExtensionRuntime,
	type LoadedExtension,
	type MacroExtension,
} from "../src/index";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function loaded(extension: MacroExtension, sourceFile = `/fixtures/${extension.manifest.id}.ts`): LoadedExtension {
	return { extension, sourceFile };
}

describe("extension runtime", () => {
	test("activates dependencies before dependents and shares only exported capabilities", async () => {
		const books = defineExtension({
			id: "books",
			version: "1.0.0",
			activate: async (context) => {
				const dictionary = await context.dictionaries.memory();
				await dictionary.seed({ expressions: [{ id: "book", term: "book", canonicalValue: "book" }] });
				return { exports: { booksDictionary: dictionary } };
			},
		});
		let observed: unknown;
		const reader = defineExtension({
			id: "reader",
			version: "1.0.0",
			requires: ["books"],
			activate: (context) => {
				observed = context.dependencies.require("books").exports.booksDictionary;
				return {};
			},
		});
		const runtime = new ExtensionRuntime();
		const result = await runtime.activate([loaded(reader), loaded(books)]);
		// Lexical input order does not override dependency order.
		expect(result.diagnostics).toHaveLength(0);
		expect(observed).toBeDefined();
		expect(runtime.extensions.list().map((item) => item.manifest.id)).toEqual(["books", "reader"]);
		await runtime.dispose();
		expect(runtime.extensions.list()).toHaveLength(0);
	});

	test("discards registrations and closes resources when activation fails", async () => {
		let closed = false;
		const broken = defineExtension({
			id: "broken",
			version: "1.0.0",
			activate: async (context) => {
				const dictionary = await context.dictionaries.memory();
				const originalClose = dictionary.close.bind(dictionary);
				dictionary.close = async () => { closed = true; await originalClose(); };
				context.macros.register({ id: "broken-macro", name: "broken", arguments: [] });
				throw new Error("boom");
			},
		});
		const runtime = new ExtensionRuntime({ logger: { debug() {}, info() {}, warn() {}, error() {} } });
		const result = await runtime.activate([loaded(broken, "/tmp/broken.ts")]);
		expect(result.diagnostics[0]).toMatchObject({ code: "EXTENSION_ACTIVATION_FAILED", extensionId: "broken", sourceFile: "/tmp/broken.ts" });
		expect(runtime.macros.get("broken")).toBeUndefined();
		expect(closed).toBe(true);
	});

	test("rejects duplicate IDs, missing dependencies, and cycles", async () => {
		const one = defineExtension({ id: "one", version: "1", activate: () => ({}) });
		await expect(new ExtensionRuntime().activate([loaded(one), loaded(one, "/other.ts")])).rejects.toThrow("Duplicate extension ID");
		const missing = defineExtension({ id: "missing-user", version: "1", requires: ["absent"], activate: () => ({}) });
		await expect(new ExtensionRuntime().activate([loaded(missing)])).rejects.toThrow("missing dependency");
		const a = defineExtension({ id: "a", version: "1", requires: ["b"], activate: () => ({}) });
		const b = defineExtension({ id: "b", version: "1", requires: ["a"], activate: () => ({}) });
		await expect(new ExtensionRuntime().activate([loaded(a), loaded(b)])).rejects.toThrow("cycle");
	});

	test("loads TypeScript and JavaScript files in lexical order and reloads registrations", async () => {
		const directory = await mkdtemp(join(tmpdir(), "macro-extensions-"));
		try {
			await writeFile(join(directory, "b.ts"), "export default { manifest: { id: 'b', version: '1' }, activate() { return {}; } };\n");
			await writeFile(join(directory, "a.js"), "export default { manifest: { id: 'a', version: '1' }, activate() { return {}; } };\n");
			await writeFile(join(directory, ".ignored.js"), "throw new Error('hidden file imported');\n");
			const runtime = new ExtensionRuntime();
			await runtime.load(directory);
			const result = await runtime.activate();
			expect(result.diagnostics).toHaveLength(0);
			expect(runtime.extensions.list().map((item) => item.manifest.id)).toEqual(["a", "b"]);
			const replacement = defineExtension({
				id: "a",
				version: "2",
				activate: (context) => {
					context.macros.register({ id: "replacement", name: "replacement", arguments: [] });
					return {};
				},
			});
			await runtime.reload(loaded(replacement, join(directory, "a.js")));
			expect(runtime.macros.get("replacement")).toBeDefined();
			expect(runtime.macros.get("a")).toBeUndefined();
			await runtime.dispose();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
