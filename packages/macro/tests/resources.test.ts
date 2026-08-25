import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createDictionaryResourceFactory,
	type DictionarySeed,
	type MacroSpec,
	openJsonlDictionary,
	openMemoryDictionary,
	parseMacroLine,
} from "../src/index";
import { createDefaultI18nKernel } from "../src/workspace/i18n/discovery";
import { resolveMessage } from "../src/workspace/i18n/translation";

const seed: DictionarySeed = {
	namespaces: [{ code: "BOOK", isPublic: true, isExternalPrivate: false }],
	concepts: [
		{
			id: "book:one",
			namespaceCode: "BOOK",
			standardCode: "1",
			display: "The First Book",
			value: { isbn: "1" },
		},
		{
			id: "book:two",
			namespaceCode: "BOOK",
			standardCode: "2",
			display: "The Second Book",
		},
	],
	relations: [
		{
			id: "book:related",
			conceptId: "book:one",
			linkedId: "book:two",
			relationshipType: "EQUIVALENT",
		},
	],
	expressions: [
		{
			id: "expr:first",
			term: "first book",
			conceptId: "book:one",
			canonicalValue: "book:one",
			priorityWeight: 2,
		},
		{
			id: "expr:case",
			term: "Second",
			conceptId: "book:two",
			isCaseInsensitive: true,
			canonicalValue: "book:two",
		},
		{
			id: "expr:inactive",
			term: "hidden",
			active: false,
			canonicalValue: "hidden",
		},
	],
};

