import type { KvBackend } from "@stateful-mcp/core";
import {
	type ArgumentUsageRecord,
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
		args?: Array<{
			index: number;
			name?: string;
			value: string;
			normalizedValue?: string;
		}>;
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
					args: input.args,
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
				if (
					!current.sessionLastUsedAt ||
					event.executedAt > current.sessionLastUsedAt
				)
					current.sessionLastUsedAt = event.executedAt;
			} else {
				current.allCount += 1;
				if (!current.allLastUsedAt || event.executedAt > current.allLastUsedAt)
					current.allLastUsedAt = event.executedAt;
			}
			candidates.set(event.commandText, current);
		}
		return [...candidates.values()]
			.sort(
				(a, b) =>
					b.sessionCount + b.allCount - (a.sessionCount + a.allCount) ||
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

	async queryArgumentUsage(input: {
		sessionId: string;
		commandId: string;
		argumentIndex: number;
		priorArguments?: string[];
		prefix?: string;
		limit?: number;
	}): Promise<ArgumentUsageRecord[]> {
		const data = await this.ensureLoaded();
		const targetCmd = input.commandId.toLowerCase().replace(/^[:^]/, "");

		const usage = new Map<
			string,
			{
				sessionCount: number;
				allCount: number;
				sessionLastUsedAt?: string;
				allLastUsedAt?: string;
			}
		>();

		for (const value of Object.values(data)) {
			const event = value as CommandHistoryEvent;
			if (!event || event.outcome !== "success") continue;

			const evCmdId = (event.commandId ?? "")
				.toLowerCase()
				.replace(/^[:^]/, "");
			const evVerb = (event.canonicalVerb ?? "")
				.toLowerCase()
				.replace(/^[:^]/, "");

			const tokens = event.commandText.trim().split(/\s+/);
			const firstToken = (tokens[0] ?? "").toLowerCase().replace(/^[:^]/, "");

			const isCommandMatch =
				evCmdId === targetCmd ||
				evVerb === targetCmd ||
				firstToken === targetCmd;
			if (!isCommandMatch) continue;

			let args: string[] = [];
			if (event.args && event.args.length > 0) {
				const sortedArgs = [...event.args].sort((a, b) => a.index - b.index);
				args = sortedArgs.map((a) => a.value);
			} else {
				args = tokens.slice(1);
			}

			if (input.priorArguments && input.priorArguments.length > 0) {
				let priorMatch = true;
				for (let i = 0; i < input.priorArguments.length; i++) {
					if (
						(args[i] ?? "").toLowerCase() !==
						input.priorArguments[i]!.toLowerCase()
					) {
						priorMatch = false;
						break;
					}
				}
				if (!priorMatch) continue;
			}

			const argValue = args[input.argumentIndex];
			if (argValue === undefined) continue;

			if (
				input.prefix &&
				!argValue.toLowerCase().startsWith(input.prefix.toLowerCase())
			) {
				continue;
			}

			const current = usage.get(argValue) ?? {
				sessionCount: 0,
				allCount: 0,
			};
			if (event.scope === "session" && event.scopeKey === input.sessionId) {
				current.sessionCount += 1;
				if (
					!current.sessionLastUsedAt ||
					event.executedAt > current.sessionLastUsedAt
				) {
					current.sessionLastUsedAt = event.executedAt;
				}
			} else if (event.scope === "all") {
				current.allCount += 1;
				if (
					!current.allLastUsedAt ||
					event.executedAt > current.allLastUsedAt
				) {
					current.allLastUsedAt = event.executedAt;
				}
			}
			usage.set(argValue, current);
		}

		return [...usage.entries()]
			.map(([val, u]) => ({
				commandId: input.commandId,
				argumentIndex: input.argumentIndex,
				argumentValue: val,
				sessionCount: u.sessionCount,
				allCount: u.allCount,
				sessionLastUsedAt: u.sessionLastUsedAt,
				allLastUsedAt: u.allLastUsedAt,
			}))
			.sort((a, b) => {
				const bTotal = b.sessionCount + b.allCount;
				const aTotal = a.sessionCount + a.allCount;
				if (bTotal !== aTotal) return bTotal - aTotal;
				const bTime = Math.max(
					Date.parse(b.sessionLastUsedAt ?? ""),
					Date.parse(b.allLastUsedAt ?? ""),
				);
				const aTime = Math.max(
					Date.parse(a.sessionLastUsedAt ?? ""),
					Date.parse(a.allLastUsedAt ?? ""),
				);
				return bTime - aTime;
			})
			.slice(0, input.limit ?? 50);
	}
}
