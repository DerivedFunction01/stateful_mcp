import type {
	HeadlessDiagnostic,
	HeadlessFailure,
	HeadlessResponse,
	HeadlessSuccess,
} from "./headless/command-contracts";

export function stableJson(value: unknown): string {
	return JSON.stringify(sortKeys(value), null, 2);
}

export function success<T>(
	command: string,
	data: T,
	diagnostics: HeadlessDiagnostic[] = [],
): HeadlessSuccess<T> {
	return { ok: true, version: 1, command, data, diagnostics };
}

export function failure(
	command: string,
	code: string,
	message: string,
	details?: Record<string, unknown>,
	diagnostics: HeadlessDiagnostic[] = [],
): HeadlessFailure {
	return {
		ok: false,
		version: 1,
		command,
		error: { code, message, ...(details ? { details } : {}) },
		diagnostics,
	};
}

export function responseExitCode(
	response: HeadlessResponse<unknown>,
): 0 | 1 | 2 {
	if (response.ok) return 0;
	return response.error.code === "INTERNAL_ERROR" ||
		response.error.code.startsWith("HISTORY_")
		? 1
		: 2;
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, sortKeys(item)]),
	);
}
