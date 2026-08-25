import type { MessageDescriptor } from "@stateful-mcp/macro-protocol";
import { HostRequestError } from "./host-client";
import type { MacroWebI18n } from "./macro-i18n-provider";

/**
 * Final user-visible resolution step. Accepts only a canonical descriptor and
 * never renders a literal translation key: a missing translation is reported as
 * a localized generic defect and surfaced to developer telemetry.
 */
export function resolveMessage(
	i18n: MacroWebI18n,
	descriptor: MessageDescriptor | undefined,
): string {
	if (!descriptor) return i18n.t("common.error");
	const translated = i18n.t(
		descriptor.messageKey as never,
		descriptor.messageParams,
	);
	if (translated === descriptor.messageKey) {
		reportMissingTranslation(descriptor.messageKey);
		return i18n.t("common.error");
	}
	return translated;
}

function reportMissingTranslation(messageKey: string): void {
	console.error(`[i18n] missing translation key: ${messageKey}`);
}

export function resolveThrownError(i18n: MacroWebI18n, error: unknown): string {
	if (error instanceof HostRequestError) {
		return resolveMessage(i18n, error.error);
	}
	return i18n.t("common.error");
}
