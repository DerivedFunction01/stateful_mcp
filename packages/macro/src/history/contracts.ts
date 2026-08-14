import type {
	HistoryEvent,
	HistoryReadOptions,
	HistoryReadResult,
	HistoryStore,
} from "@stateful-mcp/core";
import type { MacroDraftSnapshot } from "../contracts/draft";
import type { MacroParseResult } from "../contracts/payload";
import type {
	AcceptedMacroLock,
	MacroDraftDiagnostic,
} from "../contracts/slots";

export type MacroExecutionOutcome = "accepted" | "rejected";

export interface MacroExecutionAttempt {
	attemptId: string;
	macroId: string;
	macroVersion: number;
	authoredText: string;
	outcome: MacroExecutionOutcome;
	attemptedAt: string;
	revision?: number;
	payload?: MacroParseResult;
	diagnostics: MacroDraftDiagnostic[];
	locks: AcceptedMacroLock[];
	metadata?: Record<string, unknown>;
}

export interface MacroExecutor {
	execute(input: MacroExecutionAttempt): Promise<{
		outcome: MacroExecutionOutcome;
		diagnostics?: MacroDraftDiagnostic[];
		payload?: MacroParseResult;
		metadata?: Record<string, unknown>;
	}>;
}

export interface MacroExecutionInput {
	attemptId: string;
	session: { snapshot(): MacroDraftSnapshot; commit(): MacroParseResult };
	authoredText?: string;
	macroId?: string;
	macroVersion?: number;
	attemptedAt?: string;
	metadata?: Record<string, unknown>;
}

export interface MacroExecutionResult {
	event: HistoryEvent<MacroExecutionAttempt>;
	attempt: MacroExecutionAttempt;
	sequence: number;
	listenerOutputs: import("../listeners/listener-registry").MacroListenerOutput[];
	rendererOutputs: import("../rendering/contracts").MacroRenderOutput[];
	diagnostics: MacroDraftDiagnostic[];
	fingerprint: string;
}

export interface MacroHistoryReadResult
	extends Omit<HistoryReadResult<MacroExecutionAttempt>, "events"> {
	events: HistoryEvent<MacroExecutionAttempt>[];
}

export type MacroHistoryStoreContract = HistoryStore<MacroExecutionAttempt>;

export interface MacroHistoryReadOptions extends HistoryReadOptions {}
