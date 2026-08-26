import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { RecipeDiagnostic, TerminalParseResult } from "../recipes";

export function diagnostics(
	items: readonly {
		code?: string;
		messageKey?: string;
		messageParams?: Readonly<Record<string, MessageParam>>;
	}[],
): readonly RecipeDiagnostic[] {
	return items.map((item) => ({
		errorCode: item.code,
		messageKey: item.messageKey ?? "values.terminal.invalid",
		messageParams: item.messageParams,
	}));
}

export function result(
	value: unknown | undefined,
	items: readonly {
		code?: string;
		messageKey?: string;
		messageParams?: Readonly<Record<string, MessageParam>>;
	}[],
): TerminalParseResult {
	return {
		valid: value !== undefined && items.length === 0,
		value,
		canonicalValue: value,
		diagnostics: diagnostics(items),
		stable: true,
	};
}
