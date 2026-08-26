import type {
	MessageParam,
	StructuredError,
} from "@stateful-mcp/macro-protocol";
import { structuredError } from "@stateful-mcp/macro-protocol";

export interface ExtensionErrorOptions {
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly extensionId?: string;
	readonly sourceFile?: string;
	readonly cause?: unknown;
}

export class ExtensionError extends Error {
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly extensionId?: string;
	readonly sourceFile?: string;

	constructor(options: ExtensionErrorOptions) {
		super(options.messageKey);
		this.messageKey = options.messageKey;
		this.messageParams = options.messageParams;
		this.extensionId = options.extensionId;
		this.sourceFile = options.sourceFile;
		this.cause = options.cause;
		this.name = "ExtensionError";
	}

	toHostError(): StructuredError {
		return structuredError({
			messageKey: this.messageKey,
			messageParams: this.messageParams,
			safeDetails: this.extensionId
				? { extensionId: this.extensionId }
				: undefined,
		});
	}
}

export interface ExtensionDiagnostic {
	messageKey: string;
	messageParams?: Readonly<Record<string, MessageParam>>;
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
			messageKey: error.messageKey,
			...(error.messageParams === undefined
				? {}
				: { messageParams: error.messageParams }),
			extensionId: error.extensionId ?? context.extensionId,
			sourceFile: error.sourceFile ?? context.sourceFile,
			cause: error.cause,
		};
	}
	const messageKey = "extensions.errors.activationFailed";
	const messageParams: Record<string, MessageParam> = {
		extensionId: context.extensionId ?? "unknown",
		sourceFile: context.sourceFile ?? "unknown",
	};
	return {
		messageKey,
		messageParams,
		...context,
		cause: error,
	};
}
