import type { MessageParam } from "@stateful-mcp/macro-protocol";
import { applyWordBoundary, escapeRegex } from "../regex";
import type {
	FundamentalDiagnostic,
	FundamentalPattern,
	FundamentalPosition,
	FundamentalSlot,
	FundamentalVariant,
} from "./contracts";

export function diagnostic(
	errorCode: string,
	messageKey: string,
	messageParams: Readonly<Record<string, MessageParam>>,
	extra: Pick<FundamentalDiagnostic, "groupId" | "variantId" | "position"> = {},
): FundamentalDiagnostic {
	return { errorCode, messageKey, messageParams, ...extra };
}

export function patternSource(pattern: FundamentalPattern): string {
	const source = pattern.isRegex
		? `(?:${pattern.text})`
		: escapeRegex(pattern.text);
	return pattern.boundary === "none" ? source : applyWordBoundary(source);
}

export function alternativesSource(
	patterns: readonly FundamentalPattern[] | undefined,
	position: FundamentalPosition,
	groupId: string,
	variantId: string,
	diagnostics: FundamentalDiagnostic[],
): string {
	if (!patterns?.length) return "";
	const caseSensitive = patterns[0]?.caseSensitive ?? true;
	if (
		patterns.some(
			(pattern) => (pattern.caseSensitive ?? true) !== caseSensitive,
		)
	)
		diagnostics.push(
			diagnostic(
				"FUNDAMENTAL_CONFLICTING_CASE_POLICY",
				"values.fundamental.conflictingCasePolicy",
				{ position },
				{ groupId, variantId, position },
			),
		);
	return `(?:${patterns.map(patternSource).join("|")})`;
}

export function hasConflictingCasePolicies(
	variant: FundamentalVariant,
): boolean {
	const patterns = [
		...(variant.prefix ?? []),
		...(variant.connectors ?? []).flat(),
		...(variant.postfix ?? []),
	];
	return (
		new Set(patterns.map((pattern) => pattern.caseSensitive ?? true)).size > 1
	);
}

export function slotSource(slot: FundamentalSlot, index: number): string {
	return `(?<f_${index}_${slot.id.replace(/[^A-Za-z0-9_]/g, "_")}>${slot.pattern ?? "\\S+"})`;
}
