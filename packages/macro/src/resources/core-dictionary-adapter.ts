import {
	createJsonlConceptStore,
	createMemoryConceptStore,
} from "@stateful-mcp/core/adapters/storage/simple/create-concept-store";
import {
	createJsonlExpressionStore as createJsonlExpressionStoreFromCore,
	createMemoryExpressionStore as createMemoryExpressionStoreFromCore,
} from "@stateful-mcp/core/adapters/storage/simple/create-expression-store";
import type { OwnerScope } from "@stateful-mcp/core/config/types";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "@stateful-mcp/core/middleware/dictionary/interfaces";
import type {
	ConceptRelation,
	Concept as CoreConcept,
	CustomExpression,
	Namespace,
} from "@stateful-mcp/core/middleware/dictionary/types";
import type {
	ConfiguredConceptResolver,
	ResolverProvenance,
} from "../contracts/backends";
import type {
	ConceptSearchOptions,
	ConceptSeed,
	DictionaryBackendSpec,
	DictionaryResource,
	DictionaryResourceOptions,
	DictionarySeed,
	DictionarySeedReport,
	ExpressionSeed,
	NeutralConcept,
	ResourceDiagnostic,
	ResourceIdentity,
} from "./contracts";
import {
	addDiagnostic,
	createSeedReport,
	escapeSeedRegex,
	normalizeLookupTerm,
	sameRecord,
	seedRecords,
} from "./dictionary-seed";

interface LoadableConceptStore extends ConceptStore {
	load?(): Promise<void>;
	save?(): Promise<void>;
}

interface LoadableExpressionStore extends PersistentExpressionStore {
	load?(): Promise<void>;
	flush?(): Promise<void>;
}

export interface CoreDictionaryStores {
	concepts: LoadableConceptStore;
	expressions: LoadableExpressionStore;
}

export interface CoreDictionaryResourceOptions
	extends DictionaryResourceOptions {
	stores?: CoreDictionaryStores;
}

export class CoreDictionaryResource implements DictionaryResource {
	readonly id: string;
	readonly ownerExtensionId: string;
	version: number = 1;
	private readonly conceptStore: LoadableConceptStore;
	private readonly expressionStore: LoadableExpressionStore;
	private readonly scope: OwnerScope;
	private readonly allowUnresolvedExpressions: boolean;
	private readonly strict: boolean;
	private readonly conceptExtras = new Map<
		string,
		Pick<ConceptSeed, "value" | "metadata">
	>();
	private readonly ownedIds = new Set<string>();
	private closed = false;

	get identity(): ResourceIdentity {
		return {
			extensionId: this.ownerExtensionId,
			resourceId: this.id,
			version: this.version,
		};
	}

	private constructor(
		stores: CoreDictionaryStores,
		options: CoreDictionaryResourceOptions,
	) {
		const owner = options.ownerExtensionId ?? "anonymous";
		this.ownerExtensionId = owner;
		this.id = namespaceId(owner, options.id ?? "dictionary");
		this.conceptStore = stores.concepts;
		this.expressionStore = stores.expressions;
		this.scope =
			options.defaultScope === "global" || !options.defaultScope
				? { level: "global" }
				: options.defaultScope;
		this.allowUnresolvedExpressions =
			options.allowUnresolvedExpressions ?? false;
		this.strict = options.strict ?? false;
	}

	static async open(
		stores: CoreDictionaryStores,
		options: CoreDictionaryResourceOptions = {},
	): Promise<CoreDictionaryResource> {
		const resource = new CoreDictionaryResource(stores, options);
		try {
			await resource.conceptStore.load?.();
			await resource.expressionStore.load?.();
			await resource.rebuildIndex();
			return resource;
		} catch (error) {
			await resource.close();
			throw error;
		}
	}

