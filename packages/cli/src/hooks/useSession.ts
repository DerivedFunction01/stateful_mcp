import type { EngineBuilderResult } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import { ClinicalEngineBuilder } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import type { NotebookStore } from "@stateful-mcp/clinical/store/notebook/notebook-store";
import { useEffect, useState } from "react";
import { resolveInitialSession } from "../lib/session-resolver";

export interface SessionState {
	result: EngineBuilderResult;
	notebook: NotebookStore;
	sessionId: string;
}

export function useSession(): SessionState | null {
	const [state, setState] = useState<SessionState | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const result = await ClinicalEngineBuilder.withDefaultBackend("memory");
			if (cancelled) return;
			const sessionId = await resolveInitialSession(result.notebook);
			if (cancelled) return;
			setState({
				result,
				notebook: result.notebook,
				sessionId,
			});
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
