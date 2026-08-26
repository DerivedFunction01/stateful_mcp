import type {
	ErrorDescriptor,
	MessageParam,
} from "@stateful-mcp/macro-protocol";
import { applyWordBoundary, escapeRegex, getCompiledRegex } from "./regex";
import type { TemplateTokenSpec } from "./template-compiler";

export type FundamentalPosition = "prefix" | "connector" | "postfix";

export interface FundamentalPattern {
	readonly id: string;
	readonly text: string;
	readonly isRegex?: boolean;
	readonly caseSensitive?: boolean;
	readonly boundary?: "none" | "unicode";
}

export interface FundamentalSlot {
	readonly id: string;
	readonly parserId?: string;
	/** Optional terminal-specific capture pattern; defaults to one token. */
	readonly pattern?: string;
}

export interface FundamentalVariant {
	readonly id: string;
	readonly slots: readonly FundamentalSlot[];
	readonly prefix?: readonly FundamentalPattern[];
	readonly connectors?: readonly (readonly FundamentalPattern[])[];
	readonly postfix?: readonly FundamentalPattern[];
	readonly priority?: number;
}

export interface FundamentalGroup {
	readonly id: string;
	readonly variants: readonly FundamentalVariant[];
}

export interface FundamentalDiagnostic extends ErrorDescriptor {
	readonly errorCode?: string;
	readonly path?: readonly string[];
	readonly groupId?: string;
	readonly variantId?: string;
	readonly position?: FundamentalPosition;
}

export interface CompiledFundamentalVariant {
	readonly groupId: string;
	readonly variantId: string;
	readonly slots: readonly FundamentalSlot[];
	readonly regex: RegExp;
	readonly priority?: number;
	readonly patternIds: readonly string[];
}

export interface FundamentalCompileResult {
	readonly variants: readonly CompiledFundamentalVariant[];
	readonly diagnostics: readonly FundamentalDiagnostic[];
}

export interface FundamentalExtraction {
	readonly groupId: string;
	readonly variantId: string;
	readonly slots: Readonly<Record<string, string>>;
	readonly slotSpans: Readonly<Record<string, { start: number; end: number }>>;
	readonly matchedPatterns: readonly string[];
	readonly priority?: number;
}

/** Compiles one user-authored ordered token format into a reusable fundamental. */
export function createFundamentalFromAuthoredFormat<TToken extends string>(
	groupId: string,
	format: {
		readonly tokens: readonly TToken[];
		readonly separators: readonly string[];
	},
	tokenSpecs: Readonly<Record<TToken, TemplateTokenSpec>>,
): FundamentalGroup {
	const slots = format.tokens.map((token, index) => ({
		id: `${token}_${index}`,
		parserId: token,
		pattern: tokenSpecs[token]?.pattern,
		index,
	}));
	const connectors = slots.slice(1).map((_, index) => {
		const separator = format.separators[index + 1] ?? "";
		return [
			{
				id: `${groupId}-separator-${index}`,
				text: separator,
				boundary: "none" as const,
				caseSensitive: false,
			},
		];
	});
	return {
		id: groupId,
		variants: [
			{
				id: `${groupId}.authored`,
				prefix: format.separators[0]
					? [
							{
								id: `${groupId}-prefix`,
								text: format.separators[0]!,
								boundary: "none" as const,
							},
						]
					: undefined,
				slots: slots.map(({ id, parserId, pattern }) => ({
					id,
					parserId,
					pattern,
				})),
				connectors,
				postfix: format.separators[format.tokens.length]
					? [
							{
								id: `${groupId}-postfix`,
								text: format.separators[format.tokens.length]!,
								boundary: "none" as const,
							},
						]
					: undefined,
			},
		],
	};
}

function diagnostic(
	errorCode: string,
	messageKey: string,
	messageParams: Readonly<Record<string, MessageParam>>,
	extra: Pick<FundamentalDiagnostic, "groupId" | "variantId" | "position"> = {},
): FundamentalDiagnostic {
	return {
		errorCode,
		messageKey,
		messageParams,
		...extra,
	};
}

function patternSource(pattern: FundamentalPattern): string {
	const source = pattern.isRegex
		? `(?:${pattern.text})`
		: escapeRegex(pattern.text);
	return pattern.boundary === "none" ? source : applyWordBoundary(source);
}

function alternativesSource(
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
	) {
		diagnostics.push(
			diagnostic(
				"FUNDAMENTAL_CONFLICTING_CASE_POLICY",
				"values.fundamental.conflictingCasePolicy",
				{ position },
				{ groupId, variantId, position },
			),
		);
	}
	const source = patterns.map(patternSource).join("|");
	return `(?:${source})`;
}

function hasConflictingCasePolicies(variant: FundamentalVariant): boolean {
	const patterns = [
		...(variant.prefix ?? []),
		...(variant.connectors ?? []).flat(),
		...(variant.postfix ?? []),
	];
	return (
		new Set(patterns.map((pattern) => pattern.caseSensitive ?? true)).size > 1
	);
}

function slotSource(slot: FundamentalSlot, index: number): string {
	return `(?<f_${index}_${slot.id.replace(/[^A-Za-z0-9_]/g, "_")}>${slot.pattern ?? "\\S+"})`;
}