	async seed(seed: DictionarySeed): Promise<DictionarySeedReport> {
		this.assertOpen();
		const report = createSeedReport();
		const records = seedRecords(seed);
		const namespaceMap = new Map(
			(await this.conceptStore.listNamespaces()).map((item) => [
				item.code,
				item,
			]),
		);

		for (const item of records.namespaces) {
			if (!validId(item.code)) {
				invalid(
					report.diagnostics,
					"namespace",
					item.code,
					"Namespace code is required",
					"errors.resourceSeedNamespaceCodeRequired",
					{ code: item.code },
				);
				report.skipped.namespace += 1;
				continue;
			}
			const expected = toCoreNamespace(item);
			const existing = namespaceMap.get(item.code);
			if (!existing) {
				await this.conceptStore.addNamespace(expected);
				namespaceMap.set(item.code, expected);
				report.inserted.namespace += 1;
				this.ownedIds.add(`namespace:${item.code}`);
			} else if (sameRecord(existing, expected)) {
				report.skipped.namespace += 1;
			} else if (this.ownedIds.has(`namespace:${item.code}`)) {
				await this.conceptStore.addNamespace(expected);
				namespaceMap.set(item.code, expected);
				report.updated.namespace += 1;
			} else {
				conflict(report.diagnostics, "namespace", item.code);
				report.skipped.namespace += 1;
			}
		}

		for (const item of records.concepts) {
			if (!validId(item.id)) {
				invalid(
					report.diagnostics,
					"concept",
					item.id,
					"Concept ID is required",
					"errors.resourceSeedConceptIdRequired",
					{ id: item.id ?? "" },
				);
				report.skipped.concept += 1;
				continue;
			}
			const expected = toCoreConcept(item, this.ownerExtensionId);
			const existing = await this.conceptStore.getById(item.id);
			if (!existing) {
				await this.conceptStore.addConcept(expected);
				this.rememberConcept(item);
				report.inserted.concept += 1;
				this.ownedIds.add(`concept:${item.id}`);
			} else if (sameRecord(existing, expected)) {
				this.rememberConcept(item);
				report.skipped.concept += 1;
			} else if (this.ownedIds.has(`concept:${item.id}`)) {
				await this.conceptStore.addConcept(expected);
				this.rememberConcept(item);
				report.updated.concept += 1;
			} else {
				conflict(report.diagnostics, "concept", item.id);
				report.skipped.concept += 1;
			}
		}

		for (const item of records.relations) {
			if (
				!validId(item.id) ||
				!validId(item.conceptId) ||
				!validId(item.linkedId)
			) {
				invalid(
					report.diagnostics,
					"relation",
					item.id,
					"Relation ID and both concept endpoints are required",
					"errors.resourceSeedRelationRequired",
					{
						id: item.id ?? "",
						conceptId: item.conceptId ?? "",
						linkedId: item.linkedId ?? "",
					},
				);
				report.skipped.relation += 1;
				continue;
			}
			if (
				!(await this.conceptStore.getById(item.conceptId)) ||
				!(await this.conceptStore.getById(item.linkedId))
			) {
				addDiagnostic(report.diagnostics, {
					code: "MISSING_RELATION_ENDPOINT",
					message: `Relation '${item.id}' references a missing concept endpoint`,
					recordType: "relation",
					recordId: item.id,
					messageKey: "errors.resourceRelationEndpointMissing",
					messageParams: { relationId: item.id },
				});
				report.skipped.relation += 1;
				continue;
			}
			if (!this.conceptStore.addRelation) {
				addDiagnostic(report.diagnostics, {
					code: "RELATIONS_UNSUPPORTED",
					message: "The selected concept store cannot persist relations",
					recordType: "relation",
					recordId: item.id,
					messageKey: "errors.resourceRelationsUnsupported",
					messageParams: { relationId: item.id },
				});
				report.skipped.relation += 1;
				continue;
			}
			if (
				!["EQUIVALENT", "NARROWER_THAN", "WIDER_THAN"].includes(
					item.relationshipType,
				)
			) {
				invalid(
					report.diagnostics,
					"relation",
					item.id,
					`Unsupported relationship type '${item.relationshipType}'`,
					"errors.resourceRelationTypeUnsupported",
					{
						id: item.id,
						relationshipType: item.relationshipType,
					},
				);
				report.skipped.relation += 1;
				continue;
			}
			const expected = toCoreRelation(item);
			const existing = await findRelation(
				this.conceptStore,
				item.id,
				item.conceptId,
			);
			if (!existing) {
				await this.conceptStore.addRelation(expected);
				report.inserted.relation += 1;
				this.ownedIds.add(`relation:${item.id}`);
			} else if (sameRecord(existing, expected)) {
				report.skipped.relation += 1;
			} else if (this.ownedIds.has(`relation:${item.id}`)) {
				await this.conceptStore.addRelation(expected);
				report.updated.relation += 1;
			} else {
				conflict(report.diagnostics, "relation", item.id);
				report.skipped.relation += 1;
			}
		}

		for (const item of records.expressions) {
			await this.seedExpression(item, report);
		}

		await this.conceptStore.save?.();
		await this.expressionStore.flush?.();
		this.version += 1;
		await this.rebuildIndex(report.diagnostics);
		return report;
	}

