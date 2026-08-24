import { type HostError, hostError } from "@stateful-mcp/macro-protocol";

/**
 * Boundary error thrown by session operations. Carries a stable protocol
 * `code`, a human-facing message, and whether the failure is retryable. It
 * converts into the protocol `HostError` without leaking internal types.
 */
export class SessionError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly retryable = false,
		readonly details?: unknown,
	) {
		super(message);
	}

	toHostError(): HostError {
		return hostError(this.code, this.message, this.details, this.retryable);
	}
}
