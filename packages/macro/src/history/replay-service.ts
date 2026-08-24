import type { HistoryReadOptions, HistoryStore } from "@stateful-mcp/core";
import type { MacroListenerRegistry } from "../listeners/listener-registry";
import {
	type MacroRendererRegistry,
	type MacroRenderOutput,
	rendererOutputFingerprint,
} from "../rendering/contracts";
import type { MacroExecutionAttempt } from "./contracts";

export interface MacroReplayResult {
	events: import("@stateful-mcp/core").HistoryEvent<MacroExecutionAttempt>[];
	listenerOutputs: import("../listeners/listener-registry").MacroListenerOutput[];
	rendererOutputs: MacroRenderOutput[];
	diagnostics: {
		code: string;
		message?: string;
		messageKey?: string;
		messageParams?: Readonly<
			Record<string, import("@stateful-mcp/macro-protocol").MessageParam>
		>;
		sequence?: number;
	}[];
	fingerprint: string;
}

export class MacroReplayService {
	constructor(
		private readonly history: HistoryStore<MacroExecutionAttempt>,
		private readonly listeners: MacroListenerRegistry,
		private readonly renderers: MacroRendererRegistry,
		private readonly streamId = "macro-executions",
	) {}

	async replay(options?: HistoryReadOptions): Promise<MacroReplayResult> {
		if (
			options?.afterSequence !== undefined &&
			(options.afterSequence < 0 ||
				(options.throughSequence !== undefined &&
					options.afterSequence > options.throughSequence))
		) {
			return {
				events: [],
				listenerOutputs: [],
				rendererOutputs: [],
				diagnostics: [
					{
						code: "HISTORY_CURSOR_INVALID",
						messageKey: "errors.historyCursorInvalid",
						message: "Replay range is invalid",
					},
				],
				fingerprint: rendererOutputFingerprint([]),
			};
		}
		const result = await this.history.read(this.streamId, options);
		const all = await this.history.read(this.streamId);
		const listenerOutputs: import("../listeners/listener-registry").MacroListenerOutput[] =
			[];
		const rendererOutputs: MacroRenderOutput[] = [];
		const diagnostics: {
			code: string;
			message?: string;
			messageKey?: string;
			messageParams?: Readonly<
				Record<string, import("@stateful-mcp/macro-protocol").MessageParam>
			>;
			sequence?: number;
		}[] = result.diagnostics.map((item) => ({
			code: item.code,
			message: item.message,
			sequence: item.sequence,
		}));
		for (const event of result.events.sort(
			(left, right) => left.sequence - right.sequence,
		)) {
			diagnostics.push(
				...event.payload.diagnostics.map((item) => ({
					code: item.code,
					message: item.message ?? item.messageKey ?? item.code,
					...(item.messageKey !== undefined
						? { messageKey: item.messageKey }
						: {}),
					...(item.messageParams !== undefined
						? { messageParams: item.messageParams }
						: {}),
					sequence: event.sequence,
				})),
			);
			const contextHistory = all.events
				.filter((item) => item.sequence <= event.sequence)
				.sort((left, right) => left.sequence - right.sequence)
				.map((item) => item.payload);
			const listeners = await this.listeners.dispatch(event.payload, {
				mode: "replay",
				sequence: event.sequence,
				history: contextHistory,
			});
			listenerOutputs.push(...listeners.outputs);
			diagnostics.push(...listeners.diagnostics);
			const renderers = await this.renderers.render(event.payload, {
				mode: "replay",
				sequence: event.sequence,
				listenerOutputs: listeners.outputs,
			});
			rendererOutputs.push(...renderers.outputs);
			diagnostics.push(...renderers.diagnostics);
		}
		return {
			events: result.events,
			listenerOutputs,
			rendererOutputs,
			diagnostics,
			fingerprint: rendererOutputFingerprint([
				...listenerOutputs,
				...rendererOutputs,
			]),
		};
	}
}

export async function replayMacroHistory(
	history: HistoryStore<MacroExecutionAttempt>,
	listeners: MacroListenerRegistry,
	renderers: MacroRendererRegistry,
	options?: HistoryReadOptions & { streamId?: string },
): Promise<MacroReplayResult> {
	const { streamId, ...readOptions } = options ?? {};
	return new MacroReplayService(history, listeners, renderers, streamId).replay(
		readOptions,
	);
}
