import {
	type HostError,
	hostError,
	type MessageDescriptor,
	type MessageParam,
} from "@stateful-mcp/macro-protocol";

/**
 * Boundary error thrown by session operations. Carries a stable protocol
 * `code`, a locale `messageKey`, optional `messageParams`, and whether the
 * failure is retryable. It converts into the protocol `HostError` (which is
 * `code` + `messageKey` + `messageParams`) without leaking internal types or
 * any human-readable message fallback.
 */
export class SessionError extends Error {
	constructor(
		readonly code: string,
		readonly messageKey: string,
		readonly retryable = false,
		readonly messageParams?: Readonly<Record<string, MessageParam>>,
		readonly details?: unknown,
	) {
		super(messageKey);
	}

	toHostError(): HostError {
		const descriptor: MessageDescriptor = {
			messageKey: this.messageKey,
			...(this.messageParams ? { messageParams: this.messageParams } : {}),
		};
		return hostError(this.code, descriptor, this.details, this.retryable);
	}
}
