import type { AttributeParserRule } from "../../store/interfaces";
import type { ParserCommandMacro } from "../../store/parser/command-macros/interfaces";
import { evaluateMacroBoundary } from "./command-macro-boundary";
import {
	type CommandMacroCellPlan,
	extractCommandMacroValue,
} from "./command-macro-ir";
import {
	lexCommandMacro,
	type MacroArgumentToken,
} from "./command-macro-lexer";

export interface CommandMacroBindDiagnostic {
	message: string;
	argumentId?: string;
	tokenIndex?: number;
}
export interface CommandMacroBindResult {
	plan?: CommandMacroCellPlan;
	diagnostics: CommandMacroBindDiagnostic[];
	tokens: MacroArgumentToken[];
}

export function bindCommandMacro(
	input: string,
	macro: ParserCommandMacro,
	options: {
		groupId?: string;
		cellRef?: string;
		sourceLine?: number;
		attributeRules?: AttributeParserRule[];
	} = {},
): CommandMacroBindResult {
	const lexed = lexCommandMacro(input, macro);
	const diagnostics: CommandMacroBindDiagnostic[] = lexed.diagnostics.map(
		(item) => ({ message: item.message }),
	);
	const argumentsById = new Map<string, MacroArgumentToken>();
	const positional: MacroArgumentToken[] = [];
	for (const [index, token] of lexed.arguments.entries()) {
		const argumentId = token.argumentId;
		const argument = argumentId
			? macro.arguments.find(
					(candidate) =>
						candidate.argumentId === argumentId ||
						candidate.name === argumentId ||
						candidate.aliases?.includes(argumentId),
				)
			: undefined;
		if (argumentId && !argument) {
			diagnostics.push({
				message: `unknown argument '${argumentId}'`,
				tokenIndex: index,
			});
			continue;
		}
		if (argument) {
			if (
				argumentsById.has(argument.argumentId) &&
				argument.extraction.kind !== "array"
			)
				diagnostics.push({
					message: `duplicate scalar assignment '${argument.name}'`,
					argumentId: argument.argumentId,
					tokenIndex: index,
				});
			argumentsById.set(argument.argumentId, token);
		} else positional.push(token);
	}
	let positionalIndex = 0;
	for (const argument of macro.arguments
		.slice()
		.sort(
			(a, b) =>
				(a.position ?? Number.MAX_SAFE_INTEGER) -
				(b.position ?? Number.MAX_SAFE_INTEGER),
		)) {
		if (argumentsById.has(argument.argumentId)) continue;
		if (argument.binding?.positional === false) continue;
		const token = positional[positionalIndex++];
		if (token) argumentsById.set(argument.argumentId, token);
		else if (
			argument.required &&
			argument.blankPolicy !== "allow" &&
			argument.blankPolicy !== "skip"
		)
			diagnostics.push({
				message: `required argument '${argument.name}' is missing`,
				argumentId: argument.argumentId,
			});
	}
	if (positionalIndex < positional.length)
		diagnostics.push({
			message: "too many positional arguments",
			tokenIndex: positionalIndex,
		});
	if (diagnostics.length) return { diagnostics, tokens: lexed.arguments };
	const groupId = options.groupId ?? `macro:${macro.macroId}:${Date.now()}`;
	const cellRef = options.cellRef ?? `${groupId}:root`;
	const proseArgument = macro.arguments.find(
		(argument) => argument.extraction.kind === "prose",
	);
	const proseSpec =
		proseArgument?.extraction.kind === "prose"
			? proseArgument.extraction
			: undefined;
	if (lexed.prose && !proseArgument)
		diagnostics.push({
			message: "explicit prose boundary requires a prose argument",
		});
	if (diagnostics.length) return { diagnostics, tokens: lexed.arguments };
	const operations = [];
	for (const [index, argument] of macro.arguments.entries()) {
		const token = argumentsById.get(argument.argumentId);
		if (!token) continue;
		if (argument.boundary) {
			const anchorToken = macro.arguments
				.slice(0, index)
				.map((item) => argumentsById.get(item.argumentId))
				.filter(Boolean)
				.at(-1);
			const boundary = evaluateMacroBoundary(
				input,
				{ start: token.start, end: token.end },
				anchorToken
					? { start: anchorToken.start, end: anchorToken.end }
					: { start: 0, end: 0 },
				argument.boundary,
			);
			if (!boundary.accepted) {
				diagnostics.push(
					...boundary.reasons.map((message) => ({
						message: `argument '${argument.name}' boundary: ${message}`,
						argumentId: argument.argumentId,
					})),
				);
				continue;
			}
		}
		const value = extractCommandMacroValue(token.rawText, argument.extraction, {
			attributeRules: options.attributeRules,
		});
		if (value.diagnostics.length) {
			diagnostics.push(
				...value.diagnostics.map((message) => ({
					message,
					argumentId: argument.argumentId,
				})),
			);
			continue;
		}
		operations.push({
			operationId: `${groupId}:${argument.argumentId}`,
			groupId,
			cellRef,
			targetSchema: argument.target.targetSchema,
			targetPath: argument.target.targetPath,
			rawValue: token.rawText,
			value: value.value,
			sourceLine: options.sourceLine ?? 1,
			sourceArgument: index,
			evidence: value.evidence,
		});
	}
	if (diagnostics.length) return { diagnostics, tokens: lexed.arguments };
	return {
		tokens: lexed.arguments,
		diagnostics: [],
		plan: {
			cellRef,
			targetSchema: macro.root.targetSchema,
			rootTarget: macro.root.targetPath,
			operations,
			proseRegion:
				lexed.prose && proseArgument && proseSpec
					? { ...lexed.prose, targetSchema: proseSpec.targetSchema }
					: undefined,
		},
	};
}