/**
 * Compiles configured extraction groups. This function only compiles syntax;
 * terminal/domain parsers decide what captured slots mean.
 */
export function compileFundamentalGroups(
	groups: readonly FundamentalGroup[],
): FundamentalCompileResult {
	const diagnostics: FundamentalDiagnostic[] = [];
	const variants: CompiledFundamentalVariant[] = [];
	const groupIds = new Set<string>();

	for (const group of groups) {
		if (groupIds.has(group.id)) {
			diagnostics.push(
				diagnostic(
					"DUPLICATE_FUNDAMENTAL_GROUP",
					"values.fundamental.duplicateGroup",
					{
						groupId: group.id,
					},
				),
			);
			continue;
		}
		groupIds.add(group.id);
		const variantIds = new Set<string>();
		for (const variant of group.variants) {
			if (variantIds.has(variant.id)) {
				diagnostics.push(
					diagnostic(
						"DUPLICATE_FUNDAMENTAL_VARIANT",
						"values.fundamental.duplicateVariant",
						{
							groupId: group.id,
							variantId: variant.id,
						},
					),
				);
				continue;
			}
			variantIds.add(variant.id);
			if (hasConflictingCasePolicies(variant)) {
				diagnostics.push(
					diagnostic(
						"FUNDAMENTAL_CONFLICTING_CASE_POLICY",
						"values.fundamental.conflictingCasePolicy",
						{ groupId: group.id, variantId: variant.id },
						{ groupId: group.id, variantId: variant.id },
					),
				);
				continue;
			}
			if (!variant.slots.length) {
				diagnostics.push(
					diagnostic(
						"FUNDAMENTAL_SLOTS_REQUIRED",
						"values.fundamental.slotsRequired",
						{
							groupId: group.id,
							variantId: variant.id,
						},
					),
				);
				continue;
			}
			if ((variant.connectors?.length ?? 0) > variant.slots.length - 1) {
				diagnostics.push(
					diagnostic(
						"FUNDAMENTAL_CONNECTOR_ARITY",
						"values.fundamental.connectorArity",
						{
							groupId: group.id,
							variantId: variant.id,
							connectors: variant.connectors?.length ?? 0,
							slots: variant.slots.length,
						},
					),
				);
				continue;
			}
			if (variant.slots.length > 1 && !variant.connectors?.length) {
				diagnostics.push(
					diagnostic(
						"FUNDAMENTAL_CONNECTOR_REQUIRED",
						"values.fundamental.connectorRequired",
						{
							groupId: group.id,
							variantId: variant.id,
						},
					),
				);
				continue;
			}

			const patternIds: string[] = [];
			const parts: string[] = [];
			const prefix = alternativesSource(
				variant.prefix,
				"prefix",
				group.id,
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
					group.id,
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
				group.id,
				variant.id,
				diagnostics,
			);
			if (postfix) {
				parts.push("\\s*", postfix);
				patternIds.push(
					...(variant.postfix ?? []).map((pattern) => pattern.id),
				);
			}

			const caseInsensitive = [
				...(variant.prefix ?? []),
				...(variant.connectors ?? []).flat(),
				...(variant.postfix ?? []),
			].some((pattern) => pattern.caseSensitive === false);
			try {
				variants.push({
					groupId: group.id,
					variantId: variant.id,
					slots: variant.slots,
					regex: getCompiledRegex(
						`^${parts.join("")}$`,
						`${caseInsensitive ? "i" : ""}ud`,
					),
					...(variant.priority === undefined
						? {}
						: { priority: variant.priority }),
					patternIds: Object.freeze(patternIds),
				});
			} catch {
				diagnostics.push(
					diagnostic(
						"FUNDAMENTAL_REGEX_INVALID",
						"values.fundamental.regexInvalid",
						{
							groupId: group.id,
							variantId: variant.id,
						},
					),
				);
			}
		}
	}

	return {
		variants: Object.freeze(variants),
		diagnostics: Object.freeze(diagnostics),
	};
}

/** Extracts a complete configured fundamental without interpreting its slots. */
export function extractFundamental(
	input: string,
	compiled: CompiledFundamentalVariant,
): FundamentalExtraction | undefined {
	const match = compiled.regex.exec(input.trim());
	if (!match?.groups) return undefined;
	const slots: Record<string, string> = {};
	const slotSpans: Record<string, { start: number; end: number }> = {};
	for (let index = 0; index < compiled.slots.length; index++) {
		const slot = compiled.slots[index]!;
		const value =
			match.groups[`f_${index}_${slot.id.replace(/[^A-Za-z0-9_]/g, "_")}`];
		if (value === undefined) return undefined;
		slots[slot.id] = value.trim();
		const span =
			match.indices?.groups?.[
				`f_${index}_${slot.id.replace(/[^A-Za-z0-9_]/g, "_")}`
			];
		if (span) slotSpans[slot.id] = { start: span[0], end: span[1] };
	}
	return {
		groupId: compiled.groupId,
		variantId: compiled.variantId,
		slots,
		slotSpans,
		matchedPatterns: compiled.patternIds,
		...(compiled.priority === undefined ? {} : { priority: compiled.priority }),
	};
}
