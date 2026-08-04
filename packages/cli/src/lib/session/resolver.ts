// TODO(cli2-v2): replace V1 NotebookStore session resumption with
// notebook/cell-store session resolution before this file is deleted.

/**
 * Sealed, replaceable seam for resolving the initial notebook session.
 *
 * First impl: resumes the most-recently-updated existing session if one
 * exists, otherwise generates a fresh `tui-${Date.now()}` id.
 */
import type { NotebookSessionStore } from "@stateful-mcp/clinical/notebook/notebook-session-store";

export async function resolveInitialSession(
	store: NotebookSessionStore,
	preferredId?: string,
): Promise<string> {
	if (preferredId) return preferredId;
	const sessions = await store.list();
	const mostRecent = sessions.sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	)[0];
	return mostRecent?.sessionId ?? `cli2-${Date.now()}`;
}
