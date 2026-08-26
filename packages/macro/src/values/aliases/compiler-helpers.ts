import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { AliasDiagnostic } from "./contracts";

export function aliasesDiagnostic(
	code: string,
	messageKey: string,
	messageParams: Readonly<Record<string, MessageParam>>,
	extra: Pick<AliasDiagnostic, "definitionId" | "namespace" | "spelling"> = {},
): AliasDiagnostic {
	return { code, messageKey, messageParams, ...extra };
}
