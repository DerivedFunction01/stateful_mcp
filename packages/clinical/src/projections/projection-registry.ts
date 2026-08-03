import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { SyncConfig } from "../sync/sync-rule-config";
import type {
	TransactionParticipantKind,
	TransactionParticipantState,
} from "../transactions/transaction-types";

export interface ProjectionContext {
	transactionId: string;
	plan: MacroExecutionPlan;
	participantStates: readonly TransactionParticipantState[];
	syncConfig?: SyncConfig;
}

export interface ProjectionHandler {
	kind: TransactionParticipantKind;
	onCommitted(context: ProjectionContext): Promise<void>;
}

/**
 * Registry that maps transaction participant kinds to post-commit projection
 * handlers. After a transaction commits, the registry runs each handler whose
 * kind matches a committed participant.
 */
export class ProjectionRegistry {
	private readonly handlers = new Map<
		TransactionParticipantKind,
		ProjectionHandler
	>();

	register(handler: ProjectionHandler): void {
		if (this.handlers.has(handler.kind)) {
			throw new Error(
				`Projection handler for '${handler.kind}' is already registered`,
			);
		}
		this.handlers.set(handler.kind, handler);
	}

	get(kind: TransactionParticipantKind): ProjectionHandler | undefined {
		return this.handlers.get(kind);
	}

	/**
	 * Invoke all registered handlers whose participant kind participated in the
	 * transaction. Handlers are called in registration order.
	 */
	async onCommitted(context: ProjectionContext): Promise<void> {
		const committedKinds = new Set(
			context.participantStates.map((p) => p.kind),
		);
		for (const [kind, handler] of this.handlers) {
			if (committedKinds.has(kind)) {
				await handler.onCommitted(context);
			}
		}
	}
}
