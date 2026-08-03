import type { NotebookStore } from "@stateful-mcp/clinical/store/notebook/notebook-store";

/**
 * Sealed, replaceable seam for resolving the initial notebook session.
 *
 * First impl: resumes the most-recently-updated existing session if one
 * exists, otherwise generates a fresh `tui-${Date.now()}` id.
 */
export async function resolveInitialSession(
	notebook: NotebookStore,
): Promise<string> {
	const sessionIds = await notebook.getSessionIds();
	if (sessionIds.length > 0) {
		let bestId: string | null = null;
		let bestUpdatedAt = "";
		for (const id of sessionIds) {
			const refs = await notebook.listSession(id);
			const latest = refs.reduce<string>(
				(acc, ref) => (ref.updatedAt > acc ? ref.updatedAt : acc),
				"",
			);
			// Prefer a session with any cell timestamp; a session with no cells
			// falls back to the doc-level timestamp tracked by the store.
			const doc = await notebook.loadDocument(id);
			const candidate = latest || doc?.updatedAt || "";
			if (bestId === null || candidate > bestUpdatedAt) {
				bestUpdatedAt = candidate;
				bestId = id;
			}
		}
		return bestId ?? `tui-${Date.now()}`;
	}
	return `tui-${Date.now()}`;
}
