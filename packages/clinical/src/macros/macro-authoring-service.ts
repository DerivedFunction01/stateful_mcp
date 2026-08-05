import type { SchemaRegistry } from "../schemas/schema-registry";
import type { ConceptLookup } from "../values/concept-value";
import {
	type MacroExpressionCandidate,
	selectUnambiguousExpression,
} from "./macro-authoring-projection";
import type { MacroInput } from "./macro-binding";
import { MacroCompiler, type MacroCompilerOptions } from "./macro-compiler";
import type { MacroDefinition, MacroStore } from "./macro-definition";
import type { MacroDraftPreview } from "./macro-draft-preview";
import { compileMacroDraftPreview } from "./macro-draft-preview";
import { parseMacroLine } from "./macro-input-parser";
import type { SyntaxProfile } from "./macro-profile";
import {
	applyMacroLocks,
	type MacroLockLike,
	type MacroSlotProjection,
	projectMacroSlots,
} from "./macro-slots";

export interface MacroAuthoringServiceDeps {
	macros: MacroStore;
	registry: SchemaRegistry;
	dictionary?: ConceptLookup;
	profile: SyntaxProfile;
}

export interface MacroDraftCompileOptions extends MacroCompilerOptions {
	personnelId?: string;
	locks?: readonly MacroLockLike[];
}

export interface MacroDraftInspection {
	definition: MacroDefinition;
	slots: MacroSlotProjection[];
	childDefinitions: MacroDefinition[];
}

export interface MacroAcceptedLock extends MacroLockLike {
	rawText: string;
	source: "accepted";
	binding: NonNullable<MacroLockLike["binding"]>;
}

/** Shared definition-aware compilation entry point for macro authoring. */
export class MacroAuthoringService {
	private readonly compiler: MacroCompiler;

	constructor(private readonly deps: MacroAuthoringServiceDeps) {
		this.compiler = new MacroCompiler({
			registry: deps.registry,
			dictionary: deps.dictionary,
		});
	}

	async inspectDraft(
		rawText: string,
		locks: readonly MacroLockLike[] = [],
		personnelId?: string,
	): Promise<MacroDraftInspection | undefined> {
		const input = rawText.trim();
		if (!input) return undefined;
		const envelope = parseMacroLine(input, 0, { profile: this.deps.profile });
		if (!envelope) return undefined;
		const definition = await this.deps.macros.get(envelope.macroName, {
			personnelId,
			profileId: this.deps.profile.profileId,
		});
		if (!definition) return undefined;
		const slots = applyMacroLocks(
			projectMacroSlots(input, definition, this.deps.profile),
			locks,
			undefined,
			input,
			definition,
		);
		const childDefinitions = (
			await Promise.all(
				(definition.children ?? []).map((child) =>
					this.deps.macros.get(child.childMacroName).catch(() => null),
				),
			)
		).filter((child): child is MacroDefinition => child !== null);
		return { definition, slots, childDefinitions };
	}

