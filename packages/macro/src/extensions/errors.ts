import type { MessageParam } from "@stateful-mcp/macro-protocol";
import { EN_ERRORS } from "../workspace/i18n/locales/en/errors";

export class ExtensionError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly extensionId?: string,
		readonly sourceFile?: string,
		override readonly cause?: unknown,
		readonly messageKey?: string,
		readonly messageParams?: Readonly<Record<string, MessageParam>>,
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
	/** Structured message key; preferred over `message` when present. */
	messageKey: string;
	messageParams?: Readonly<Record<string, MessageParam>>;
}

// Maps known ExtensionError codes to localized message keys so any serialized
// error carries a structured message rather than a raw string.
const EXTENSION_ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
	EXTENSION_DEPENDENCY_UNAVAILABLE: "errors.extensionDependencyUnavailable",
	EXTENSION_ACTIVATION_FAILED: "errors.extensionActivationFailed",
	EXTENSION_IMPORT_FAILED: "errors.extensionImportFailed",
	EXTENSION_EXPORT_MISSING: "errors.extensionExportMissing",
	EXTENSION_MANIFEST_INVALID: "errors.extensionManifestInvalid",
	DUPLICATE_EXTENSION_ID: "errors.duplicateExtensionId",
	MISSING_EXTENSION_DEPENDENCY: "errors.missingExtensionDependency",
	EXTENSION_DEPENDENCY_CYCLE: "errors.extensionDependencyCycle",
};

export function defaultExtensionMessage(
	key: string,
	params?: Readonly<Record<string, MessageParam>>,
): string {
	const template = EN_ERRORS[key];
	if (!template) return key;
	return template.replace(/\{(\w+)\}/g, (match, name) => {
		const value = params?.[name];
		return value !== undefined ? String(value) : match;
	});
}

export function extensionDiagnostic(
	error: unknown,
	context: Pick<ExtensionDiagnostic, "extensionId" | "sourceFile"> = {},
): ExtensionDiagnostic {
	if (error instanceof ExtensionError) {
		const messageKey =
			error.messageKey ??
			EXTENSION_ERROR_MESSAGE_KEYS[error.code] ??
			"errors.extensionError";
		const messageParams = error.messageParams;
		return {
			code: error.code,
			messageKey,
			messageParams,
			message: defaultExtensionMessage(messageKey, messageParams),
			extensionId: error.extensionId ?? context.extensionId,
			sourceFile: error.sourceFile ?? context.sourceFile,
			cause: error.cause,
		};
	}
	const messageKey = "errors.extensionActivationFailed";
	const messageParams: Record<string, MessageParam> = {
		extensionId: context.extensionId ?? "unknown",
		sourceFile: context.sourceFile ?? "unknown",
	};
	return {
		code: "EXTENSION_ACTIVATION_FAILED",
		messageKey,
		messageParams,
		message: defaultExtensionMessage(messageKey, messageParams),
		...context,
		cause: error,
	};
}