	concepts = {
		getById: async (id: string): Promise<NeutralConcept | undefined> => {
			this.assertOpen();
			const concept = await this.conceptStore.getById(id);
			return concept ? this.toNeutralConcept(concept) : undefined;
		},
		search: async (
			query: string,
			options: ConceptSearchOptions = {},
		): Promise<NeutralConcept[]> => {
			this.assertOpen();
			const results = await this.conceptStore.search(
				query,
				options.namespaceCode,
				options.limit,
				options.roleName,
			);
			return results.map((concept) => this.toNeutralConcept(concept));
		},
	};

	conceptResolver(): ConfiguredConceptResolver {
		const resolver = async (term: string) => {
			this.assertOpen();
			const input = term.trim();
			if (!input) return undefined;
			const byId = await this.conceptStore.getById(input);
			const concept =
				byId ?? (await this.conceptStore.search(input, undefined, 1))[0];
			if (!concept) return undefined;
			return {
				conceptId: concept.id,
				canonicalTerm: concept.display,
				...(concept.standardCode ? { standardCode: concept.standardCode } : {}),
				...(this.conceptExtras.get(concept.id)?.metadata
					? { metadata: this.conceptExtras.get(concept.id)?.metadata }
					: {}),
			};
		};
		Object.defineProperty(resolver, "provenance", {
			enumerable: true,
			get: (): ResolverProvenance => ({
				ownerExtensionId: this.ownerExtensionId,
				resourceId: this.id,
				resolverId: this.id,
				version: this.version,
			}),
		});
		return resolver as ConfiguredConceptResolver;
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await this.conceptStore.save?.();
		await this.expressionStore.flush?.();
		await closeStore(this.conceptStore);
		await closeStore(this.expressionStore);
	}

	private async seedExpression(
		item: ExpressionSeed,
		report: DictionarySeedReport,
	): Promise<void> {
		if (!validId(item.id) || !item.term) {
			invalid(
				report.diagnostics,
				"expression",
				item.id,
				"Expression ID and term are required",
				"errors.resourceSeedExpressionRequired",
				{ id: item.id ?? "", term: item.term ?? "" },
			);
			report.skipped.expression += 1;
			return;
		}
		const pattern = item.regexPattern ?? escapeSeedRegex(item.term);
		try {
			new RegExp(pattern, item.isCaseInsensitive ? "iu" : "u");
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			addDiagnostic(report.diagnostics, {
				code: "INVALID_EXPRESSION_REGEX",
				message: `Expression '${item.id}' has an invalid regex: ${detail}`,
				recordType: "expression",
				recordId: item.id,
				messageKey: "errors.resourceExpressionRegexInvalid",
				messageParams: { expressionId: item.id, detail },
			});
			if (this.strict)
				throw new Error(`Invalid expression regex for '${item.id}'`);
			return;
		}
		if (
			item.conceptId &&
			!this.allowUnresolvedExpressions &&
			!(await this.conceptStore.getById(item.conceptId))
		) {
			addDiagnostic(report.diagnostics, {
				code: "MISSING_EXPRESSION_CONCEPT",
				message: `Expression '${item.id}' references missing concept '${item.conceptId}'`,
				recordType: "expression",
				recordId: item.id,
				messageKey: "errors.resourceExpressionConceptMissing",
				messageParams: {
					expressionId: item.id,
					conceptId: item.conceptId,
				},
			});
			report.skipped.expression += 1;
			return;
		}
		const expected = toCoreExpression(item, this.ownerExtensionId, pattern);
		const existing = await this.expressionStore.getById(item.id);
		const existingOwner = existing?.context?.macroExtensionId;
		if (existing && existingOwner && existingOwner !== this.ownerExtensionId) {
			conflict(report.diagnostics, "expression", item.id);
			report.skipped.expression += 1;
			return;
		}
		if (!existing) {
			await this.expressionStore.save(expected, this.scope);
			report.inserted.expression += 1;
			this.ownedIds.add(`expression:${item.id}`);
		} else if (sameExpression(existing, expected)) {
			report.skipped.expression += 1;
		} else if (
			this.ownedIds.has(`expression:${item.id}`) ||
			existingOwner === this.ownerExtensionId
		) {
			await this.expressionStore.save(expected, this.scope);
			report.updated.expression += 1;
		} else {
			conflict(report.diagnostics, "expression", item.id);
			report.skipped.expression += 1;
		}
	}

