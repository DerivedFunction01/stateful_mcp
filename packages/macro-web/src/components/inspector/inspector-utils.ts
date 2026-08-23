import type { ScratchpadLineDto } from "@stateful-mcp/macro-protocol";
import type { WebI18nKey } from "../../lib/macro-i18n-provider";
import type { InspectorDiagnosticItem } from "./inspector-types";

/**
 * Resolves a localized message from diagnostic code, messageKey, or fallback message.
 */
export function resolveDiagnosticMessage(
	d: InspectorDiagnosticItem,
	t: (
		key: WebI18nKey,
		params?: Record<string, string | number | boolean>,
	) => string,
): string {
	if (d.messageKey) {
		return t(d.messageKey as WebI18nKey, d.messageParams as any);
	}
	if (d.code) {
		const errorKey = `errors.${d.code}` as WebI18nKey;
		const translated = t(errorKey);
		if (translated && translated !== errorKey) return translated;
	}
	return d.message;
}

/**
 * Extracts parsed slot arguments directly from AST execution preview bindings
 * and slot projections, with no ad-hoc regex parsing.
 */
export function getLineSlots(
	line: ScratchpadLineDto,
): readonly { readonly key: string; readonly value: string }[] {
	// 1. Check execution preview bindings (most accurate AST validation)
	const execPreview = line.executionPreview?.payload?.data as
		| {
				bindings?: readonly {
					argumentId: string;
					input?: { raw?: string; value?: unknown };
				}[];
		  }
		| undefined;

	if (execPreview?.bindings && execPreview.bindings.length > 0) {
		return execPreview.bindings.map((b) => ({
			key: b.argumentId,
			value: String(b.input?.value ?? b.input?.raw ?? ""),
		}));
	}

	// 2. Check slot projections
	const slotProjections =
		line.projections?.filter((p) => p.kind === "slot") ?? [];
	if (slotProjections.length > 0) {
		return slotProjections.map((p) => {
			const data = p.payload.data as
				| {
						argumentId?: string;
						displayText?: string;
						rawText?: string;
				  }
				| undefined;
			return {
				key: data?.argumentId ?? p.ownerId ?? "slot",
				value: data?.displayText ?? data?.rawText ?? "",
			};
		});
	}

	return [];
}
