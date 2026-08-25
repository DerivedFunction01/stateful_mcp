export type MessageParam = string | number | boolean;

export interface MessageDescriptor {
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface HostError extends MessageDescriptor {
	readonly code: string;
	readonly details?: unknown;
	readonly retryable?: boolean;
}

export const hostError = (
	code: string,
	message: MessageDescriptor,
	details?: unknown,
	retryable?: boolean,
): HostError => ({
	code,
	...message,
	...(details === undefined ? {} : { details }),
	...(retryable === undefined ? {} : { retryable }),
});

export function safeHostError(error: unknown): HostError {
	return hostError("HOST_REQUEST_FAILED", { messageKey: "host.requestFailed" });
}