	async resolveExpressionLocks(
		rawText: string,
		definition: MacroDefinition,
		slots: readonly MacroSlotProjection[],
		existingLocks: readonly MacroLockLike[] = [],
	): Promise<MacroAcceptedLock[]> {
		const search = this.deps.dictionary?.searchExpressionCandidates;
		if (!search) return [];
		const tokens = [...rawText.matchAll(/\S+/g)].map((match) => ({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
		}));
		const expressionTokens = [
			this.deps.profile.expressionToken,
			this.deps.profile.conceptToken,
		].filter((token): token is string => Boolean(token));
		const locks: MacroAcceptedLock[] = [];
		const conceptArguments = definition.arguments.filter(
			(argument) =>
				argument.extraction.kind === "concept" ||
				argument.extraction.kind === "concept_array",
		);
		for (const argument of conceptArguments) {
			for (const token of tokens) {
				const tokenText = rawText.slice(token.start, token.end);
				const configuredToken = expressionTokens.find((value) =>
					tokenText.toLocaleLowerCase().startsWith(value.toLocaleLowerCase()),
				);
				const lookupStart = configuredToken
					? token.start + configuredToken.length
					: token.start;
				const prefix = rawText.slice(lookupStart, token.end);
				if (!prefix.trim()) continue;
				const expressions = (await search.call(this.deps.dictionary, {
					lookupPrefix: prefix.toLocaleLowerCase(),
					targetAssignments: [argument.roleName],
					activeOnly: true,
					limit: 20,
				})) as MacroExpressionCandidate[];
				const expression = selectUnambiguousExpression(
					expressions,
					rawText.slice(lookupStart),
				);
				if (!expression?.conceptId) continue;
				const lookupTerm = expression.lookupTerm ?? expression.term;
				const acceptedRawText = rawText.slice(
					token.start,
					lookupStart + lookupTerm.length,
				);
				locks.push({
					argumentId: argument.argumentId,
					macroId: definition.macroId,
					macroVersion: definition.version,
					start: token.start,
					end: token.start + acceptedRawText.length,
					rawText: acceptedRawText,
					source: "accepted",
					binding: {
						kind: "custom-expression",
						conceptId: expression.conceptId,
						expressionId: expression.id,
						lookupTerm,
						displayValue: expression.term,
					},
				});
			}
		}
		for (const slot of slots) {
			const argument = definition.arguments.find(
				(candidate) => candidate.argumentId === slot.argumentId,
			);
			if (
				!argument ||
				(argument.extraction.kind !== "concept" &&
					argument.extraction.kind !== "concept_array") ||
				slot.status === "locked" ||
				!slot.rawText.trim()
			)
				continue;
			const hasExpressionToken = expressionTokens.some((token) =>
				slot.rawText
					.trimStart()
					.toLocaleLowerCase()
					.startsWith(token.toLocaleLowerCase()),
			);
			const isExplicitSource =
				slot.bindingSource === "friendly" ||
				slot.bindingSource === "rule" ||
				slot.bindingSource === "accepted" ||
				slot.bindingSource === "named" ||
				hasExpressionToken;
			if (!isExplicitSource) continue;
			const expressionToken = this.deps.profile.expressionToken ?? "";
			const lookupTerm = slot.rawText.trim().startsWith(expressionToken)
				? slot.rawText.trim().slice(expressionToken.length).trim()
				: slot.rawText.trim();
			const expressions = (await search.call(this.deps.dictionary, {
				lookupPrefix: lookupTerm.toLocaleLowerCase().split(/\s+/)[0],
				targetAssignments: [argument.roleName],
				activeOnly: true,
				limit: 20,
			})) as MacroExpressionCandidate[];
			const expression = selectUnambiguousExpression(expressions, lookupTerm);
			if (!expression?.conceptId) continue;
			const expressionText = expression.lookupTerm ?? expression.term;
			const lockedRawText = slot.rawText.trimStart().startsWith(expressionToken)
				? `${expressionToken}${expressionText}`
				: expressionText;
			const alreadyLocked = existingLocks.some(
				(lock) =>
					lock.macroId === slot.macroId &&
					lock.macroVersion === slot.macroVersion &&
					lock.argumentId === slot.argumentId &&
					lock.start === slot.start &&
					lock.end === slot.end,
			);
			if (alreadyLocked) continue;
			locks.push({
				argumentId: slot.argumentId,
				macroId: slot.macroId,
				macroVersion: slot.macroVersion,
				start: slot.start,
				end: slot.start + lockedRawText.length,
				rawText: lockedRawText,
				source: "accepted",
				binding: {
					kind: "custom-expression",
					conceptId: expression.conceptId,
					expressionId: expression.id,
					lookupTerm: expressionText,
					displayValue: expression.term,
				},
			});
		}
		return locks;
	}

	async compileDraft(
		rawText: string,
		options: MacroDraftCompileOptions = {},
	): Promise<MacroDraftPreview | undefined> {
		const input = rawText.trim();
		if (!input) return undefined;
		const envelope = parseMacroLine(input, 0, { profile: this.deps.profile });
		if (!envelope) return undefined;
		const definition = await this.deps.macros.get(envelope.macroName, {
			personnelId: options.personnelId,
			profileId: options.profileId ?? this.deps.profile.profileId,
		});
		if (!definition) return undefined;
		const parsed = parseMacroLine(input, 0, {
			definition,
			profile: this.deps.profile,
		});
		if (!parsed) return undefined;
		const lockedInput = applyLocksToParsedInput(parsed, options.locks ?? []);
		return compileMacroDraftPreview(
			this.compiler,
			lockedInput,
			definition,
			options,
		);
	}
}

function applyLocksToParsedInput(
	input: MacroInput,
	locks: readonly MacroLockLike[],
): MacroInput {
	if (locks.length === 0) return input;
	const arguments_ = input.arguments.map((argument) => {
		const lock = locks.find(
			(candidate) =>
				candidate.argumentId === argument.match?.argumentId &&
				candidate.rawText !== undefined,
		);
		if (!lock) return argument;
		const match = argument.match
			? {
					...argument.match,
					rawValue: lock.rawText ?? argument.rawValue,
					extraction: { start: lock.start, end: lock.end },
				}
			: argument.match;
		return {
			...argument,
			rawValue: lock.rawText ?? argument.rawValue,
			start: lock.start,
			end: lock.end,
			match,
		};
	});
	return {
		...input,
		arguments: arguments_,
		matches: arguments_.flatMap((argument) =>
			argument.match ? [argument.match] : [],
		),
	};
}
