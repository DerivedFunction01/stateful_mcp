import type { EngineBuilderResult } from "@stateful-mcp/clinical/engine/clinical-engine-builder";
import type { NotebookStore } from "@stateful-mcp/clinical/store/notebook/notebook-store";
import { useEffect, useState } from "react";
import { bootstrapSession } from "../lib/session/bootstrap";

export interface SessionState {
	result: EngineBuilderResult;
	notebook: NotebookStore;
	sessionId: string;
}

export function useSession(): SessionState | null {
	// TODO(cli2-v2): replace the legacy EngineBuilderResult/NotebookStore session
	// with ClinicalRuntimeV2 and a V2 notebook-session store. This seam remains
	// intentionally inert until the CLI2 V2 bootstrap is implemented.
	const [state, setState] = useState<SessionState | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const { result, sessionId } = await bootstrapSession();
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
