import {
	type HostError,
	type JsonValue,
	type MessageParam,
	structuredError,
} from "@stateful-mcp/macro-protocol";

/**
 * Boundary error thrown by session operations. Carries a stable protocol
 * `code`, a locale `messageKey`, optional `messageParams`, and whether the
 * failure is retryable. It converts into the protocol `HostError` (which is
 * `code` + `messageKey` + `messageParams` + `safeDetails`) without leaking
 * internal types or any human-readable message fallback.
 */
export class SessionError extends Error {
	constructor(
		readonly code: string,
		readonly messageKey: string,
		readonly retryable = false,
		readonly messageParams?: Readonly<Record<string, MessageParam>>,
		readonly safeDetails?: Readonly<Record<string, JsonValue>>,
	) {
		super(messageKey);
	}

	toHostError(): HostError {
		return structuredError({
			code: this.code,
			messageKey: this.messageKey,
			messageParams: this.messageParams,
			retryable: this.retryable,
			safeDetails: this.safeDetails,
		});
	}
}
