/** Values that may safely cross the Macro protocol boundary. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

/** Translation keys are intentionally opaque to the dependency-free protocol. */
export type I18nKey = string;

export type MessageParam = string | number | boolean;

export interface ErrorDescriptor {
	readonly messageKey: I18nKey;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

/**
 * Structured, user-visible error data. `cause` and `Error.message` are
 * deliberately absent: they are local diagnostics and must not be serialized.
 */
export interface StructuredError extends ErrorDescriptor {
	readonly code?: string;
	readonly retryable?: boolean;
	readonly status?: number;
	readonly safeDetails?: Readonly<Record<string, JsonValue>>;
}

/** Existing protocol name retained while producers migrate to StructuredError. */
export type HostError = StructuredError;

/**
 * Canonical editor-operation rejection. A `StructuredError` is the single
 * rejection shape: `code`/`messageKey`/`messageParams` travel as one object
 * rather than positional arguments, so routing context (`session`/`operation`)
 * stays separate from the error contract.
 */
export type EditorRejection = StructuredError;

/** @deprecated Use ErrorDescriptor. */
export type MessageDescriptor = ErrorDescriptor;

/**
 * Runtime guard for values that may safely cross the protocol boundary.
 * Non-JSON-safe values (functions, symbols, undefined, class instances) are
 * rejected so they can never leak into user-visible payloads.
 */
export function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) return true;
	switch (typeof value) {
		case "string":
		case "number":
		case "boolean":
			return true;
		case "object": {
			if (Array.isArray(value)) {
				return value.every(isJsonValue);
			}
			return Object.values(value as Record<string, unknown>).every(isJsonValue);
		}
		default:
			return false;
	}
}

/** Runtime guard asserting a value is a valid {@link ErrorDescriptor}. */
export function isErrorDescriptor(value: unknown): value is ErrorDescriptor {
	if (!value || typeof value !== "object") return false;
	if (typeof (value as Partial<ErrorDescriptor>).messageKey !== "string") {
		return false;
	}
	const params = (value as Partial<ErrorDescriptor>).messageParams;
	if (params === undefined) return true;
	if (typeof params !== "object" || Array.isArray(params)) return false;
	return Object.values(params).every(
		(param) =>
			typeof param === "string" ||
			typeof param === "number" ||
			typeof param === "boolean",
	);
}

/** Runtime guard asserting a value is a valid {@link StructuredError}. */
export function isStructuredError(value: unknown): value is StructuredError {
	if (!isErrorDescriptor(value)) return false;
	const candidate = value as Partial<StructuredError>;
	if (candidate.code !== undefined && typeof candidate.code !== "string") {
		return false;
	}
	if (
		candidate.retryable !== undefined &&
		typeof candidate.retryable !== "boolean"
	) {
		return false;
	}
	if (candidate.status !== undefined && typeof candidate.status !== "number") {
		return false;
	}
	if (candidate.safeDetails !== undefined) {
		if (
			typeof candidate.safeDetails !== "object" ||
			candidate.safeDetails === null
		) {
			return false;
		}
		return Object.values(candidate.safeDetails).every(isJsonValue);
	}
	return true;
}

/**
 * Validates that a value is safe to include as a `safeDetails` member.
 * Returns the value narrowed to {@link JsonValue}, or `undefined` when unsafe.
 */
export function assertSafeDetail(value: unknown): JsonValue | undefined {
	return isJsonValue(value) ? value : undefined;
}

export function errorDescriptor(
	messageKey: I18nKey,
	messageParams?: Readonly<Record<string, MessageParam>>,
): ErrorDescriptor {
	return {
		messageKey,
		...(messageParams === undefined ? {} : { messageParams }),
	};
}

export interface StructuredErrorOptions {
	readonly code?: string;
	readonly messageKey: I18nKey;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly retryable?: boolean;
	readonly status?: number;
	readonly safeDetails?: Readonly<Record<string, JsonValue>>;
	/** Accepted for boundary adapters, but never included in the result. */
	readonly cause?: unknown;
}

export function structuredError(
	options: StructuredErrorOptions,
): StructuredError {
	return {
		...errorDescriptor(options.messageKey, options.messageParams),
		...(options.code === undefined ? {} : { code: options.code }),
		...(options.retryable === undefined
			? {}
			: { retryable: options.retryable }),
		...(options.status === undefined ? {} : { status: options.status }),
		...(options.safeDetails === undefined
			? {}
			: { safeDetails: options.safeDetails }),
	};
}

/** Compatibility adapter for the current HostError call sites. */
export const hostError = (
	code: string,
	message: ErrorDescriptor,
	details?: Readonly<Record<string, JsonValue>>,
	retryable?: boolean,
): HostError =>
	structuredError({
		code,
		messageKey: message.messageKey,
		messageParams: message.messageParams,
		safeDetails: details,
		retryable,
	});

export function normalizeBoundaryError(error: unknown): HostError {
	if (isStructuredError(error)) return structuredError(error);
	return structuredError({
		code: "HOST_REQUEST_FAILED",
		messageKey: "host.requestFailed",
	});
}

/** Generic boundary adapter: converts any error into a safe {@link HostError}. */
export const toHostError = normalizeBoundaryError;

export function safeHostError(error: unknown): HostError {
	return normalizeBoundaryError(error);
}
