import { getCompiledRegex } from "../regex";
import {
	alternativesSource,
	diagnostic,
	hasConflictingCasePolicies,
	slotSource,
} from "./compiler-helpers";
import type {
	CompiledFundamentalVariant,
	FundamentalDiagnostic,
	FundamentalVariant,
} from "./contracts";

export function compileFundamentalVariant(
	groupId: string,
	variant: FundamentalVariant,
	diagnostics: FundamentalDiagnostic[],
): CompiledFundamentalVariant | undefined {
	if (hasConflictingCasePolicies(variant)) {
		diagnostics.push(
			diagnostic(
				"FUNDAMENTAL_CONFLICTING_CASE_POLICY",
				"values.fundamental.conflictingCasePolicy",
				{ groupId, variantId: variant.id },
				{ groupId, variantId: variant.id },
			),
		);
		return undefined;
	}
	if (!variant.slots.length) {
		diagnostics.push(
			diagnostic(
				"FUNDAMENTAL_SLOTS_REQUIRED",
				"values.fundamental.slotsRequired",
				{ groupId, variantId: variant.id },
			),
		);
		return undefined;
	}
	if ((variant.connectors?.length ?? 0) > variant.slots.length - 1) {
		diagnostics.push(
			diagnostic(
				"FUNDAMENTAL_CONNECTOR_ARITY",
				"values.fundamental.connectorArity",
				{
					groupId,
					variantId: variant.id,
					connectors: variant.connectors?.length ?? 0,
					slots: variant.slots.length,
				},
			),
		);
		return undefined;
	}
	if (variant.slots.length > 1 && !variant.connectors?.length) {
		diagnostics.push(
			diagnostic(
				"FUNDAMENTAL_CONNECTOR_REQUIRED",
				"values.fundamental.connectorRequired",
				{ groupId, variantId: variant.id },
			),
		);
		return undefined;
	}
	const patternIds: string[] = [];
	const parts: string[] = [];
	const prefix = alternativesSource(
		variant.prefix,
		"prefix",
		groupId,
		variant.id,
		diagnostics,
	);
	if (prefix) {
		parts.push(prefix, "\\s*");
		patternIds.push(...(variant.prefix ?? []).map((pattern) => pattern.id));
	}
	for (let index = 0; index < variant.slots.length; index++) {
		parts.push(slotSource(variant.slots[index]!, index));
		const connector = variant.connectors?.[index];
		const connectorSource = alternativesSource(
			connector,
			"connector",
			groupId,
			variant.id,
			diagnostics,
		);
		if (connectorSource) {
			parts.push("\\s*", connectorSource, "\\s*");
			patternIds.push(...(connector ?? []).map((pattern) => pattern.id));
		}
	}
	const postfix = alternativesSource(
		variant.postfix,
		"postfix",
		groupId,
		variant.id,
		diagnostics,
	);
	if (postfix) {
		parts.push("\\s*", postfix);
		patternIds.push(...(variant.postfix ?? []).map((pattern) => pattern.id));
	}
	const caseInsensitive = [
		...(variant.prefix ?? []),
		...(variant.connectors ?? []).flat(),
		...(variant.postfix ?? []),
	].some((pattern) => pattern.caseSensitive === false);
	try {
		return {
			groupId,
			variantId: variant.id,
			slots: variant.slots,
			regex: getCompiledRegex(
				`^${parts.join("")}$`,
				`${caseInsensitive ? "i" : ""}ud`,
			),
			...(variant.priority === undefined ? {} : { priority: variant.priority }),
			patternIds: Object.freeze(patternIds),
		};
	} catch {
		diagnostics.push(
			diagnostic(
				"FUNDAMENTAL_REGEX_INVALID",
				"values.fundamental.regexInvalid",
				{ groupId, variantId: variant.id },
			),
		);
		return undefined;
	}
}
