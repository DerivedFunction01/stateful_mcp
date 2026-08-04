import type { KvBackend } from "@stateful-mcp/core";
import {
	type CommandHistoryCandidate,
	type CommandHistoryEvent,
	type CommandHistoryQuery,
	type CommandHistoryStore,
	normalizeCommandText,
} from "./command-history";

const EVENT_PREFIX = "command-history:event:";
const CHECKPOINT_INTERVAL = 256;

export class KvCommandHistoryStore implements CommandHistoryStore {
	private data: Record<string, unknown> | null = null;
	private writeTail: Promise<void> = Promise.resolve();
	private writesSinceCheckpoint = 0;

	constructor(private readonly backend: KvBackend) {}

	private async ensureLoaded(): Promise<Record<string, unknown>> {
		if (this.data === null) this.data = await this.backend.load();
		return this.data;
	}

	private enqueueWrite(operation: () => Promise<void>): Promise<void> {
		const next = this.writeTail.then(operation, operation);
		this.writeTail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	async reload(): Promise<void> {
		this.data = await this.backend.load();
	}

	async recordSuccess(input: {
		sessionId: string;
		commandText: string;
		canonicalVerb?: string;
		commandId?: string;
		executedAt?: string;
	}): Promise<void> {
		await this.enqueueWrite(async () => {
			const data = await this.ensureLoaded();
			const executedAt = input.executedAt ?? new Date().toISOString();
			const normalized = normalizeCommandText(input.commandText);
			for (const [scope, scopeKey] of [
				["session", input.sessionId],
				["all", "all"],
			] as const) {
				const event: CommandHistoryEvent = {
					eventId: crypto.randomUUID(),
					scope,
					scopeKey,
					sessionId: input.sessionId,
					commandText: normalized,
					canonicalVerb: input.canonicalVerb,
					commandId: input.commandId,
					executedAt,
					outcome: "success",
				};
				const key = `${EVENT_PREFIX}${event.eventId}`;
				data[key] = event;
				await this.backend.set(key, event);
			}
			this.writesSinceCheckpoint += 2;
			if (this.writesSinceCheckpoint >= CHECKPOINT_INTERVAL) {
				await this.backend.save();
				this.writesSinceCheckpoint = 0;
			}
		});
	}

	async query(input: CommandHistoryQuery): Promise<CommandHistoryCandidate[]> {
		const data = await this.ensureLoaded();
		const scope = input.scope ?? "merged";
		const prefix = normalizeCommandText(input.prefix ?? "");
		const candidates = new Map<string, CommandHistoryCandidate>();
		for (const value of Object.values(data)) {
			const event = value as CommandHistoryEvent;
			if (!event || event.outcome !== "success") continue;
			if (event.scope === "session" && event.scopeKey !== input.sessionId)
				continue;
			if (scope !== "merged" && event.scope !== scope) continue;
			if (prefix && !event.commandText.startsWith(prefix)) continue;
			const current = candidates.get(event.commandText) ?? {
				commandText: event.commandText,
				canonicalVerb: event.canonicalVerb,
				commandId: event.commandId,
				sessionCount: 0,
				allCount: 0,
			};
			if (event.scope === "session") {
				current.sessionCount += 1;
				if (!current.sessionLastUsedAt || event.executedAt > current.sessionLastUsedAt)
					current.sessionLastUsedAt = event.executedAt;
			} else {
				current.allCount += 1;
				if (!current.allLastUsedAt || event.executedAt > current.allLastUsedAt)
					current.allLastUsedAt = event.executedAt;
			}
			candidates.set(event.commandText, current);
		}
		return [...candidates.values()]
			.sort((a, b) =>
				(b.sessionCount + b.allCount) - (a.sessionCount + a.allCount) ||
				Math.max(
					Date.parse(b.sessionLastUsedAt ?? b.allLastUsedAt ?? ""),
					Date.parse(b.allLastUsedAt ?? ""),
				) -
				Math.max(
					Date.parse(a.sessionLastUsedAt ?? a.allLastUsedAt ?? ""),
					Date.parse(a.allLastUsedAt ?? ""),
				),
			)
			.slice(0, input.limit ?? 50);
	}
}
