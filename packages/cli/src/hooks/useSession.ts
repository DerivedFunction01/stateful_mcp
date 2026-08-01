import type { EngineBuilderResult } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import { ClinicalEngineBuilder } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import { useEffect, useState } from "react";
import { MemoryNotebookStore } from "../store/memory-notebook-store";

export interface SessionState {
	result: EngineBuilderResult;
	notebook: MemoryNotebookStore;
	sessionId: string;
}

const SESSION_ID = `tui-${Date.now()}`;

export function useSession(): SessionState | null {
	const [state, setState] = useState<SessionState | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const result = await ClinicalEngineBuilder.withDefaultBackend("memory");
			if (cancelled) return;
			setState({
				result,
				notebook: new MemoryNotebookStore(),
				sessionId: SESSION_ID,
			});
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
