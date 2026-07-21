import Ajv from "ajv";
import type {
	PersistentEventStore,
	SessionEventStore,
} from "../../adapters/storage/interfaces";
import { validateStateReferences } from "../../adapters/validation/references";
import { runValidationEngine } from "../../adapters/validation/runner";
import type { OwnerScope, ResourceLocator } from "../../config/types";
import { ErrorCode, StatefulFrameworkError } from "../../errors/types";
import { eventBroker } from "../../events/broker";
import type {
	EventCommit,
	EventMutation,
	EventRecord,
	MergeConflict,
	MergeSession,
} from "./types";

const ajv = new Ajv({ strict: false });

// REFERENCE: docs/event.md
export class EventStore {
	private filterStore?: any;
	private objectStore?: any;
	private formStore?: any;

	public setReferences(stores: { filter?: any; object?: any; form?: any }) {
		this.filterStore = stores.filter;
		this.objectStore = stores.object;
		this.formStore = stores.form;
	}

	// Key: mergeSessionId
	private mergeSessions = new Map<string, MergeSession>();

	constructor(
		private session: SessionEventStore,
		private persistent: PersistentEventStore,
		private schemas: Map<string, any>, // Key: schemaName -> JSON Schema
		private chainThreshold = 15,
		private validationEngines: Map<string, ResourceLocator> = new Map(),
		private workspaceRoot: string = process.cwd(),
	) {}