	private async rebuildIndex(
		diagnostics: ResourceDiagnostic[] = [],
	): Promise<void> {
		const expressions = await this.expressionStore.list(this.scope, true);
		for (const expression of expressions) {
			const record = expression as CustomExpression & Record<string, unknown>;
			if (record.active === false) continue;
			const pattern =
				typeof record.regexPattern === "string"
					? record.regexPattern
					: escapeSeedRegex(record.term);
			try {
				new RegExp(pattern, record.isCaseInsensitive === true ? "iu" : "u");
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				const diagnostic: ResourceDiagnostic = {
					code: "INVALID_EXPRESSION_REGEX",
					message: `Expression '${record.id}' has an invalid regex: ${detail}`,
					recordType: "expression",
					recordId: record.id,
					severity: "error",
					messageKey: "errors.resourceExpressionRegexInvalid",
					messageParams: { expressionId: record.id, detail },
				};
				diagnostics.push(diagnostic);
				if (this.strict) throw new Error(diagnostic.message);
			}
		}
	}

	private rememberConcept(seed: ConceptSeed): void {
		this.conceptExtras.set(seed.id, {
			value: seed.value,
			metadata: seed.metadata,
		});
	}

	private toNeutralConcept(concept: CoreConcept): NeutralConcept {
		return {
			...concept,
			active: concept.active !== false,
			...this.conceptExtras.get(concept.id),
		};
	}

	private assertOpen(): void {
		if (this.closed)
			throw new Error(`Dictionary resource '${this.id}' is closed`);
	}
}

export async function createMemoryDictionaryResource(
	options: CoreDictionaryResourceOptions = {},
): Promise<DictionaryResource> {
	return CoreDictionaryResource.open(
		{
			concepts: createMemoryConceptStore() as LoadableConceptStore,
			expressions:
				createMemoryExpressionStoreFromCore() as LoadableExpressionStore,
			...options.stores,
		},
		options,
	);
}

export async function createJsonlDictionaryResource(
	path: string,
	options: CoreDictionaryResourceOptions = {},
): Promise<DictionaryResource> {
	return CoreDictionaryResource.open(
		{
			concepts: createJsonlConceptStore(
				`${path}.concepts`,
			) as LoadableConceptStore,
			expressions: createJsonlExpressionStoreFromCore(
				`${path}.expressions`,
			) as LoadableExpressionStore,
			...options.stores,
		},
		options,
	);
}

export async function createConfiguredDictionaryResource(
	options: CoreDictionaryResourceOptions = {},
): Promise<DictionaryResource> {
	const conceptSpec = options.concept ?? options.backend;
	const expressionSpec = options.expression ?? options.backend;
	if (!conceptSpec || !expressionSpec) {
		throw new Error(
			"A dictionary backend must be explicitly configured for both concepts and expressions",
		);
	}
	const [concepts, expressions] = await Promise.all([
		openConceptStore(conceptSpec),
		openExpressionStore(expressionSpec),
	]);
	return CoreDictionaryResource.open(
		{
			concepts,
			expressions,
		},
		options,
	);
}

export function createCoreDictionaryResourceFactory(
	ownerExtensionId: string,
	defaults: DictionaryResourceOptions = {},
) {
	const options = (
		requested: DictionaryResourceOptions = {},
	): DictionaryResourceOptions => ({
		...defaults,
		...requested,
		ownerExtensionId,
	});
	return {
		open: (requested: DictionaryResourceOptions = {}) =>
			createConfiguredDictionaryResource(options(requested)),
		memory: (requested: DictionaryResourceOptions = {}) =>
			createMemoryDictionaryResource(options(requested)),
		jsonl: (path: string, requested: DictionaryResourceOptions = {}) =>
			createJsonlDictionaryResource(path, options(requested)),
	};
}

