export class ExtensionError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly extensionId?: string,
		readonly sourceFile?: string,
		override readonly cause?: unknown,
	) {
		super(message);
		this.name = "ExtensionError";
	}
}

export interface ExtensionDiagnostic {
	code: string;
	message: string;
	extensionId?: string;
	sourceFile?: string;
	cause?: unknown;
}

export function extensionDiagnostic(
	error: unknown,
	context: Pick<ExtensionDiagnostic, "extensionId" | "sourceFile"> = {},
): ExtensionDiagnostic {
	if (error instanceof ExtensionError) {
		return {
			code: error.code,
			message: error.message,
			extensionId: error.extensionId ?? context.extensionId,
			sourceFile: error.sourceFile ?? context.sourceFile,
			cause: error.cause,
		};
	}
	return {
		code: "EXTENSION_ACTIVATION_FAILED",
		message: error instanceof Error ? error.message : String(error),
		...context,
		cause: error,
	};
}