	/**
	 * Projects the full event array from commitId, then sends it to the
	 * schema's validation_engine (if configured) for external validation.
	 * Throws OBJECT_VALIDATION_FAILED if the external validator rejects.
	 */
	private async runEventValidation(
		commitId: string,
		sessionId: string,
		schemaName: string,
	): Promise<void> {
		const extLocator = this.validationEngines.get(schemaName);
		if (!extLocator) return;
		const events = await this.project(commitId, sessionId);
		const result = await runValidationEngine(
			extLocator,
			{ serviceType: "event", schemaName, data: events },
			this.workspaceRoot,
		);
		if (!result.valid) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_VALIDATION_FAILED,
				`Event validation rejected: ${(result.errors || ["unknown reason"]).join("; ")}`,
			);
		}
	}

	private async resolveId(
		idOrAlias: string,
		sessionId: string,
	): Promise<string> {
		const resolved = await this.session.getAlias(sessionId, idOrAlias);
		return resolved || idOrAlias;
	}

	async getCommit(
		commitId: string,
		sessionId: string,
	): Promise<EventCommit | null> {
		const resolvedId = await this.resolveId(commitId, sessionId);
		return this.session.get(sessionId, resolvedId);
	}

	async init(
		schemaName: string,
		sessionId: string,
		alias?: string,
		initialEvents?: Omit<EventRecord, "event_id">[],
	): Promise<string> {
		const schema = this.schemas.get(schemaName);
		if (!schema) {
			throw new StatefulFrameworkError(
				ErrorCode.SCHEMA_LOAD_FAILED,
				`Schema "${schemaName}" not registered`,
			);
		}

		const mutations: EventMutation[] = [];
		if (initialEvents && initialEvents.length > 0) {
			const validate = ajv.compile(schema);
			for (const ev of initialEvents) {
				if (!validate(ev)) {
					throw new StatefulFrameworkError(
						ErrorCode.OBJECT_VALIDATION_FAILED,
						`Initial event data fails schema validation`,
					);
				}
				try {
					await validateStateReferences(schema, ev, sessionId, {
						filter: this.filterStore,
						object: this.objectStore,
						form: this.formStore,
					});
				} catch (err: any) {
					throw new StatefulFrameworkError(
						ErrorCode.OBJECT_VALIDATION_FAILED,
						`Event references validation failed: ${err.message || err}`,
					);
				}
				mutations.push({
					type: "add",
					event_id: `ev_${Math.random().toString(36).slice(2, 10)}`,
					data: ev,
				});
			}
		}

		const state: Omit<EventCommit, "commitId"> = {
			sessionId,
			parentCommitId: null,
			createdAt: new Date().toISOString(),
			operation: "add",
			mutations,
			linearDepth: 1,
			gcLock: false,
		};

		const commitId = await this.session.create(sessionId, state, alias);
		const finalId = alias || commitId;

		eventBroker.emitStateChange({
			service: "event",
			action: "init",
			sessionId,
			id: finalId,
			data: { schemaName, initialEvents },
			timestamp: Date.now(),
		});

		return finalId;
	}

	async append(
		sessionId: string,
		idOrAlias: string,
		data: Record<string, any>,
		alias?: string,
	): Promise<string> {
		const resolvedId = await this.resolveId(idOrAlias, sessionId);
		const parent = await this.session.get(sessionId, resolvedId);
		if (!parent) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_NOT_FOUND,
				`Parent commit "${idOrAlias}" not found`,
			);
		}

		// Get the schema name by tracing parents
		const schemaName = await this.getSchemaName(resolvedId, sessionId);
		const schema = this.schemas.get(schemaName);
		if (schema) {
			const validate = ajv.compile(schema);
			if (!validate(data)) {
				throw new StatefulFrameworkError(
					ErrorCode.OBJECT_VALIDATION_FAILED,
					`Event data fails schema validation`,
				);
			}
			try {
				await validateStateReferences(schema, data, sessionId, {
					filter: this.filterStore,
					object: this.objectStore,
					form: this.formStore,
				});
			} catch (err: any) {
				throw new StatefulFrameworkError(
					ErrorCode.OBJECT_VALIDATION_FAILED,
					`Event references validation failed: ${err.message || err}`,
				);
			}
		}

		const event_id = `ev_${Math.random().toString(36).slice(2, 10)}`;
		const mutations: EventMutation[] = [
			{
				type: "add",
				event_id,
				data,
			},
		];

		const linearDepth = (parent.linearDepth || 1) + 1;
		const commitState: Omit<EventCommit, "commitId"> = {
			sessionId,
			parentCommitId: resolvedId,
			createdAt: new Date().toISOString(),
			operation: "add",
			mutations,
			linearDepth,
			gcLock: false,
		};

		const isAliasInput =
			(await this.session.getAlias(sessionId, idOrAlias)) !== null;
		const targetAlias = alias || (isAliasInput ? idOrAlias : undefined);

		const newId = await this.session.create(
			sessionId,
			commitState,
			targetAlias,
		);

		// Run external validation engine on projected array after commit
		await this.runEventValidation(newId, sessionId, schemaName);

		const resultId =
			linearDepth > this.chainThreshold
				? await this.compressSuffix(newId, sessionId)
				: newId;

		if (linearDepth > this.chainThreshold && targetAlias) {
			await this.session.setAlias(sessionId, targetAlias, resultId);
		}

		const finalId = targetAlias || resultId;

		eventBroker.emitStateChange({
			service: "event",
			action: "append",
			sessionId,
			id: finalId,
			data: { parentCommitId: resolvedId, data },
			timestamp: Date.now(),
		});

		return finalId;
	}

	async patch(
		sessionId: string,
		idOrAlias: string,
		eventId: string,
		patchData: Record<string, any>,
		alias?: string,
	): Promise<string> {
		const resolvedId = await this.resolveId(idOrAlias, sessionId);
		const parent = await this.session.get(sessionId, resolvedId);
		if (!parent) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_NOT_FOUND,
				`Parent commit "${idOrAlias}" not found`,
			);
		}

		const currentArray = await this.project(resolvedId, sessionId);
		const targetEvent = currentArray.find((e) => e.event_id === eventId);
		if (!targetEvent) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_NOT_FOUND,
				`Event "${eventId}" not found in current log state`,
			);
		}

		const updatedData: Record<string, any> = { ...targetEvent, ...patchData };
		delete updatedData.event_id;

		const schemaName = await this.getSchemaName(resolvedId, sessionId);
		const schema = this.schemas.get(schemaName);
		if (schema) {
			const validate = ajv.compile(schema);
			if (!validate(updatedData)) {
				throw new StatefulFrameworkError(
					ErrorCode.OBJECT_VALIDATION_FAILED,
					`Patched event data fails schema validation`,
				);
			}
		}

		// Extract before_data and mutation_parent_ids
		const beforeData: Record<string, any> = {};
		for (const key of Object.keys(patchData)) {
			beforeData[key] = targetEvent[key];
		}

		const mutationParentCommitId = await this.findLastMutationCommitId(
			resolvedId,
			eventId,
			sessionId,
		);

		const mutations: EventMutation[] = [
			{
				type: "update",
				event_id: eventId,
				mutation_parent_ids: mutationParentCommitId
					? [mutationParentCommitId]
					: [],
				data: patchData,
				before_data: beforeData,
			},
		];

		const linearDepth = (parent.linearDepth || 1) + 1;
		const commitState: Omit<EventCommit, "commitId"> = {
			sessionId,
			parentCommitId: resolvedId,
			createdAt: new Date().toISOString(),
			operation: "update",
			mutations,
			linearDepth,
			gcLock: false,
		};

		const isAliasInput =
			(await this.session.getAlias(sessionId, idOrAlias)) !== null;
		const targetAlias = alias || (isAliasInput ? idOrAlias : undefined);

		const newId = await this.session.create(
			sessionId,
			commitState,
			targetAlias,
		);

		// Run external validation engine on projected array after patch commit
		const schemaNameForPatch = await this.getSchemaName(newId, sessionId);
		await this.runEventValidation(newId, sessionId, schemaNameForPatch);

		if (linearDepth > this.chainThreshold) {
			const compressedId = await this.compressSuffix(newId, sessionId);
			if (targetAlias) {
				await this.session.setAlias(sessionId, targetAlias, compressedId);
				return targetAlias;
			}
			return compressedId;
		}

		return targetAlias || newId;
	}

	async delete(
		sessionId: string,
		idOrAlias: string,
		eventId: string,
		alias?: string,
	): Promise<string> {
		const resolvedId = await this.resolveId(idOrAlias, sessionId);
		const parent = await this.session.get(sessionId, resolvedId);
		if (!parent) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_NOT_FOUND,
				`Parent commit "${idOrAlias}" not found`,
			);
		}

		const currentArray = await this.project(resolvedId, sessionId);
		const targetEvent = currentArray.find((e) => e.event_id === eventId);
		if (!targetEvent) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_NOT_FOUND,
				`Event "${eventId}" not found in current log state`,
			);
		}

		const mutationParentCommitId2 = await this.findLastMutationCommitId(
			resolvedId,
			eventId,
			sessionId,
		);

		const deleteMutations: EventMutation[] = [
			{
				type: "remove",
				event_id: eventId,
				mutation_parent_ids: mutationParentCommitId2
					? [mutationParentCommitId2]
					: [],
			},
		];

		const deleteLinearDepth = (parent.linearDepth || 1) + 1;
		const deleteCommitState: Omit<EventCommit, "commitId"> = {
			sessionId,
			parentCommitId: resolvedId,
			createdAt: new Date().toISOString(),
			operation: "remove",
			mutations: deleteMutations,
			linearDepth: deleteLinearDepth,
			gcLock: false,
		};

		const deleteIsAliasInput =
			(await this.session.getAlias(sessionId, idOrAlias)) !== null;
		const deleteTargetAlias =
			alias || (deleteIsAliasInput ? idOrAlias : undefined);

		const deleteNewId = await this.session.create(
			sessionId,
			deleteCommitState,
			deleteTargetAlias,
		);

		// Run external validation engine on projected array after delete commit
		const schemaNameForDelete = await this.getSchemaName(
			deleteNewId,
			sessionId,
		);
		await this.runEventValidation(deleteNewId, sessionId, schemaNameForDelete);

		if (deleteLinearDepth > this.chainThreshold) {
			const compressedId = await this.compressSuffix(deleteNewId, sessionId);
			if (deleteTargetAlias) {
				await this.session.setAlias(sessionId, deleteTargetAlias, compressedId);
				return deleteTargetAlias;
			}
			return compressedId;
		}

		return deleteTargetAlias || deleteNewId;
	}

	async project(commitId: string, sessionId: string): Promise<EventRecord[]> {
		const commits: EventCommit[] = [];
		let currentId: string | null = commitId;

		while (currentId) {
			const commit = await this.session.get(sessionId, currentId);
			if (!commit) break;
			commits.unshift(commit); // Process from oldest to newest
			currentId = commit.parentCommitId;
		}

		const array: EventRecord[] = [];
		for (const commit of commits) {
			for (const mut of commit.mutations) {
				if (mut.type === "add") {
					array.push({
						event_id: mut.event_id,
						...(mut.data || {}),
					} as EventRecord);
				} else if (mut.type === "update") {
					const index = array.findIndex((e) => e.event_id === mut.event_id);
					if (index !== -1) {
						array[index] = {
							...array[index],
							...(mut.data || {}),
						} as EventRecord;
					}
				} else if (mut.type === "remove") {
					const index = array.findIndex((e) => e.event_id === mut.event_id);
					if (index !== -1) {
						array.splice(index, 1);
					}
				}
			}
		}
		return array;
	}

	private async getSchemaName(
		commitId: string,
		sessionId: string,
	): Promise<string> {
		// Walk back to the root add commit to check if a schema config mapping exists.
		// For simplicity, we can also look up the schema names in the Map.
		// Let's assume schemas Map keys represent schemas, and the first registered schema name is default,
		// or we store the schemaName directly. Since persistent state has schema_name, let's trace to root.
		let currentId: string | null = commitId;
		while (currentId) {
			const commit = await this.session.get(sessionId, currentId);
			if (!commit) break;
			if (!commit.parentCommitId) {
				// Root commit. We can scan schemas for a matching one, or assume the type.
				// Let's return the first registered schema name as fallback.
				return Array.from(this.schemas.keys())[0] || "";
			}
			currentId = commit.parentCommitId;
		}
		return Array.from(this.schemas.keys())[0] || "";
	}

	private async findLastMutationCommitId(
		startCommitId: string,
		eventId: string,
		sessionId: string,
	): Promise<string | null> {
		let currentId: string | null = startCommitId;
		while (currentId) {
			const commit = await this.session.get(sessionId, currentId);
			if (!commit) break;
			const mut = commit.mutations.find((m) => m.event_id === eventId);
			if (mut) {
				return commit.commitId;
			}
			currentId = commit.parentCommitId;
		}
		return null;
	}

	async findLCA(commitIds: string[], sessionId: string): Promise<string> {
		if (commitIds.length === 0) {
			throw new StatefulFrameworkError(
				ErrorCode.INTERNAL_ERROR,
				"No commit IDs specified for LCA",
			);
		}

		// Get ancestor paths for each commit ID
		const paths: string[][] = [];
		for (const id of commitIds) {
			const path: string[] = [];
			let currentId: string | null = id;
			while (currentId) {
				path.push(currentId);
				const commit = await this.session.get(sessionId, currentId);
				currentId = commit ? commit.parentCommitId : null;
			}
			paths.push(path.reverse()); // root first
		}

		if (paths.length === 0 || !paths[0] || paths[0].length === 0) {
			throw new StatefulFrameworkError(
				ErrorCode.INTERNAL_ERROR,
				"Invalid paths in LCA calculation",
			);
		}
		let lca = paths[0][0];
		const minLength = Math.min(...paths.map((p) => p.length));

		for (let i = 0; i < minLength; i++) {
			const candidate = paths[0][i];
			const match = paths.every((p) => p[i] === candidate);
			if (match) {
				lca = candidate;
			} else {
				break;
			}
		}
		return lca || "";
	}

	async merge(
		sessionId: string,
		sourceIdsOrAliases: string[],
		targetIdOrAlias: string,
	): Promise<{
		status: "clean" | "conflict";
		commit_id?: string;
		merge_session_id?: string;
		conflicts?: MergeConflict[];
	}> {
		const resolvedTarget = await this.resolveId(targetIdOrAlias, sessionId);
		const resolvedSources = await Promise.all(
			sourceIdsOrAliases.map((s) => this.resolveId(s, sessionId)),
		);

		const allTips = [resolvedTarget, ...resolvedSources];
		const lca = await this.findLCA(allTips, sessionId);

		// Project state at LCA
		const stateLca = await this.project(lca, sessionId);
		const lcaEventsMap = new Map<string, EventRecord>(
			stateLca.map((e) => [e.event_id, e]),
		);

		// Track mutations on each branch since LCA
		// We map branchId -> Map<eventId, mutation>
		const branchMutations = new Map<string, Map<string, EventMutation>>();

		for (const tip of allTips) {
			const mutMap = new Map<string, EventMutation>();
			let currentId: string | null = tip;
			while (currentId && currentId !== lca) {
				const commit = await this.session.get(sessionId, currentId);
				if (!commit) break;
				for (const mut of commit.mutations) {
					// Keep the first mutation we encounter (which is the latest since we traverse backwards)
					if (!mutMap.has(mut.event_id)) {
						mutMap.set(mut.event_id, mut);
					}
				}
				currentId = commit.parentCommitId;
			}
			branchMutations.set(tip, mutMap);
		}

		// Conflict detection
		// A conflict exists if an event_id was mutated (updated or removed) by MORE THAN ONE branch since LCA.
		const mutatedEventIds = new Set<string>();
		const multiMutatedEventIds = new Set<string>();

		for (const [_, mutMap] of branchMutations.entries()) {
			for (const [eventId, mut] of mutMap.entries()) {
				if (mut.type === "update" || mut.type === "remove") {
					if (mutatedEventIds.has(eventId)) {
						multiMutatedEventIds.add(eventId);
					} else {
						mutatedEventIds.add(eventId);
					}
				}
			}
		}

		if (multiMutatedEventIds.size > 0) {
			// Conflicts found! Start stateful resolution session
			const conflicts: MergeConflict[] = [];
			for (const eventId of multiMutatedEventIds) {
				const sourceValues: Record<string, any> = {};
				for (const sourceTip of resolvedSources) {
					const mut = branchMutations.get(sourceTip)?.get(eventId);
					if (mut) {
						sourceValues[sourceTip] = mut.type === "remove" ? null : mut.data;
					}
				}
				const targetMut = branchMutations.get(resolvedTarget)?.get(eventId);
				const targetValue = targetMut
					? targetMut.type === "remove"
						? null
						: targetMut.data
					: lcaEventsMap.get(eventId);

				conflicts.push({
					event_id: eventId,
					source_values: sourceValues,
					target_value: targetValue,
					status: "pending",
				});
			}

			const mergeSessionId = `merge_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
			const mergeSession: MergeSession = {
				mergeSessionId,
				parentMergeSessionId: null,
				sourceCommitIds: resolvedSources,
				targetCommitId: resolvedTarget,
				conflicts,
			};

			this.mergeSessions.set(mergeSessionId, mergeSession);
			return {
				status: "conflict",
				merge_session_id: mergeSessionId,
				conflicts,
			};
		}

		// Clean merge! Apply all mutations
		const cleanMutations: EventMutation[] = [];
		for (const [_, mutMap] of branchMutations.entries()) {
			for (const mut of mutMap.values()) {
				cleanMutations.push(mut);
			}
		}

		const parentCommit = await this.session.get(sessionId, resolvedTarget);
		const linearDepth = (parentCommit?.linearDepth || 1) + 1;

		const commitState: Omit<EventCommit, "commitId"> = {
			sessionId,
			parentCommitId: resolvedTarget,
			createdAt: new Date().toISOString(),
			operation: "merge",
			mutations: cleanMutations,
			mergeSourceCommitIds: resolvedSources,
			mergeAcceptedIds: [],
			mergeRejectedIds: [],
			linearDepth,
			gcLock: false,
		};

		const isAliasInput =
			(await this.session.getAlias(sessionId, targetIdOrAlias)) !== null;
		const targetAlias = isAliasInput ? targetIdOrAlias : undefined;

		const newId = await this.session.create(
			sessionId,
			commitState,
			targetAlias,
		);
		return { status: "clean", commit_id: newId };
	}

	async mergeInspect(mergeSessionId: string): Promise<MergeSession> {
		const session = this.mergeSessions.get(mergeSessionId);
		if (!session) {
			throw new StatefulFrameworkError(
				ErrorCode.INTERNAL_ERROR,
				`Merge session "${mergeSessionId}" not found`,
			);
		}
		return session;
	}

	async mergeResolve(
		mergeSessionId: string,
		eventId: string,
		resolution: any,
	): Promise<string> {
		const parentSession = this.mergeSessions.get(mergeSessionId);
		if (!parentSession) {
			throw new StatefulFrameworkError(
				ErrorCode.INTERNAL_ERROR,
				`Merge session "${mergeSessionId}" not found`,
			);
		}

		const updatedConflicts = parentSession.conflicts.map((c) => {
			if (c.event_id === eventId) {
				return {
					...c,
					status: "resolved" as const,
					resolution,
				};
			}
			return c;
		});

		const newSessionId = `merge_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const newSession: MergeSession = {
			...parentSession,
			mergeSessionId: newSessionId,
			parentMergeSessionId: mergeSessionId,
			conflicts: updatedConflicts,
		};

		this.mergeSessions.set(newSessionId, newSession);
		return newSessionId;
	}

	async mergeCommit(
		mergeSessionId: string,
		sessionId: string,
	): Promise<string> {
		const session = this.mergeSessions.get(mergeSessionId);
		if (!session) {
			throw new StatefulFrameworkError(
				ErrorCode.INTERNAL_ERROR,
				`Merge session "${mergeSessionId}" not found`,
			);
		}

		const unresolved = session.conflicts.filter((c) => c.status === "pending");
		if (unresolved.length > 0) {
			throw new StatefulFrameworkError(
				ErrorCode.INTERNAL_ERROR,
				`Cannot commit merge session: ${unresolved.length} unresolved conflicts remain`,
			);
		}

		// Combine all non-conflicting mutations first
		const lca = await this.findLCA(
			[session.targetCommitId, ...session.sourceCommitIds],
			sessionId,
		);
		const allTips = [session.targetCommitId, ...session.sourceCommitIds];

		const branchMutations = new Map<string, Map<string, EventMutation>>();
		const acceptedIds: string[] = [];
		const rejectedIds: string[] = [];

		for (const tip of allTips) {
			const mutMap = new Map<string, EventMutation>();
			let currentId: string | null = tip;
			while (currentId && currentId !== lca) {
				const commit = await this.session.get(sessionId, currentId);
				if (!commit) break;
				for (const mut of commit.mutations) {
					if (!mutMap.has(mut.event_id)) {
						mutMap.set(mut.event_id, mut);
					}
				}
				currentId = commit.parentCommitId;
			}
			branchMutations.set(tip, mutMap);
		}

		const resolvedMutations: EventMutation[] = [];
		const processedConflicting = new Set<string>();

		for (const conflict of session.conflicts) {
			processedConflicting.add(conflict.event_id);
			const res = conflict.resolution;
			if (!res) continue;

			if (res.strategy === "accept_source") {
				const resolvedSourceId = await this.resolveId(
					res.source_id!,
					sessionId,
				);
				const sourceVal = conflict.source_values[resolvedSourceId];
				if (sourceVal === null) {
					resolvedMutations.push({
						type: "remove",
						event_id: conflict.event_id,
					});
				} else {
					resolvedMutations.push({
						type: "update",
						event_id: conflict.event_id,
						data: sourceVal,
					});
				}
				acceptedIds.push(resolvedSourceId);
			} else if (res.strategy === "accept_target") {
				if (conflict.target_value === null) {
					resolvedMutations.push({
						type: "remove",
						event_id: conflict.event_id,
					});
				} else {
					resolvedMutations.push({
						type: "update",
						event_id: conflict.event_id,
						data: conflict.target_value,
					});
				}
				acceptedIds.push(session.targetCommitId);
			} else if (res.strategy === "patch") {
				resolvedMutations.push({
					type: "update",
					event_id: conflict.event_id,
					data: res.values,
				});
			}
		}

		// Apply all non-conflicting mutations
		for (const [tip, mutMap] of branchMutations.entries()) {
			for (const [eventId, mut] of mutMap.entries()) {
				if (!processedConflicting.has(eventId)) {
					resolvedMutations.push(mut);
				}
			}
		}

		const parentCommit = await this.session.get(
			sessionId,
			session.targetCommitId,
		);
		const linearDepth = (parentCommit?.linearDepth || 1) + 1;

		const commitState: Omit<EventCommit, "commitId"> = {
			sessionId,
			parentCommitId: session.targetCommitId,
			createdAt: new Date().toISOString(),
			operation: "merge",
			mutations: resolvedMutations,
			mergeSourceCommitIds: session.sourceCommitIds,
			mergeAcceptedIds: acceptedIds,
			mergeRejectedIds: rejectedIds,
			linearDepth,
			gcLock: false,
		};

		const isAliasInput =
			(await this.session.getAlias(sessionId, session.targetCommitId)) !== null;
		const targetAlias = isAliasInput ? session.targetCommitId : undefined;

		const newId = await this.session.create(
			sessionId,
			commitState,
			targetAlias,
		);

		// Run external validation engine on fully projected merged array
		const mergeSchemaName = await this.getSchemaName(newId, sessionId);
		await this.runEventValidation(newId, sessionId, mergeSchemaName);

		return targetAlias || newId;
	}

	private async compressSuffix(
		commitId: string,
		sessionId: string,
	): Promise<string> {
		const tipNode = await this.session.get(sessionId, commitId);
		if (!tipNode) return commitId;

		// Find the nearest branch point
		const { branchPointId, commitsToCompress } =
			await this.findNearestBranchPoint(commitId, sessionId);
		if (commitsToCompress.length <= 1) {
			return commitId;
		}

		// Project state at branch point and tip
		const stateLca = branchPointId
			? await this.project(branchPointId, sessionId)
			: [];
		const stateTip = await this.project(commitId, sessionId);

		// Diff states
		const lcaMap = new Map<string, EventRecord>(
			stateLca.map((e) => [e.event_id, e]),
		);
		const tipMap = new Map<string, EventRecord>(
			stateTip.map((e) => [e.event_id, e]),
		);

		const squashedMutations: EventMutation[] = [];

		// Appends and patches
		for (const [eventId, event] of tipMap.entries()) {
			const original = lcaMap.get(eventId);
			if (!original) {
				// Appended
				const data: Record<string, any> = { ...event };
				delete data.event_id;
				squashedMutations.push({ type: "add", event_id: eventId, data });
			} else {
				// Checked for differences
				const patch: Record<string, any> = {};
				let modified = false;
				for (const [key, val] of Object.entries(event)) {
					if (
						key !== "event_id" &&
						JSON.stringify(val) !== JSON.stringify(original[key])
					) {
						patch[key] = val;
						modified = true;
					}
				}
				if (modified) {
					squashedMutations.push({
						type: "update",
						event_id: eventId,
						data: patch,
					});
				}
			}
		}

		// Deletions
		for (const eventId of lcaMap.keys()) {
			if (!tipMap.has(eventId)) {
				squashedMutations.push({ type: "remove", event_id: eventId });
			}
		}

		const compressedCommit: Omit<EventCommit, "commitId"> = {
			sessionId,
			parentCommitId: branchPointId,
			createdAt: new Date().toISOString(),
			operation: "update",
			mutations: squashedMutations,
			linearDepth: 2, // Squashed to a depth of 2 (branchPoint -> squashedTip)
			gcLock: false,
		};

		const newCommitId = await this.session.create(sessionId, compressedCommit);

		// Log the auto-compression event
		console.error(
			JSON.stringify({
				event: "EVENT_AUTO_COMPRESSED",
				new_commit_id: newCommitId,
				source_tip_id: commitId,
				linear_depth_at_compression: tipNode.linearDepth,
				branch_point_id: branchPointId,
			}),
		);

		// Update parent pointers of children of the old tip
		const allSessionIds = await this.session.listSession(sessionId);
		for (const id of allSessionIds) {
			const node = await this.session.get(sessionId, id);
			if (node && node.parentCommitId === commitId) {
				node.parentCommitId = newCommitId;
				node.linearDepth = 3; // branchPoint -> squashedTip -> child
				await this.session.set(sessionId, id, node);
			}
		}

		// Suffix compression leaves old commits in place to be pruned passively by GC.

		return newCommitId;
	}

	private async findNearestBranchPoint(
		commitId: string,
		sessionId: string,
	): Promise<{
		branchPointId: string | null;
		commitsToCompress: EventCommit[];
	}> {
		const commitsToCompress: EventCommit[] = [];
		let currentId: string | null = commitId;

		while (currentId) {
			const node = await this.session.get(sessionId, currentId);
			if (!node) break;

			commitsToCompress.push(node);

			// Check if this node has siblings (indicating it's a branch point)
			if (node.parentCommitId) {
				const siblings = await this.session.listChildren(
					sessionId,
					node.parentCommitId,
				);
				if (siblings.length > 1) {
					return { branchPointId: node.parentCommitId, commitsToCompress };
				}
			} else {
				// Root reached
				return { branchPointId: null, commitsToCompress };
			}

			currentId = node.parentCommitId;
		}

		return { branchPointId: null, commitsToCompress };
	}

	async gc(
		sessionId: string,
		keepIds: string[],
		whitelistAliases: string[],
		blacklistAliases: string[] = [],
	): Promise<{ deleted_count: number; kept_count: number }> {
		const allSessionIds = await this.session.listSession(sessionId);
		const keptSet = new Set<string>();

		const aliases = await this.session.listAliases(sessionId);
		const keptAliases = aliases.filter((a) => {
			if (blacklistAliases.includes(a.alias)) return false;
			if (whitelistAliases.length > 0)
				return whitelistAliases.includes(a.alias);
			return true;
		});

		for (const a of keptAliases) {
			keptSet.add(a.targetId);
			await this.getAncestors(a.targetId, sessionId, keptSet);
		}

		for (const id of keepIds) {
			const resolved = await this.resolveId(id, sessionId);
			keptSet.add(resolved);
			await this.getAncestors(resolved, sessionId, keptSet);
		}

		// Delete blacklisted aliases
		for (const aliasName of blacklistAliases) {
			await this.session.deleteAlias(sessionId, aliasName);
		}

		let deletedCount = 0;
		let keptCount = 0;
		const deletedIds: string[] = [];
		const keptIdsList: string[] = [];

		for (const id of allSessionIds) {
			if (!keptSet.has(id)) {
				await this.session.delete(sessionId, id);
				deletedIds.push(id);
				deletedCount++;
			} else {
				keptIdsList.push(id);
				keptCount++;
			}
		}

		console.error(
			JSON.stringify({
				event: "EVENT_GC_RUN",
				sessionId,
				deletedIds,
				keptIds: keptIdsList,
				triggeredBy: "llm",
			}),
		);

		return { deleted_count: deletedCount, kept_count: keptCount };
	}

	async compress(commitId: string, sessionId: string): Promise<string> {
		const commit = await this.session.get(sessionId, commitId);
		if (!commit) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_NOT_FOUND,
				`Commit "${commitId}" not found`,
			);
		}
		const activeEvents = await this.project(commitId, sessionId);

		const mutations: EventMutation[] = activeEvents.map((ev) => {
			const { event_id, ...data } = ev;
			return {
				type: "add",
				event_id,
				data,
			};
		});

		const compressedCommit: Omit<EventCommit, "commitId"> & {
			commitId?: string;
		} = {
			sessionId,
			parentCommitId: null,
			createdAt: new Date().toISOString(),
			operation: "add",
			mutations,
			linearDepth: 1,
			gcLock: false,
		};

		const newCommitId = await this.session.create(sessionId, compressedCommit);
		return newCommitId;
	}

	async save(
		commitId: string,
		tags: string[],
		description: string,
		scope: OwnerScope,
		sessionId: string,
	): Promise<string> {
		let commit = await this.session.get(sessionId, commitId);
		if (!commit) {
			throw new StatefulFrameworkError(
				ErrorCode.OBJECT_NOT_FOUND,
				`Commit "${commitId}" not in session`,
			);
		}
		let targetId = commitId;
		if (commit.parentCommitId !== null) {
			targetId = await this.compress(commitId, sessionId);
			const compressed = await this.session.get(sessionId, targetId);
			if (!compressed) {
				throw new StatefulFrameworkError(
					ErrorCode.OBJECT_NOT_FOUND,
					"Compressed commit not found",
				);
			}
			commit = compressed;
		}

		const schemaName = await this.getSchemaName(targetId, sessionId);
		await this.persistent.set(
			targetId,
			{
				...commit,
				tags,
				description,
				schema_name: schemaName,
			},
			scope,
		);

		await this.lockAncestors(targetId, sessionId);

		return targetId;
	}

	private async lockAncestors(commitId: string, sessionId: string) {
		const ancestors = new Set<string>();
		await this.getAncestors(commitId, sessionId, ancestors);
		for (const id of ancestors) {
			const node = await this.session.get(sessionId, id);
			if (node && !node.gcLock) {
				node.gcLock = true;
				await this.session.set(sessionId, id, node);
			}
		}
	}

	private async getAncestors(
		id: string,
		sessionId: string,
		visited: Set<string>,
	): Promise<void> {
		const node = await this.session.get(sessionId, id);
		if (!node) return;
		if (node.parentCommitId && !visited.has(node.parentCommitId)) {
			visited.add(node.parentCommitId);
			await this.getAncestors(node.parentCommitId, sessionId, visited);
		}
		if (node.mergeSourceCommitIds) {
			for (const srcId of node.mergeSourceCommitIds) {
				if (!visited.has(srcId)) {
					visited.add(srcId);
					await this.getAncestors(srcId, sessionId, visited);
				}
			}
		}
	}

	public getSchema(schemaName: string): any {
		return this.schemas.get(schemaName) || null;
	}
}