describe("core-backed dictionary resources", () => {
	test("requires explicit configuration for the generic resource opener", async () => {
		const factory = createDictionaryResourceFactory("books");
		await expect(factory.open()).rejects.toThrow(
			"backend must be explicitly configured",
		);
		await expect(factory.open({ backend: { type: "jsonl" } })).rejects.toThrow(
			"requires an explicit target",
		);
	});

	test("seeds dependency order, reports idempotency, and exposes a synchronous backend", async () => {
		const resource = await openMemoryDictionary({ ownerExtensionId: "books" });
		const first = await resource.seed(seed);
		expect(first.inserted).toEqual({
			namespace: 1,
			concept: 2,
			relation: 1,
			expression: 3,
		});
		expect(first.diagnostics).toHaveLength(0);

		const second = await resource.seed(seed);
		expect(second.inserted).toEqual({
			namespace: 0,
			concept: 0,
			relation: 0,
			expression: 0,
		});
		expect(second.updated).toEqual({
			namespace: 0,
			concept: 0,
			relation: 0,
			expression: 0,
		});
		expect(second.skipped).toEqual({
			namespace: 1,
			concept: 2,
			relation: 1,
			expression: 3,
		});

		const concept = await resource.concepts.getById("book:one");
		expect(concept?.value).toEqual({ isbn: "1" });
		const exact = resource.expressions.search({
			backendId: resource.id,
			argumentId: "book",
			text: "read first book today",
			offset: 0,
		});
		expect(exact[0]).toMatchObject({
			id: "expr:first",
			term: "first book",
			matchKind: "exact",
			conceptId: "book:one",
		});
		const prefix = resource.expressions.search({
			backendId: resource.id,
			argumentId: "book",
			text: "read first boo",
			offset: 0,
		});
		expect(prefix[0]).toMatchObject({
			id: "expr:first",
			matchKind: "prefix",
			term: "first boo",
		});
		const insensitive = resource.expressions.search({
			backendId: resource.id,
			argumentId: "book",
			text: "SECOND",
			offset: 0,
		});
		expect(insensitive[0]?.id).toBe("expr:case");
		expect(
			resource.expressions.search({
				backendId: resource.id,
				argumentId: "book",
				text: "hidden",
				offset: 0,
			}),
		).toHaveLength(0);
		await resource.close();
		expect(() => resource.expressionBackend()).toThrow("closed");
	});

	test("connects the resource backend to the parser", async () => {
		const resource = await openMemoryDictionary({ ownerExtensionId: "books" });
		await resource.seed(seed);
		const spec: MacroSpec = {
			id: "read",
			name: "read",
			arguments: [
				{
					argumentId: "book",
					name: "book",
					path: "book",
					matcher: { kind: "expression", backendId: resource.id },
					required: true,
				},
			],
			matching: { positionalFallback: true },
		};
		const parsed = parseMacroLine("^read first book", spec, {
			context: { syntax: { macroStartToken: "^" } },
			backends: { [resource.id]: resource.expressionBackend() },
		});
		expect(parsed?.matches[0]).toMatchObject({
			canonicalValue: "book:one",
			sourceId: "expr:first",
			conceptId: "book:one",
			rawValue: "first book",
		});
		await resource.close();
	});

	test("diagnoses missing endpoints and persists through JSONL", async () => {
		const directory = await mkdtemp(join(tmpdir(), "macro-resource-"));
		const path = join(directory, "books");
		try {
			const resource = await openJsonlDictionary(path, {
				ownerExtensionId: "books",
			});
			const report = await resource.seed({
				relations: [
					{
						id: "bad",
						conceptId: "missing",
						linkedId: "also-missing",
						relationshipType: "EQUIVALENT",
					},
				],
			});
			expect(report.diagnostics[0]).toMatchObject({
				code: "MISSING_RELATION_ENDPOINT",
				recordId: "bad",
			});
			await resource.seed(seed);
			await resource.close();
			const reopened = await openJsonlDictionary(path, {
				ownerExtensionId: "books",
			});
			expect((await reopened.concepts.getById("book:one"))?.display).toBe(
				"The First Book",
			);
			expect(
				reopened.expressions.search({
					backendId: reopened.id,
					argumentId: "book",
					text: "first book",
					offset: 0,
				})[0]?.id,
			).toBe("expr:first");
			await reopened.close();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("opens a configured SQL resource through the shared backend specification", async () => {
		const directory = await mkdtemp(join(tmpdir(), "macro-sql-resource-"));
		const path = join(directory, "dictionary.sqlite");
		try {
			const factory = createDictionaryResourceFactory("books");
			const resource = await factory.open({
				backend: { type: "sqlite", target: path },
			});
			const report = await resource.seed(seed);
			expect(report.diagnostics).toHaveLength(0);
			await resource.close();
			const reopened = await factory.open({
				backend: { type: "sqlite", target: path },
			});
			expect((await reopened.concepts.getById("book:one"))?.display).toBe(
				"The First Book",
			);
			expect(
				reopened.expressions.search({
					backendId: reopened.id,
					argumentId: "book",
					text: "first book",
					offset: 0,
				})[0]?.id,
			).toBe("expr:first");
			await reopened.close();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

describe("resource diagnostic localization", () => {
	test("attaches messageKey/messageParams for missing relation endpoints", async () => {
		const resource = await openMemoryDictionary({ ownerExtensionId: "books" });
		const report = await resource.seed({
			relations: [
				{
					id: "bad",
					conceptId: "missing",
					linkedId: "also-missing",
					relationshipType: "EQUIVALENT",
				},
			],
		});
		expect(report.diagnostics).toHaveLength(1);
		const diagnostic = report.diagnostics[0]!;
		expect(diagnostic.code).toBe("MISSING_RELATION_ENDPOINT");
		expect(diagnostic.messageKey).toBe(
			"errors.resourceRelationEndpointMissing",
		);
		expect(diagnostic.messageParams).toEqual({ relationId: "bad" });
		await resource.close();
	});

	test("attaches messageKey/messageParams for invalid expression regex", async () => {
		const resource = await openMemoryDictionary({ ownerExtensionId: "books" });
		const report = await resource.seed({
			expressions: [
				{
					id: "expr:bad",
					term: "bad",
					regexPattern: "(",
					conceptId: undefined,
				},
			],
		});
		const diagnostic = report.diagnostics.find(
			(item) => item.code === "INVALID_EXPRESSION_REGEX",
		);
		expect(diagnostic?.messageKey).toBe(
			"errors.resourceExpressionRegexInvalid",
		);
		expect(diagnostic?.messageParams).toMatchObject({
			expressionId: "expr:bad",
		});
		expect(typeof diagnostic?.messageParams?.detail).toBe("string");
		await resource.close();
	});

	test("attaches messageKey/messageParams for missing expression concept", async () => {
		const resource = await openMemoryDictionary({ ownerExtensionId: "books" });
		const report = await resource.seed({
			expressions: [{ id: "expr:orphan", term: "orphan", conceptId: "ghost" }],
		});
		const diagnostic = report.diagnostics.find(
			(item) => item.code === "MISSING_EXPRESSION_CONCEPT",
		);
		expect(diagnostic?.messageKey).toBe(
			"errors.resourceExpressionConceptMissing",
		);
		expect(diagnostic?.messageParams).toEqual({
			expressionId: "expr:orphan",
			conceptId: "ghost",
		});
		await resource.close();
	});

	test("attaches messageKey/messageParams for invalid seed records", async () => {
		const resource = await openMemoryDictionary({ ownerExtensionId: "books" });
		const report = await resource.seed({
			concepts: [{ id: "" }],
			namespaces: [{ code: "" }],
		});
		const conceptDiagnostic = report.diagnostics.find(
			(item) => item.recordType === "concept",
		);
		expect(conceptDiagnostic?.code).toBe("INVALID_SEED_RECORD");
		expect(conceptDiagnostic?.messageKey).toBe(
			"errors.resourceSeedConceptIdRequired",
		);
		const namespaceDiagnostic = report.diagnostics.find(
			(item) => item.recordType === "namespace",
		);
		expect(namespaceDiagnostic?.messageKey).toBe(
			"errors.resourceSeedNamespaceCodeRequired",
		);
		await resource.close();
	});

	test("attaches messageKey/messageParams for ownership conflicts", async () => {
		const directory = await mkdtemp(join(tmpdir(), "macro-own-resource-"));
		const path = join(directory, "books");
		try {
			const first = await openJsonlDictionary(path, {
				ownerExtensionId: "books",
			});
			await first.seed({
				concepts: [{ id: "book:shared", display: "Shared" }],
			});
			await first.close();

			const second = await openJsonlDictionary(path, {
				ownerExtensionId: "other",
			});
			const report = await second.seed({
				concepts: [{ id: "book:shared", display: "Shared" }],
			});
			const diagnostic = report.diagnostics.find(
				(item) => item.code === "OWNERSHIP_CONFLICT",
			);
			expect(diagnostic?.messageKey).toBe("errors.resourceOwnershipConflict");
			expect(diagnostic?.messageParams).toEqual({
				recordType: "concept",
				recordId: "book:shared",
			});
			await second.close();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("resolves resource diagnostics through the i18n kernel", async () => {
		const kernel = createDefaultI18nKernel("en");
		expect(
			resolveMessage(kernel, {
				messageKey: "errors.resourceRelationEndpointMissing",
				messageParams: { relationId: "bad" },
			}),
		).toBe("Relation 'bad' references a missing concept endpoint");

		kernel.setActiveLocale("es");
		expect(
			resolveMessage(kernel, {
				messageKey: "errors.resourceExpressionConceptMissing",
				messageParams: {
					expressionId: "expr:orphan",
					conceptId: "ghost",
				},
			}),
		).toBe(
			"La expresión 'expr:orphan' hace referencia al concepto faltante 'ghost'",
		);
	});
});
