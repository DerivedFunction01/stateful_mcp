import type {
	HistoryEvent,
	HistoryReadOptions,
	HistoryStore,
} from "@stateful-mcp/core";
import type { MacroDraftSnapshot } from "../contracts/draft";
import type {
	AcceptedMacroLock,
	MacroDraftDiagnostic,
} from "../contracts/slots";
import { MacroListenerRegistry } from "../listeners/listener-registry";
import {
	MacroRendererRegistry,
	rendererOutputFingerprint,
} from "../rendering/contracts";
import type {
	MacroExecutionAttempt,
	MacroExecutionInput,
	MacroExecutionResult,
	MacroExecutor,
	MacroHistoryReadResult,
} from "./contracts";

export interface MacroHistoryStoreOptions {
	streamId?: string;
	executor?: MacroExecutor;
	listeners?: MacroListenerRegistry;
	renderers?: MacroRendererRegistry;
}

export class MacroExecutionHistory {
	readonly streamId: string;
	readonly listeners: MacroListenerRegistry;
	readonly renderers: MacroRendererRegistry;
	private readonly executor: MacroExecutor;

	constructor(
		readonly history: HistoryStore<MacroExecutionAttempt>,
		options: MacroHistoryStoreOptions = {},
	) {
		this.streamId = options.streamId ?? "macro-executions";
		this.listeners = options.listeners ?? new MacroListenerRegistry();
		this.renderers = options.renderers ?? new MacroRendererRegistry();
		this.executor = options.executor ?? defaultMacroExecutor;
	}

	preview(session: { snapshot(): MacroDraftSnapshot }): MacroDraftSnapshot {
		return session.snapshot();
	}

	async execute(input: MacroExecutionInput): Promise<MacroExecutionResult> {
		const existing = await this.history.read(this.streamId);
		const prior = existing.events.find(
			(item) => item.eventId === input.attemptId,
		);
		if (prior)
			return this.dispatchStored(prior, existing.events, existing.diagnostics);

		const before = input.session.snapshot();
		const payload = input.session.commit();
		const after = input.session.snapshot();
		const macroId = input.macroId ?? payload.macro.id;
		const base: MacroExecutionAttempt = {
			attemptId: input.attemptId,
			macroId,
			macroVersion: input.macroVersion ?? after.locks[0]?.macroVersion ?? 1,
			authoredText: input.authoredText ?? before.text,
			outcome: "rejected",
			attemptedAt: input.attemptedAt ?? new Date().toISOString(),
			revision: before.revision,
			payload,
			diagnostics: [
				...after.diagnostics,
				...payload.diagnostics.map(toDraftDiagnostic),
			],
			locks: [...after.locks] as AcceptedMacroLock[],
			metadata: input.metadata,
		};
		const outcome =
			payload.status === "invalid"
				? { outcome: "rejected" as const }
				: await this.executeSafely(base);
		const attempt: MacroExecutionAttempt = {
			...base,
			outcome: outcome.outcome,
			payload: outcome.payload ?? payload,
			diagnostics: [...base.diagnostics, ...(outcome.diagnostics ?? [])],
			metadata: { ...base.metadata, ...outcome.metadata },
		};
		const event = await this.history.append(this.streamId, {
			eventId: input.attemptId,
			streamId: this.streamId,
			eventType: "macro.execution",
			occurredAt: attempt.attemptedAt,
			payload: attempt,
		});
		const all = await this.history.read(this.streamId);
		return this.dispatchStored(event, all.events, [
			...all.diagnostics,
			...attempt.diagnostics,
		]);
	}

	async read(options?: HistoryReadOptions): Promise<MacroHistoryReadResult> {
		return this.history.read(this.streamId, options);
	}

	async list(options?: HistoryReadOptions): Promise<MacroHistoryReadResult> {
		return this.read(options);
	}

	async show(
		attemptId: string,
	): Promise<HistoryEvent<MacroExecutionAttempt> | undefined> {
		const result = await this.read();
		return result.events.find((event) => event.eventId === attemptId);
	}

	private async executeSafely(input: MacroExecutionAttempt) {
		try {
			return await this.executor.execute(input);
		} catch (error) {
			return {
				outcome: "rejected" as const,
				diagnostics: [
					{
						code: "EXECUTOR_FAILED",
						messageKey: "errors.executorFailed",
						messageParams: {
							detail: error instanceof Error ? error.message : String(error),
						},
					},
				],
			};
		}
	}

	private async dispatchStored(
		event: HistoryEvent<MacroExecutionAttempt>,
		history: readonly HistoryEvent<MacroExecutionAttempt>[],
		recoveryDiagnostics: readonly {
			code: string;
			messageKey?: string;
			messageParams?: Readonly<
				Record<string, import("@stateful-mcp/macro-protocol").MessageParam>
			>;
		}[],
	): Promise<MacroExecutionResult> {
		const attempts = history
			.filter((item) => item.sequence <= event.sequence)
			.sort((left, right) => left.sequence - right.sequence)
			.map((item) => item.payload);
		const listenerResult = await this.listeners.dispatch(event.payload, {
			mode: "execute",
			sequence: event.sequence,
			history: attempts,
		});
		const rendererResult = await this.renderers.render(event.payload, {
			mode: "execute",
			sequence: event.sequence,
			listenerOutputs: listenerResult.outputs,
		});
		return {
			event,
			attempt: event.payload,
			sequence: event.sequence,
			listenerOutputs: listenerResult.outputs,
			rendererOutputs: rendererResult.outputs,
			diagnostics: [
				...recoveryDiagnostics.map((item) => ({
					code: item.code,
					...(item.messageKey !== undefined
						? { messageKey: item.messageKey }
						: {}),
					...(item.messageParams !== undefined
						? { messageParams: item.messageParams }
						: {}),
				})),
				...listenerResult.diagnostics,
				...rendererResult.diagnostics,
			],
			fingerprint: rendererOutputFingerprint([
				...listenerResult.outputs,
				...rendererResult.outputs,
			]),
		};
	}
}

export { MacroExecutionHistory as MacroHistoryStore };

const defaultMacroExecutor: import("./contracts").MacroExecutor = {
	async execute(input) {
		return {
			outcome: input.payload?.status === "matched" ? "accepted" : "rejected",
		};
	},
};

function toDraftDiagnostic(diagnostic: {
	code: string;
	messageKey?: string;
	messageParams?: Readonly<
		Record<string, import("@stateful-mcp/macro-protocol").MessageParam>
	>;
	start?: number;
	end?: number;
	argumentId?: string;
	formId?: string;
}): MacroDraftDiagnostic {
	return {
		code: diagnostic.code,
		...(diagnostic.messageKey !== undefined
			? { messageKey: diagnostic.messageKey }
			: {}),
		...(diagnostic.messageParams !== undefined
			? { messageParams: diagnostic.messageParams }
			: {}),
		start: diagnostic.start,
		end: diagnostic.end,
		argumentId: diagnostic.argumentId,
		formId: diagnostic.formId,
	};
}
