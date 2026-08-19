import type { HostError } from "./errors";
import { MACRO_PROTOCOL_VERSION, type MacroProtocolVersion } from "./version";

export interface HostRequest<
	TType extends string = string,
	TPayload = unknown,
> {
	readonly version: MacroProtocolVersion;
	readonly requestId: string;
	readonly type: TType;
	readonly sessionId: string;
	readonly payload: TPayload;
}

export interface HostResponse<TPayload = unknown> {
	readonly version: MacroProtocolVersion;
	readonly requestId: string;
	readonly ok: boolean;
	readonly payload?: TPayload;
	readonly error?: HostError;
}

export interface HostEvent<TType extends string = string, TPayload = unknown> {
	readonly version: MacroProtocolVersion;
	readonly eventId: string;
	readonly type: TType;
	readonly sessionId: string;
	readonly sequence: number;
	readonly revision: number;
	readonly payload: TPayload;
}

export function isProtocolVersion(
	value: unknown,
): value is MacroProtocolVersion {
	return value === MACRO_PROTOCOL_VERSION;
}

export function response<T>(requestId: string, payload: T): HostResponse<T> {
	return { version: MACRO_PROTOCOL_VERSION, requestId, ok: true, payload };
}

export function failure(
	requestId: string,
	error: HostError,
): HostResponse<never> {
	return { version: MACRO_PROTOCOL_VERSION, requestId, ok: false, error };
}
