import { useEffect, useState } from "react";
import type { BootstrapResult } from "../lib/session/bootstrap-session";

export interface SessionState {
	v2: BootstrapResult;
	sessionId: string;
	/** Temporary presentation-only compatibility slots; never contain V1 runtime services. */
	result: any;
	notebook: any;
}

export function useSession(): SessionState | null {
	const [state, setState] = useState<SessionState | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const { bootstrapSession } = await import(
				"../lib/session/bootstrap-session"
			);
			const v2 = await bootstrapSession();
			if (cancelled) return;
			setState({
				v2,
				sessionId: v2.sessionId,
				result: undefined,
				notebook: undefined,
			});
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
