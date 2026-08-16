import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createMacroRuntimeContext,
	defineExtension,
	ExtensionRuntime,
	type LoadedExtension,
	type MacroExtension,
} from "../src/index";
import { noteAdapter } from "./support/composed-macro-fixtures";

function loaded(
	extension: MacroExtension,
	sourceFile = `/fixtures/${extension.manifest.id}.ts`,
): LoadedExtension {
	return { extension, sourceFile };
}

describe("extension runtime", () => {
	test("activates dependencies before dependents and shares only exported capabilities", async () => {
		const books = defineExtension({
			id: "books",
			version: "1.0.0",
			activate: async (context) => {
				const dictionary = await context.dictionaries.memory();
				await dictionary.seed({
					expressions: [{ id: "book", term: "book", canonicalValue: "book" }],
				});
				return { exports: { booksDictionary: dictionary } };
			},
		});
		let observed: unknown;
		const reader = defineExtension({
			id: "reader",
			version: "1.0.0",
			requires: ["books"],
			activate: (context) => {
				observed =
					context.dependencies.require("books").exports.booksDictionary;
				return {};
			},
		});
		const runtime = new ExtensionRuntime();
		const result = await runtime.activate([loaded(reader), loaded(books)]);
		// Lexical input order does not override dependency order.
		expect(result.diagnostics).toHaveLength(0);
		expect(observed).toBeDefined();
		expect(runtime.extensions.list().map((item) => item.manifest.id)).toEqual([
			"books",
			"reader",
		]);
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
				dictionary.close = async () => {
					closed = true;
					await originalClose();
				};
				context.macros.register({
					id: "broken-macro",
					name: "broken",
					arguments: [],
				});
				throw new Error("boom");
			},
		});
		const runtime = new ExtensionRuntime({
			logger: { debug() {}, info() {}, warn() {}, error() {} },
		});
		const result = await runtime.activate([loaded(broken, "/tmp/broken.ts")]);
		expect(result.diagnostics[0]).toMatchObject({
			code: "EXTENSION_ACTIVATION_FAILED",
			extensionId: "broken",
			sourceFile: "/tmp/broken.ts",
		});
		expect(runtime.macros.get("broken")).toBeUndefined();
		expect(closed).toBe(true);
	});

	test("rejects duplicate IDs, missing dependencies, and cycles", async () => {
		const one = defineExtension({
			id: "one",
			version: "1",
			activate: () => ({}),
		});
		await expect(
			new ExtensionRuntime().activate([loaded(one), loaded(one, "/other.ts")]),
		).rejects.toThrow("Duplicate extension ID");
		const missing = defineExtension({
			id: "missing-user",
			version: "1",
			requires: ["absent"],
			activate: () => ({}),
		});
		await expect(
			new ExtensionRuntime().activate([loaded(missing)]),
		).rejects.toThrow("missing dependency");
		const a = defineExtension({
			id: "a",
			version: "1",
			requires: ["b"],
			activate: () => ({}),
		});
		const b = defineExtension({
			id: "b",
			version: "1",
			requires: ["a"],
			activate: () => ({}),
		});
		await expect(
			new ExtensionRuntime().activate([loaded(a), loaded(b)]),
		).rejects.toThrow("cycle");
	});

	test("loads TypeScript and JavaScript files in lexical order and reloads registrations", async () => {
		const directory = await mkdtemp(join(tmpdir(), "macro-extensions-"));
		try {
			await writeFile(
				join(directory, "b.ts"),
				"export default { manifest: { id: 'b', version: '1' }, activate() { return {}; } };\n",
			);
			await writeFile(
				join(directory, "a.js"),
				"export default { manifest: { id: 'a', version: '1' }, activate() { return {}; } };\n",
			);
			await writeFile(
				join(directory, ".ignored.js"),
				"throw new Error('hidden file imported');\n",
			);
			const runtime = new ExtensionRuntime();
			await runtime.load(directory);
			const result = await runtime.activate();
			expect(result.diagnostics).toHaveLength(0);
			expect(runtime.extensions.list().map((item) => item.manifest.id)).toEqual(
				["a", "b"],
			);
			const replacement = defineExtension({
				id: "a",
				version: "2",
				activate: (context) => {
					context.macros.register({
						id: "replacement",
						name: "replacement",
						arguments: [],
					});
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

	test("enforces runtime-owned context invariant for parsing", async () => {
		const customContext = createMacroRuntimeContext({ macroStartToken: "!" });
		const runtime = new ExtensionRuntime({ context: customContext });
		const ext = defineExtension({
			id: "notes",
			version: "1",
			activate: (context) => {
				context.macros.register({
					id: "note",
					name: "note",
					arguments: [],
				});
				return {};
			},
		});
		await runtime.activate([loaded(ext)]);

		// Parses with runtime custom context ("!")
		expect(runtime.parse("!note")?.macroName).toBe("note");
		// Does NOT parse with default start token ("^")
		expect(runtime.parse("^note")).toBeNull();

		// Default runtime context uses "^"
		const defaultRuntime = new ExtensionRuntime();
		await defaultRuntime.activate([loaded(ext)]);
		expect(defaultRuntime.parse("^note")?.macroName).toBe("note");
		expect(defaultRuntime.parse("!note")).toBeNull();

		await runtime.dispose();
		await defaultRuntime.dispose();
	});

	test("resolves config, seeds resources, and owns returned adapters", async () => {
		const directory = await mkdtemp(join(tmpdir(), "macro-integration-"));
		const seedPath = join(directory, "seed.json");
		await writeFile(
			seedPath,
			JSON.stringify({
				expressions: [{ id: "book", term: "book", canonicalValue: "book" }],
			}),
		);
		let observedConfig: Readonly<Record<string, unknown>> | undefined;
		try {
			const extension = defineExtension({
				id: "configured-notes",
				version: "1",
				configDefaults: {
					values: { decimalPoint: ".", precision: 1 },
					formats: ["default"],
				},
				activate: async (context) => {
					observedConfig = context.config;
					const seed = await context.seed.load("seed.json");
					const dictionary = await context.dictionaries.memory();
					await dictionary.seed(seed);
					context.macros.register(noteAdapter.definition);
					return {
						adapters: [noteAdapter],
						exports: { dictionary },
					};
				},
			});
			const runtime = new ExtensionRuntime({
				settings: {
					"configured-notes": {
						values: { precision: 2 },
						formats: ["custom"],
					},
				},
			});
			const result = await runtime.activate([
				loaded(extension, join(directory, "extension.ts")),
			]);

			expect(result.diagnostics).toHaveLength(0);
			expect(observedConfig).toMatchObject({
				values: { decimalPoint: ".", precision: 2 },
				formats: ["custom"],
			});
			expect(Object.isFrozen(observedConfig)).toBe(true);
			expect(Object.isFrozen(observedConfig?.values)).toBe(true);
			expect(runtime.adapters.get(noteAdapter.definition.id)).toBeDefined();

			const draft = await runtime.parseAdapter(
				noteAdapter.definition.id,
				"^note title=Harry Potter page=42 year=2004",
			);
			await expect(
				runtime.executeAdapter(noteAdapter.definition.id, draft),
			).resolves.toEqual({
				kind: "note",
				values: ["Harry Potter", "42", "2004"],
			});

			await expect(
				runtime.parseAdapter("missing-adapter", "^note"),
			).rejects.toThrow("unavailable");
			await runtime.dispose("configured-notes");
			expect(runtime.adapters.get(noteAdapter.definition.id)).toBeUndefined();
			expect(runtime.macros.get("note")).toBeUndefined();

			await expect(
				new ExtensionRuntime({
					logger: { debug() {}, info() {}, warn() {}, error() {} },
				}).activate([
					loaded(
						defineExtension({
							id: "bad-seed",
							version: "1",
							activate: async (context) => {
								await context.seed.load("../outside.json");
								return {};
							},
						}),
						join(directory, "nested", "extension.ts"),
					),
				]),
			).resolves.toMatchObject({
				active: [],
				diagnostics: [
					{ code: "EXTENSION_ACTIVATION_FAILED", extensionId: "bad-seed" },
				],
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("preview followed by resource reseed/reload rejects execution due to stale resolver version", async () => {
		let dictionaryRef: any;
		const ext = defineExtension({
			id: "library",
			version: "1",
			activate: async (context) => {
				const dictionary = await context.dictionaries.memory({ id: "books" });
				await dictionary.seed({
					expressions: [
						{ id: "hp", term: "hp", canonicalValue: "Harry Potter" },
					],
				});
				dictionaryRef = dictionary;
				const macroSpec = {
					id: "fixture.lookup",
					name: "lookup",
					version: 1,
					arguments: [
						{
							argumentId: "concept",
							name: "concept",
							path: "fixture.lookup.concept",
							matcher: context.matchers.expression(dictionary),
						},
					],
					matching: { positionalFallback: true },
				};
				const adapter = {
					definition: macroSpec,
					previewTemplate: {
						version: 1 as const,
						parts: [
							{ kind: "literal" as const, text: "concept: " },
							{ kind: "slot" as const, argumentId: "concept", occurrence: 1 },
						],
					},
					children: {
						concept: {
							type: "expression",
							validate: (ctx: any) => ({
								status: "accepted" as const,
								binding: {
									backendId: dictionary.id,
									canonicalValue: "Harry Potter",
								},
								previewValues: [
									{ argumentId: "concept", value: "Harry Potter" },
								],
							}),
						},
					},
					compile: (bindings: any) => ({
						kind: "lookup",
						concept: bindings[0]?.binding?.canonicalValue,
					}),
				};
				return {
					adapters: [adapter],
				};
			},
		});

		const runtime = new ExtensionRuntime();
		await runtime.activate([loaded(ext)]);

		// Generate draft with preview at version 1 (or initial version after seed)
		const draft = await runtime.parseAdapter("fixture.lookup", "^lookup hp");
		expect(draft.executionPreview?.status).toBe("valid");

		// Execute succeeds initially
		await expect(
			runtime.executeAdapter("fixture.lookup", draft),
		).resolves.toEqual({
			kind: "lookup",
			concept: "Harry Potter",
		});

		// Now re-seed the dictionary, advancing its version
		await dictionaryRef.seed({
			expressions: [
				{ id: "lotr", term: "lotr", canonicalValue: "Lord of the Rings" },
			],
		});

		// Executing the old preview is rejected as stale
		await expect(
			runtime.executeAdapter("fixture.lookup", draft),
		).rejects.toThrow("stale");

		await runtime.dispose();
	});

	test("preview followed by extension disposal rejects execution and adapter lookup fails", async () => {
		const ext = defineExtension({
			id: "notes-ext",
			version: "1",
			activate: async (context) => {
				return {
					adapters: [noteAdapter],
				};
			},
		});

		const runtime = new ExtensionRuntime();
		await runtime.activate([loaded(ext)]);

		const draft = await runtime.parseAdapter(
			noteAdapter.definition.id,
			"^note title=Harry Potter page=42 year=2004",
		);
		expect(draft.executionPreview?.status).toBe("valid");

		// Dispose the extension
		await runtime.dispose("notes-ext");

		// Adapter lookup fails
		expect(runtime.adapters.get(noteAdapter.definition.id)).toBeUndefined();
		await expect(
			runtime.parseAdapter(noteAdapter.definition.id, "^note"),
		).rejects.toThrow("unavailable");
		await expect(
			runtime.executeAdapter(noteAdapter.definition.id, draft),
		).rejects.toThrow("unavailable");
	});

	test("owner-scoped backend resolution isolates unrelated integrations without declared dependency", async () => {
		const extA = defineExtension({
			id: "extA",
			version: "1",
			activate: async (context) => {
				const dictA = await context.dictionaries.memory({ id: "dictA" });
				await dictA.seed({
					expressions: [{ id: "alpha", term: "alpha", canonicalValue: "A" }],
				});
				context.matchers.expression(dictA);
				return {};
			},
		});

		const extB = defineExtension({
			id: "extB",
			version: "1",
			activate: async (context) => {
				const dictB = await context.dictionaries.memory({ id: "dictB" });
				await dictB.seed({
					expressions: [{ id: "beta", term: "beta", canonicalValue: "B" }],
				});
				context.matchers.expression(dictB);
				return {};
			},
		});

		const runtime = new ExtensionRuntime();
		await runtime.activate([loaded(extA), loaded(extB)]);

		const backendsA = runtime.getScopedBackends("extA");
		const backendsB = runtime.getScopedBackends("extB");

		expect(Object.keys(backendsA)).toEqual(["extA:dictA"]);
		expect(Object.keys(backendsB)).toEqual(["extB:dictB"]);
		expect(backendsA["extB:dictB"]).toBeUndefined();
		expect(backendsB["extA:dictA"]).toBeUndefined();

		await runtime.dispose();
	});

	test("failed activation leaves zero partial registry state (complete rollback)", async () => {
		let resourceClosed = false;
		const invalidExt = defineExtension({
			id: "fail-ext",
			version: "1",
			activate: async (context) => {
				const dict = await context.dictionaries.memory({ id: "fail-dict" });
				const originalClose = dict.close.bind(dict);
				dict.close = async () => {
					resourceClosed = true;
					await originalClose();
				};
				context.matchers.expression(dict);
				context.macros.register({
					id: "fail-macro",
					name: "fail-macro",
					arguments: [],
				});
				context.listeners.register({
					id: "fail-listener",
					onParsed: () => undefined,
				});
				// Invalid adapter missing child handler will fail during registerAdapter
				return {
					adapters: [
						{
							definition: {
								id: "bad-adapter",
								name: "bad-macro",
								version: 1,
								arguments: [
									{
										argumentId: "arg1",
										name: "arg1",
										path: "test.arg1",
									},
								],
							},
							previewTemplate: { version: 1, parts: [] },
							children: {}, // missing arg1 handler!
						},
					],
				};
			},
		});

		const runtime = new ExtensionRuntime({
			logger: { debug() {}, info() {}, warn() {}, error() {} },
		});
		const result = await runtime.activate([loaded(invalidExt)]);

		expect(result.active).toHaveLength(0);
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]?.code).toBe("EXTENSION_ACTIVATION_FAILED");

		// Everything must be rolled back:
		expect(runtime.macros.get("fail-macro")).toBeUndefined();
		expect(runtime.adapters.get("bad-adapter")).toBeUndefined();
		expect(runtime.getListeners()).toHaveLength(0);
		expect(runtime.getScopedBackends("fail-ext")).toEqual({});
		expect(resourceClosed).toBe(true);
	});
});
