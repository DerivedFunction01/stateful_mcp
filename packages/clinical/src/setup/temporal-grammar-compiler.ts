import type { TemporalSyntaxConfig } from "../values/numerical-syntax-profile";
import type { TemporalEnumKind } from "../values/temporal-enum-resolver";
import { compileTemporalEnumPattern } from "../values/temporal-enum-resolver";
import {
	buildDatePatternString,
	type DateTimeFormatConfig,
} from "../values/utils/date-regex-generator";
import type {
	SetupCompositionTemplate,
	SetupGapConstraint,
} from "./setup-types";

export interface CompiledTemporalGrammarPart {
	pattern: string;
	slotId?: string;
}

export interface CompiledTemporalGrammar {
	grammarId: string;
	version: number;
	slots: Record<
		string,
		{
			blockId: string;
			targetPath: string;
			matcher: { pattern: string; groupName: string; flags: string };
		}
	>;
	alternatives: Array<{
		alternativeId: string;
		parts: CompiledTemporalGrammarPart[];
		pattern: string;
		flags: string;
		precedence: number;
	}>;
	generatedAt: string;
}

export interface TemporalGrammarCompileInput {
	grammarId: string;
	template: SetupCompositionTemplate;
	slotPatterns: Record<
		string,
		{
			blockId: string;
			targetPath: string;
			pattern?: string;
			enumKind?: TemporalEnumKind;
			dateTimeConfig?: DateTimeFormatConfig;
		}
	>;
	stopWords?: readonly string[];
	profile?: TemporalSyntaxConfig;
}

export interface TemporalGrammarMatch {
	alternativeId: string;
	slots: Record<string, string>;
	precedence: number;
}

export function matchTemporalGrammar(
	grammar: CompiledTemporalGrammar,
	input: string,
): { match?: TemporalGrammarMatch; diagnostics: string[] } {
	const matches = grammar.alternatives.flatMap((alternative) => {
		const result = new RegExp(alternative.pattern, alternative.flags).exec(
			input,
		);
		if (!result?.groups) return [];
		const slots = Object.fromEntries(
			Object.entries(grammar.slots).flatMap(([slotId, slot]) => {
				const value = result.groups?.[slot.matcher.groupName];
				return value === undefined ? [] : [[slotId, value]];
			}),
		);
		return [
			{
				alternativeId: alternative.alternativeId,
				slots,
				precedence: alternative.precedence,
			},
		];
	});
	if (matches.length === 0)
		return {
			diagnostics: [
				`Input does not match temporal grammar '${grammar.grammarId}'`,
			],
		};
	const ordered = [...matches].sort(
		(left, right) => right.precedence - left.precedence,
	);
	if (ordered.length > 1 && ordered[0]!.precedence === ordered[1]!.precedence)
		return {
			diagnostics: [`Input matches multiple temporal grammar alternatives`],
		};
	return { match: ordered[0], diagnostics: [] };
}

import { buildPatternWithAnchors, escapeRegex } from "./regex-builder-helper";

export function compileTemporalGrammar(
	input: TemporalGrammarCompileInput,
): CompiledTemporalGrammar {
	const slots: CompiledTemporalGrammar["slots"] = {};
	const parts: CompiledTemporalGrammarPart[] = [];
	for (let index = 0; index < input.template.parts.length; index++) {
		const part = input.template.parts[index]!;
		if (part.kind === "literal") {
			parts.push({ pattern: compileLiteral(part.text, part.optional) });
			continue;
		}
		const slot = input.slotPatterns[part.slotId];
		if (!slot)
			throw new Error(`Missing temporal slot pattern '${part.slotId}'`);
		const enumPattern = slot.enumKind
			? (() => {
					if (!input.profile)
						throw new Error(
							`Missing temporal profile for enum slot '${part.slotId}'`,
						);
					return compileTemporalEnumPattern(slot.enumKind, input.profile);
				})()
			: undefined;
		const datePattern = slot.dateTimeConfig
			? stripAnchors(
					buildDatePatternString(
						slot.dateTimeConfig.tokens,
						slot.dateTimeConfig.separators,
						slot.dateTimeConfig.options,
					).pattern,
				)
			: undefined;
		const slotPattern = slot.pattern ?? enumPattern?.pattern ?? datePattern;
		if (!slotPattern)
			throw new Error(`Missing pattern for temporal slot '${part.slotId}'`);
		const groupName = safeGroupName(part.slotId);
		slots[part.slotId] = {
			blockId: slot.blockId,
			targetPath: slot.targetPath,
			matcher: {
				pattern: slotPattern,
				groupName,
				flags: enumPattern?.flags ?? "u",
			},
		};
		parts.push({
			slotId: part.slotId,
			pattern: `(?<${groupName}>${slotPattern})`,
		});
		const next = input.template.parts[index + 1];
		if (next?.kind === "slot") {
			const gap = input.template.gaps.find(
				(candidate) =>
					candidate.fromSlot === part.slotId &&
					candidate.toSlot === next.slotId,
			);
			if (gap) parts.push({ pattern: compileGap(gap, input.stopWords) });
		}
	}

	const body = parts.map((part) => part.pattern).join("\\s*");
	const pattern = buildPatternWithAnchors(body, {
		anchorStart: true,
		anchorEnd: true,
	});
	return {
		grammarId: input.grammarId,
		version: input.template.version,
		slots,
		alternatives: [
			{
				alternativeId: input.template.templateId,
				parts,
				pattern,
				flags: collectFlags(slots),
				precedence: input.template.precedence,
			},
		],
		generatedAt: new Date().toISOString(),
	};
}

function collectFlags(slots: CompiledTemporalGrammar["slots"]): string {
	const flags = new Set<string>(["u"]);
	for (const slot of Object.values(slots)) {
		for (const flag of slot.matcher.flags) flags.add(flag);
	}
	if (flags.has("i")) return "iu";
	return [...flags].join("");
}

function compileLiteral(text: string, optional = false): string {
	const escaped = escapeRegex(text).replace(/\s+/gu, "\\s+");
	return optional ? `(?:\\s+${escaped})?` : escaped;
}

function compileGap(
	gap: SetupGapConstraint,
	stopWords: readonly string[] = [],
): string {
	const min = gap.min ?? 0;
	const max = gap.max ?? min;
	if (gap.unit === "chars") {
		return `.{${min},${max}}`;
	}
	const forbiddenLookahead = gap.forbiddenWords?.length
		? `(?!\\s*(?:${gap.forbiddenWords.map(escapeRegex).join("|")})\\b)`
		: "";
	const vocabulary = gap.allowedWords?.length
		? gap.allowedWords
		: gap.skipStopWords
			? stopWords
			: undefined;
	const word = vocabulary?.length
		? `(?:${vocabulary.map(escapeRegex).join("|")})`
		: "[^\\s\\p{P}]+";
	const token =
		gap.unit === "items"
			? `${forbiddenLookahead}${word}`
			: `\\s+${forbiddenLookahead}${word}`;
	return `(?:${token}){${min},${max}}\\s*`;
}

function safeGroupName(value: string): string {
	const name = value.replace(/[^A-Za-z0-9_]/gu, "_");
	return /^[A-Za-z_]/u.test(name) ? name : `slot_${name}`;
}

function stripAnchors(pattern: string): string {
	return pattern.replace(/^(?:\^|\\b)/u, "").replace(/(?:\\b|\$)$/u, "");
}
