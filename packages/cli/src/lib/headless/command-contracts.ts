export interface HeadlessDiagnostic {
	code: string;
	message: string;
	line?: number;
	field?: string;
}

export interface HeadlessSuccess<T> {
	ok: true;
	version: 1;
	command: string;
	data: T;
	diagnostics: HeadlessDiagnostic[];
}

export interface HeadlessFailure {
	ok: false;
	version: 1;
	command: string;
	error: { code: string; message: string; details?: Record<string, unknown> };
	diagnostics: HeadlessDiagnostic[];
}

export type HeadlessResponse<T> = HeadlessSuccess<T> | HeadlessFailure;

export interface HeadlessRequest {
	command: string;
	args?: string[];
	options?: Record<string, string | number | boolean | undefined>;
}
