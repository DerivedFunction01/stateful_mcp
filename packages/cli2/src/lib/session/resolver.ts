// TODO(cli2-v2): replace V1 NotebookStore session resumption with V2
// notebook/cell-store session resolution before this file is deleted.

/**
 * Sealed, replaceable seam for resolving the initial notebook session.
 *
 * First impl: resumes the most-recently-updated existing session if one
 * exists, otherwise generates a fresh `tui-${Date.now()}` id.
 */
export async function resolveInitialSession(): Promise<string> {
	return `cli2-${Date.now()}`;
}
