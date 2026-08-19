export interface HostError {
	readonly code: string;
	readonly message: string;
	readonly details?: unknown;
	readonly retryable?: boolean;
}

export const hostError = (
	code: string,
	message: string,
	details?: unknown,
	retryable?: boolean,
): HostError => ({
	code,
	message,
	...(details === undefined ? {} : { details }),
	...(retryable === undefined ? {} : { retryable }),
});

export function safeHostError(error: unknown, fallback = "Host request failed"): HostError {
	return error instanceof Error
		? hostError("HOST_REQUEST_FAILED", error.message)
		: hostError("HOST_REQUEST_FAILED", fallback);
}
