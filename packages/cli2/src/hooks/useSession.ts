import { useEffect, useState } from "react";
import type { V2BootstrapResult } from "../lib/session/bootstrap-v2";

export interface SessionState {
	v2: V2BootstrapResult;
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
			const { bootstrapV2Session } = await import(
				"../lib/session/bootstrap-v2"
			);
			const v2 = await bootstrapV2Session();
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
