import { describe, expect, test } from "bun:test";
import { KvHistoryStore, MemoryKvBackend } from "@stateful-mcp/core";
import {
	type MacroExecutionAttempt,
	MacroExecutionHistory,
	MacroListenerRegistry,
	MacroRendererRegistry,
	MacroReplayService,
} from "../src/index";
import { createListOutputRenderer } from "./support/sample-renderers";

const attempt = (id: string, sequenceValue: string): MacroExecutionAttempt => ({
	attemptId: id,
	macroId: "fixture.macro",
	macroVersion: 1,
	authoredText: sequenceValue,
	outcome: "accepted",
	attemptedAt: "2026-01-01T00:00:00.000Z",
	diagnostics: [],
	locks: [],
});

describe("macro history replay", () => {
	test("dispatches listeners and renderers in deterministic order", async () => {
		const history = new KvHistoryStore<MacroExecutionAttempt>(
			new MemoryKvBackend(),
		);
		const listeners = new MacroListenerRegistry();
		const order: string[] = [];
		listeners.register({
			id: "z",
			order: 2,
			onParsed: () => {
				order.push("z");
				return { text: "z" };
			},
		});
		listeners.register({
			id: "a",
			order: 1,
			onParsed: () => {
				order.push("a");
				return { text: "a" };
			},
		});
		const renderers = new MacroRendererRegistry();
		renderers.register(
			createListOutputRenderer({
				id: "list",
				label: (item) => item.authoredText,
			}),
		);
		const execution = new MacroExecutionHistory(history, {
			listeners,
			renderers,
		});
		const session = {
			snapshot: () => ({
				mode: "macro" as const,
				text: "run",
				revision: 1,
				cursorOffset: 3,
				parse: null,
				resolutions: [],
				projections: [],
				locks: [],
				diagnostics: [],
			}),
			commit: () => ({
				status: "matched" as const,
				macro: { id: "fixture.macro", name: "run" },
				arguments: [],
				payload: {},
				diagnostics: [],
			}),
		};
		const live = await execution.execute({ attemptId: "a", session });
		const replay = await new MacroReplayService(
			history,
			listeners,
			renderers,
		).replay();
		expect(order).toEqual(["a", "z", "a", "z"]);
		expect(live.fingerprint).toBe(replay.fingerprint);
		expect(replay.events).toHaveLength(1);
	});

	test("records an externally rejected attempt", async () => {
		const history = new KvHistoryStore<MacroExecutionAttempt>(
			new MemoryKvBackend(),
		);
		const execution = new MacroExecutionHistory(history, {
			executor: { execute: async () => ({ outcome: "rejected" }) },
		});
		const session = {
			snapshot: () => ({
				mode: "macro" as const,
				text: "run",
				revision: 0,
				cursorOffset: 3,
				parse: null,
				resolutions: [],
				projections: [],
				locks: [],
				diagnostics: [],
			}),
			commit: () => ({
				status: "matched" as const,
				macro: { id: "fixture.macro", name: "run" },
				arguments: [],
				payload: {},
				diagnostics: [],
			}),
		};
		const result = await execution.execute({ attemptId: "rejected", session });
		expect(result.attempt.outcome).toBe("rejected");
		expect((await history.read("macro-executions")).events).toHaveLength(1);
	});
});
