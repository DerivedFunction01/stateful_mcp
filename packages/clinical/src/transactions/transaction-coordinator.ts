import type {
	AbortedTransaction,
	AggregateVersionReader,
	CommittedTransaction,
	MacroTransaction,
	PreparedTransaction,
	PrepareTransactionRequest,
	RecoveryQuery,
	RecoveryResult,
	SourceCellRevisionReader,
	TransactionJournal,
	TransactionParticipant,
	TransactionParticipantContext,
	TransactionParticipantState,
} from "./transaction-types";

export class TransactionConflictError extends Error {
	readonly code = "TRANSACTION_CONFLICT";
}

export class TransactionIdempotencyError extends Error {
	readonly code = "TRANSACTION_IDEMPOTENCY_CONFLICT";
}

export class InMemoryTransactionJournal implements TransactionJournal {
	private readonly transactions = new Map<string, MacroTransaction>();
	private readonly idempotency = new Map<string, string>();

	async get(transactionId: string): Promise<MacroTransaction | null> {
		return this.transactions.get(transactionId) ?? null;
	}

	async getByIdempotencyKey(
		idempotencyKey: string,
	): Promise<MacroTransaction | null> {
		const transactionId = this.idempotency.get(idempotencyKey);
		return transactionId ? this.get(transactionId) : null;
	}

	async put(transaction: MacroTransaction): Promise<void> {
		this.transactions.set(transaction.transactionId, transaction);
		this.idempotency.set(transaction.idempotencyKey, transaction.transactionId);
	}

	async list(query: RecoveryQuery = {}): Promise<MacroTransaction[]> {
		return [...this.transactions.values()].filter(
			(transaction) =>
				(!query.sourceCellId ||
					transaction.sourceCellId === query.sourceCellId) &&
				(!query.statuses || query.statuses.includes(transaction.status)),
		);
	}
}

export interface TransactionCoordinatorOptions {
	journal: TransactionJournal;
	readAggregateVersion?: AggregateVersionReader;
	readCellRevision?: SourceCellRevisionReader;
	createTransactionId?: () => string;
}

export class TransactionCoordinator {
	private readonly journal: TransactionJournal;
	private readonly readAggregateVersion?: AggregateVersionReader;
	private readonly readCellRevision?: SourceCellRevisionReader;
	private readonly createTransactionId: () => string;

	constructor(options: TransactionCoordinatorOptions) {
		this.journal = options.journal;
		this.readAggregateVersion = options.readAggregateVersion;
		this.readCellRevision = options.readCellRevision;
		this.createTransactionId =
			options.createTransactionId ?? (() => `tx_${crypto.randomUUID()}`);
	}

	async prepare(
		request: PrepareTransactionRequest,
	): Promise<PreparedTransaction> {
		const existing = await this.journal.getByIdempotencyKey(
			request.idempotencyKey,
		);
		if (existing) {
			if (
				existing.plan.fingerprint.value !== request.plan.fingerprint.value ||
				existing.sourceCellId !== request.sourceCellId
			) {
				throw new TransactionIdempotencyError(
					`Idempotency key '${request.idempotencyKey}' belongs to another plan`,
				);
			}
			return {
				transactionId: existing.transactionId,
				status: existing.status as PreparedTransaction["status"],
				planFingerprint: existing.plan.fingerprint.value,
			};
		}
		await this.assertExpectedVersions(request);
		const now = new Date().toISOString();
		const transaction: MacroTransaction = {
			transactionId: this.createTransactionId(),
			idempotencyKey: request.idempotencyKey,
			sourceCellId: request.sourceCellId,
			sourceCellRevision: request.sourceCellRevision,
			plan: request.plan,
			status: "prepared",
			participants: request.participants.map((participant) => ({
				participantId: participant.participantId,
				kind: participant.kind,
				status: "pending",
			})),
			recoveryAttempts: 0,
			createdAt: now,
			updatedAt: now,
		};
		await this.journal.put(transaction);
		return {
			transactionId: transaction.transactionId,
			status: transaction.status,
			planFingerprint: transaction.plan.fingerprint.value,
		};
	}