async function openConceptStore(
	spec: DictionaryBackendSpec,
): Promise<LoadableConceptStore> {
	switch (spec.type) {
		case "memory":
			return createMemoryConceptStore() as LoadableConceptStore;
		case "jsonl":
			return createJsonlConceptStore(
				requiredTarget(spec),
			) as LoadableConceptStore;
		case "localstorage": {
			const module = await import(
				"@stateful-mcp/core/adapters/storage/simple/localstorage/factories"
			);
			return module.createLocalStorageConceptStore() as LoadableConceptStore;
		}
		case "indexeddb": {
			const module = await import(
				"@stateful-mcp/core/adapters/storage/simple/indexeddb/factories"
			);
			return module.createIndexedDbConceptStore(
				spec.target,
			) as LoadableConceptStore;
		}
		case "sqlite":
		case "postgres":
		case "duckdb":
		case "opfs":
			return openSqlConceptStore(spec);
	}
}

async function openExpressionStore(
	spec: DictionaryBackendSpec,
): Promise<LoadableExpressionStore> {
	switch (spec.type) {
		case "memory":
			return createMemoryExpressionStoreFromCore() as LoadableExpressionStore;
		case "jsonl":
			return createJsonlExpressionStoreFromCore(
				requiredTarget(spec),
			) as LoadableExpressionStore;
		case "localstorage": {
			const module = await import(
				"@stateful-mcp/core/adapters/storage/simple/localstorage/factories"
			);
			return module.createLocalStorageExpressionStore() as LoadableExpressionStore;
		}
		case "indexeddb": {
			const module = await import(
				"@stateful-mcp/core/adapters/storage/simple/indexeddb/factories"
			);
			return module.createIndexedDbExpressionStore(
				spec.target,
			) as LoadableExpressionStore;
		}
		case "sqlite":
		case "postgres":
		case "duckdb":
		case "opfs":
			return openSqlExpressionStore(spec);
	}
}

async function openSqlConceptStore(
	spec: DictionaryBackendSpec,
): Promise<LoadableConceptStore> {
	const backendModulePath = "@stateful-mcp/core/adapters/storage/sql/backend";
	const factoryModulePath =
		"@stateful-mcp/core/adapters/storage/sql/create-concept-store";
	const [{ SqlBackend }, factory] = await Promise.all([
		import(backendModulePath),
		import(factoryModulePath),
	]);
	const dialect = sqlDialect(spec.type as SqlBackendType);
	const target = requiredTarget(spec);
	const backend = await SqlBackend.connect(dialect, target, sqlPolicy(spec));
	return (await factory.createConceptStore(
		dialect,
		target,
		backend,
	)) as LoadableConceptStore;
}

async function openSqlExpressionStore(
	spec: DictionaryBackendSpec,
): Promise<LoadableExpressionStore> {
	const backendModulePath = "@stateful-mcp/core/adapters/storage/sql/backend";
	const factoryModulePath =
		"@stateful-mcp/core/adapters/storage/sql/create-expression-store";
	const [{ SqlBackend }, factory] = await Promise.all([
		import(backendModulePath),
		import(factoryModulePath),
	]);
	const dialect = sqlDialect(spec.type as SqlBackendType);
	const target = requiredTarget(spec);
	const backend = await SqlBackend.connect(dialect, target, sqlPolicy(spec));
	return (await factory.createExpressionStore(
		dialect,
		target,
		backend,
	)) as LoadableExpressionStore;
}

type SqlBackendType = Extract<
	DictionaryBackendSpec["type"],
	"sqlite" | "postgres" | "duckdb" | "opfs"
>;

function sqlDialect(type: SqlBackendType): "sqlite" | "postgres" | "duckdb" {
	if (type === "postgres") return "postgres";
	if (type === "duckdb") return "duckdb";
	return "sqlite";
}

function sqlPolicy(spec: DictionaryBackendSpec): Record<string, unknown> {
	return {
		capabilities: spec.capabilities,
		permissions: spec.permissions,
		schemaMode: spec.schemaMode,
	};
}

function requiredTarget(spec: DictionaryBackendSpec): string {
	if (!spec.target?.trim())
		throw new Error(`Backend '${spec.type}' requires an explicit target`);
	return spec.target;
}

