import type {
	Concept,
	ConceptFilter,
	CustomExpression,
} from "../../../middleware/dictionary/types";

export interface DictionaryHydrationContext {
	tenantId?: string;
	userId?: string;
	workspaceId?: string;
	sessionId?: string;
	allowStale?: boolean;
	requireFresh?: boolean;
	now?: string;
}

export interface DictionaryIdentityPolicy {
	mode: "preserve_source_key" | "source_scoped_key" | "mapped_local_key";
	sourceId: string;
	tenantId?: string;
	rejectCollisions?: boolean;
}

export interface DictionaryStoredRecord<T> {
	value: T;
	sourceId: string;
	authority: "authoritative" | "derived" | "user" | "backup";
	sourceRevision?: string;
	fetchedAt?: string;
	freshnessDeadline?: string;
	tenantId?: string;
	deletedAt?: string;
	tombstone?: boolean;
}

export interface DictionaryHydrationResult<T> {
	records: T[];
	missingIds: string[];
	staleIds: string[];
	sources: string[];
	cachedIds: string[];
	freshness?: "fresh" | "stale" | "unknown";
	degraded?: boolean;
	cacheWriteSkipped?: boolean;
	identityConflicts?: string[];
}

export interface DictionarySourceReader<T> {
	sourceId: string;
	authority: DictionaryStoredRecord<T>["authority"];
	getByIds(
		ids: string[],
		context: DictionaryHydrationContext,
	): Promise<DictionaryStoredRecord<T>[]>;
}

export interface DictionaryProjectionWriter<T> {
	sourceId: string;
	write(
		records: DictionaryStoredRecord<T>[],
		context: DictionaryHydrationContext,
	): Promise<{
		writtenIds: string[];
		skippedIds: string[];
	}>;
}

export interface DictionaryMaterializationBatch {
	concepts: DictionaryStoredRecord<Concept>[];
	expressions?: DictionaryStoredRecord<CustomExpression>[];
	filters?: DictionaryStoredRecord<ConceptFilter>[];
}

export interface DictionaryMaterializationWriters {
	concepts: DictionaryProjectionWriter<Concept>;
	expressions?: DictionaryProjectionWriter<CustomExpression>;
	filters?: DictionaryProjectionWriter<ConceptFilter>;
}

export interface DictionaryMaterializationResult {
	writtenConceptIds: string[];
	writtenExpressionIds: string[];
	writtenFilterIds: string[];
	unresolvedExpressionIds: string[];
	unresolvedFilterIds: string[];
	skipped: boolean;
}

/** Writes a complete dictionary projection in dependency order. */
export async function materializeDictionaryBatch(
	batch: DictionaryMaterializationBatch,
	writers: DictionaryMaterializationWriters,
	context: DictionaryHydrationContext = {},
): Promise<DictionaryMaterializationResult> {
	const conceptIds = new Set(batch.concepts.map((record) => record.value.id));
	const concepts = await writers.concepts.write(batch.concepts, context);
	const expressions = (batch.expressions ?? []).filter((record) => {
		const conceptId = record.value.conceptId;
		return !conceptId || conceptIds.has(conceptId);
	});
	const filters = (batch.filters ?? []).filter((record) =>
		conceptIds.has(record.value.conceptId),
	);
	const unresolvedExpressionIds = (batch.expressions ?? [])
		.filter(
			(record) =>
				record.value.conceptId && !conceptIds.has(record.value.conceptId),
		)
		.map((record) => record.value.id);
	const unresolvedFilterIds = (batch.filters ?? [])
		.filter((record) => !conceptIds.has(record.value.conceptId))
		.map((record) => record.value.filterId);
	if (expressions.length > 0 && !writers.expressions)
		throw new Error(
			"Dictionary materialization requires an expression writer.",
		);
	if (filters.length > 0 && !writers.filters)
		throw new Error("Dictionary materialization requires a filter writer.");
	const expressionResult =
		expressions.length > 0 && writers.expressions
			? await writers.expressions.write(expressions, context)
			: { writtenIds: [], skippedIds: [] };
	const filterResult =
		filters.length > 0 && writers.filters
			? await writers.filters.write(filters, context)
			: { writtenIds: [], skippedIds: [] };
	return {
		writtenConceptIds: concepts.writtenIds,
		writtenExpressionIds: expressionResult.writtenIds,
		writtenFilterIds: filterResult.writtenIds,
		unresolvedExpressionIds,
		unresolvedFilterIds,
		skipped:
			concepts.skippedIds.length > 0 ||
			expressionResult.skippedIds.length > 0 ||
			filterResult.skippedIds.length > 0,
	};
}

export interface DictionaryHydrationResolverOptions<T> {
	local?: DictionarySourceReader<T>;
	authoritative: DictionarySourceReader<T>;
	cache?: DictionaryProjectionWriter<T>;
	identityPolicy?: DictionaryIdentityPolicy;
}