	async commit(
		transactionId: string,
		participants: readonly TransactionParticipant[],
	): Promise<CommittedTransaction> {
		const transaction = await this.requireTransaction(transactionId);
		if (transaction.status === "committed") return this.committed(transaction);
		if (transaction.status === "aborted")
			throw new TransactionConflictError(
				"Aborted transaction cannot be committed",
			);
		const context: TransactionParticipantContext = {
			transactionId,
			idempotencyKey: transaction.idempotencyKey,
			plan: transaction.plan,
		};
		try {
			transaction.status = "staging";
			await this.save(transaction);
			for (const participant of participants) {
				const state = this.stateFor(transaction, participant);
				if (state.status === "pending" && participant.stage) {
					await participant.stage(context);
					state.status = "staged";
					await this.save(transaction);
				}
			}
			for (const participant of participants.filter(
				(item) => item.appendEvents,
			)) {
				const state = this.stateFor(transaction, participant);
				if (
					state.status === "committed" ||
					state.status === "finalized" ||
					state.status === "projected"
				)
					continue;
				state.receipt = await participant.appendEvents!(context);
				state.status = "committed";
				await this.save(transaction);
			}
			transaction.status = "events_committed";
			await this.save(transaction);
			for (const participant of participants) {
				const state = this.stateFor(transaction, participant);
				if (state.status === "projected") continue;
				if (
					state.status === "committed" ||
					state.status === "staged" ||
					state.status === "pending"
				) {
					if (participant.finalize) await participant.finalize(context);
					state.status = "finalized";
					await this.save(transaction);
				}
				if (participant.project) {
					const projected = await participant.project(context);
					if (
						projected &&
						state.receipt &&
						projected.projectedHead !== state.receipt.commitId
					) {
						throw new TransactionConflictError(
							`Projected head '${projected.projectedHead}' does not match committed head '${state.receipt.commitId}' for participant '${participant.participantId}'`,
						);
					}
					state.projectionHead = projected?.projectedHead;
					state.status = "projected";
					await this.save(transaction);
				}
			}
			transaction.status = "committed";
			await this.save(transaction);
			return this.committed(transaction);
		} catch (error) {
			transaction.status = transaction.participants.some(
				(participant) =>
					participant.status === "committed" ||
					participant.status === "finalized" ||
					participant.status === "projected",
			)
				? "recovery_required"
				: "failed";
			transaction.error =
				error instanceof Error ? error.message : String(error);
			await this.save(transaction);
			throw error;
		}
	}

	async abort(
		transactionId: string,
		reason: string,
	): Promise<AbortedTransaction> {
		const transaction = await this.requireTransaction(transactionId);
		if (
			transaction.status === "events_committed" ||
			transaction.status === "recovery_required" ||
			transaction.status === "committed"
		) {
			throw new TransactionConflictError(
				"Committed events cannot be aborted; recover finalization instead",
			);
		}
		transaction.status = "aborted";
		transaction.error = reason;
		await this.save(transaction);
		return { transactionId, status: "aborted", reason };
	}

	async get(transactionId: string): Promise<MacroTransaction | null> {
		return this.journal.get(transactionId);
	}

	async recover(
		transactionId: string,
		participants: readonly TransactionParticipant[],
	): Promise<RecoveryResult> {
		const transaction = await this.requireTransaction(transactionId);
		transaction.recoveryAttempts += 1;
		await this.save(transaction);
		try {
			const committed = await this.commit(transactionId, participants);
			return { transactionId, status: committed.status };
		} catch (error) {
			const current = await this.requireTransaction(transactionId);
			return {
				transactionId,
				status: current.status,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async markProjectionFailure(
		transactionId: string,
		error: unknown,
	): Promise<void> {
		const transaction = await this.requireTransaction(transactionId);
		transaction.status = "recovery_required";
		transaction.error = error instanceof Error ? error.message : String(error);
		await this.save(transaction);
	}

	async listRecoverable(
		query: RecoveryQuery = {},
	): Promise<MacroTransaction[]> {
		return this.journal.list({
			...query,
			statuses: query.statuses ?? [
				"staging",
				"events_committed",
				"recovery_required",
				"failed",
			],
		});
	}

	private async assertExpectedVersions(
		request: PrepareTransactionRequest,
	): Promise<void> {
		if (this.readCellRevision) {
			const current = await this.readCellRevision(request.sourceCellId);
			if (current !== request.sourceCellRevision)
				throw new TransactionConflictError(
					`Source cell '${request.sourceCellId}' is stale`,
				);
		}
		if (!this.readAggregateVersion) return;
		for (const expectation of request.plan.expectedVersions) {
			const current = await this.readAggregateVersion(expectation);
			if (
				current.version !== expectation.expectedVersion ||
				(expectation.expectedHead && current.head !== expectation.expectedHead)
			) {
				throw new TransactionConflictError(
					`Aggregate '${expectation.aggregateId}' is stale`,
				);
			}
		}
	}

	private async requireTransaction(
		transactionId: string,
	): Promise<MacroTransaction> {
		const transaction = await this.journal.get(transactionId);
		if (!transaction)
			throw new TransactionConflictError(
				`Transaction '${transactionId}' was not found`,
			);
		return transaction;
	}

	private stateFor(
		transaction: MacroTransaction,
		participant: TransactionParticipant,
	): TransactionParticipantState {
		const state = transaction.participants.find(
			(item) => item.participantId === participant.participantId,
		);
		if (!state)
			throw new TransactionConflictError(
				`Participant '${participant.participantId}' was not prepared`,
			);
		return state;
	}

	private async save(transaction: MacroTransaction): Promise<void> {
		transaction.updatedAt = new Date().toISOString();
		await this.journal.put(transaction);
	}

	private committed(transaction: MacroTransaction): CommittedTransaction {
		return {
			transactionId: transaction.transactionId,
			status: "committed",
			participants: transaction.participants,
		};
	}
}