function namespaceId(owner: string, id: string): string {
	return id.startsWith(`${owner}:`) ? id : `${owner}:${id}`;
}

function validId(value: string | undefined): value is string {
	return Boolean(value?.trim());
}

function invalid(
	diagnostics: ResourceDiagnostic[],
	type: ResourceDiagnostic["recordType"],
	id: string,
	message: string,
	messageKey: string,
	messageParams: ResourceDiagnostic["messageParams"],
): void {
	addDiagnostic(diagnostics, {
		code: "INVALID_SEED_RECORD",
		message,
		recordType: type,
		recordId: id,
		messageKey,
		messageParams,
	});
}

function conflict(
	diagnostics: ResourceDiagnostic[],
	type: ResourceDiagnostic["recordType"],
	id: string,
): void {
	addDiagnostic(diagnostics, {
		code: "OWNERSHIP_CONFLICT",
		message: `Cannot replace an existing ${type} '${id}' owned by another resource`,
		recordType: type,
		recordId: id,
		messageKey: "errors.resourceOwnershipConflict",
		messageParams: { recordType: type ?? "", recordId: id },
	});
}

function toCoreNamespace(
	seed: NonNullable<DictionarySeed["namespaces"]>[number],
): Namespace {
	return {
		code: seed.code,
		description: seed.description,
		isPublic: seed.isPublic ?? true,
		isExternalPrivate: seed.isExternalPrivate ?? false,
		isMutable: seed.isMutable ?? true,
		externalPrivateSource: seed.externalPrivateSource,
		apiUrl: seed.apiUrl,
		apiUrlParams: seed.apiUrlParams,
		apiRequestPayload: seed.apiRequestPayload,
		apiResponseDisplayPath: seed.apiResponseDisplayPath,
	};
}

function toCoreConcept(seed: ConceptSeed, owner: string): CoreConcept {
	return {
		id: seed.id,
		namespaceCode: seed.namespaceCode ?? `extension:${owner}`,
		standardCode: seed.standardCode ?? seed.id,
		display: seed.display ?? seed.id,
		active: seed.active !== false,
		...(seed.metadata?.description
			? { description: String(seed.metadata.description) }
			: {}),
	};
}

function toCoreRelation(
	seed: NonNullable<DictionarySeed["relations"]>[number],
): ConceptRelation {
	return {
		id: seed.id,
		conceptId: seed.conceptId,
		linkedId: seed.linkedId,
		relationshipType:
			seed.relationshipType as ConceptRelation["relationshipType"],
		active: seed.active !== false,
	};
}

function toCoreExpression(
	seed: ExpressionSeed,
	owner: string,
	pattern: string,
): CustomExpression & Record<string, unknown> {
	return {
		id: seed.id,
		term: seed.term,
		lookupTerm: normalizeLookupTerm(seed.lookupTerm ?? seed.term),
		regexPattern: pattern,
		isCaseInsensitive: seed.isCaseInsensitive ?? false,
		conceptId: seed.conceptId,
		canonicalValue: seed.canonicalValue,
		priorityWeight: seed.priorityWeight ?? 0,
		active: seed.active !== false,
		context: { ...(seed.metadata ?? {}), macroExtensionId: owner },
	};
}

function sameExpression(
	existing: CustomExpression,
	expected: CustomExpression & Record<string, unknown>,
): boolean {
	const left = existing as CustomExpression & Record<string, unknown>;
	const normalizeContext = (context: unknown): unknown => {
		if (!context || typeof context !== "object") return context;
		const copy = { ...(context as Record<string, unknown>) };
		delete copy.scope_level;
		delete copy.scope_id;
		return copy;
	};
	return sameRecord(
		{ ...left, context: normalizeContext(left.context) },
		{ ...expected, context: normalizeContext(expected.context) },
	);
}

async function findRelation(
	store: ConceptStore,
	id: string,
	conceptId: string,
): Promise<ConceptRelation | undefined> {
	if (!store.getRelations) return undefined;
	return (await store.getRelations(conceptId, "both")).find(
		(relation) => relation.id === id,
	);
}

async function closeStore(store: unknown): Promise<void> {
	const candidate = store as { close?: () => Promise<void> | void };
	await candidate.close?.();
}