export class DictionaryHydrationResolver<T extends { id: string }> {
	constructor(private options: DictionaryHydrationResolverOptions<T>) {}

	async hydrate(
		ids: string[],
		context: DictionaryHydrationContext = {},
	): Promise<DictionaryHydrationResult<T>> {
		const uniqueIds = [...new Set(ids)];
		const now = Date.parse(context.now ?? new Date().toISOString());
		const localRecords = (
			this.options.local
				? await this.options.local.getByIds(uniqueIds, context)
				: []
		).filter(
			(record) =>
				!context.tenantId ||
				!record.tenantId ||
				record.tenantId === context.tenantId,
		);
		const localById = new Map(
			localRecords.map((record) => [record.value.id, record]),
		);
		const identityConflicts = localRecords
			.filter((record) => this.identityConflict(record, context))
			.map((record) => record.value.id);
		const staleIds = localRecords
			.filter((record) => isStale(record, now))
			.map((record) => record.value.id);
		const fallbackIds = uniqueIds.filter((id) => {
			const local = localById.get(id);
			return (
				!local ||
				local.tombstone ||
				(staleIds.includes(id) && context.requireFresh)
			);
		});
		const acceptedLocal = localRecords
			.filter(
				(record) =>
					!identityConflicts.includes(record.value.id) &&
					!record.tombstone &&
					(context.allowStale ||
						!isStale(record, now) ||
						!context.requireFresh),
			)
			.map((record) => record.value);

		if (fallbackIds.length === 0) {
			return {
				records: acceptedLocal,
				missingIds: uniqueIds.filter((id) => !localById.has(id)),
				staleIds,
				sources: this.options.local ? [this.options.local.sourceId] : [],
				cachedIds: [],
				freshness: staleIds.length > 0 ? "stale" : "fresh",
				identityConflicts,
				degraded: identityConflicts.length > 0,
			};
		}

		const authoritativeRecords = (
			await this.options.authoritative.getByIds(fallbackIds, context)
		).filter(
			(record) =>
				(!context.tenantId ||
					!record.tenantId ||
					record.tenantId === context.tenantId) &&
				(!localById.has(record.value.id) ||
					!isOlder(record, localById.get(record.value.id)!)) &&
				!identityConflicts.includes(record.value.id),
		);
		const authoritativeById = new Map(
			authoritativeRecords.map((record) => [record.value.id, record]),
		);
		const records = [...acceptedLocal];
		for (const id of fallbackIds) {
			const record = authoritativeById.get(id);
			if (record && !record.tombstone && record.value)
				records.push(record.value);
		}
		const cacheRecords = authoritativeRecords.filter(
			(record) => !record.tombstone && record.value,
		);
		let cachedIds: string[] = [];
		let cacheWriteSkipped = false;
		if (cacheRecords.length > 0 && this.options.cache) {
			try {
				const result = await this.options.cache.write(cacheRecords, context);
				cachedIds = result.writtenIds;
				cacheWriteSkipped = result.skippedIds.length > 0;
			} catch {
				cacheWriteSkipped = true;
			}
		}
		const missingIds = fallbackIds.filter((id) => !authoritativeById.has(id));
		return {
			records,
			missingIds,
			staleIds,
			sources: [
				...new Set([
					...(this.options.local ? [this.options.local.sourceId] : []),
					this.options.authoritative.sourceId,
				]),
			],
			cachedIds,
			freshness:
				missingIds.length > 0 || staleIds.length > 0 ? "stale" : "fresh",
			degraded: cacheWriteSkipped || missingIds.length > 0,
			cacheWriteSkipped,
			identityConflicts,
		};
	}

	private identityConflict(
		record: DictionaryStoredRecord<T>,
		context: DictionaryHydrationContext,
	): boolean {
		const policy = this.options.identityPolicy;
		if (!policy || policy.mode !== "preserve_source_key") return false;
		if (
			context.tenantId &&
			record.tenantId &&
			record.tenantId !== context.tenantId
		)
			return true;
		return record.sourceId !== policy.sourceId;
	}
}

export class ConceptHydrationResolver extends DictionaryHydrationResolver<Concept> {}

function isStale<T>(record: DictionaryStoredRecord<T>, now: number): boolean {
	return (
		record.freshnessDeadline !== undefined &&
		Date.parse(record.freshnessDeadline) <= now
	);
}

function isOlder<T>(
	candidate: DictionaryStoredRecord<T>,
	current: DictionaryStoredRecord<T>,
): boolean {
	if (!candidate.sourceRevision || !current.sourceRevision) return false;
	const left = Number(candidate.sourceRevision);
	const right = Number(current.sourceRevision);
	if (Number.isFinite(left) && Number.isFinite(right)) return left < right;
	return candidate.sourceRevision < current.sourceRevision;
}
