import type { CompiledTemporalGrammar } from "../../setup/temporal-grammar-compiler";
import type { NumericalSyntaxProfile } from "../../values/numerical-syntax-profile";
import type { TypedValue } from "../../values/typed-value";
import type { MacroInput } from "../macro-binding";
import type {
	MacroChildDefinition,
	MacroDefinition,
} from "../macro-definition";
import type { MacroTargetOperation } from "../macro-plan";

export interface ChildExecutorResult {
	value?: TypedValue;
	operations: MacroTargetOperation[];
	diagnostics: string[];
	sourceSpan?: { start: number; end: number; rawValue: string };
}

export interface ChildExecutorContext {
	parentInput: MacroInput;
	parentDefinition: MacroDefinition;
	childDefinition: MacroChildDefinition;
	childMacroDefinition?: MacroDefinition;
	profile?: NumericalSyntaxProfile;
	compiledGrammar?: CompiledTemporalGrammar;
	sourceLine?: number;
	groupId: string;
}

export interface ChildMacroExecutor {
	execute(context: ChildExecutorContext): Promise<ChildExecutorResult>;
}

export function resolveChildInputSpan(
	context: ChildExecutorContext,
): { rawValue: string; start?: number; end?: number } | undefined {
	const { parentInput, parentDefinition, childDefinition } = context;
	const inputContract = childDefinition.input;

	if (!inputContract || inputContract.mode === "standalone") {
		if (parentInput.body)
			return {
				rawValue: parentInput.body.raw,
				start: parentInput.body.start,
				end: parentInput.body.end,
			};
		const fullText = parentInput.sourceLines.map((l) => l.raw).join("\n");
		const spaceIndex = fullText.indexOf(" ");
		if (spaceIndex !== -1) {
			const rawValue = fullText.slice(spaceIndex + 1).trim();
			if (rawValue)
				return { rawValue, start: spaceIndex + 1, end: fullText.length };
		}
		return undefined;
	}

	if (inputContract.mode === "named") {
		const argSpec = parentDefinition.arguments.find(
			(a) =>
				a.argumentId === inputContract.argumentId ||
				(inputContract.aliases && inputContract.aliases.includes(a.name)),
		);
		const match = parentInput.arguments.find(
			(a) =>
				a.name === (argSpec?.name ?? inputContract.argumentId) ||
				(argSpec?.aliases && a.name && argSpec.aliases.includes(a.name)),
		);
		if (match)
			return { rawValue: match.rawValue, start: match.start, end: match.end };
		return undefined;
	}

	if (inputContract.mode === "positional") {
		const pos = inputContract.position ?? 0;
		const match =
			parentInput.arguments.find(
				(a) => a.position === pos || a.source === "positional",
			) ?? parentInput.arguments[pos];
		if (match)
			return { rawValue: match.rawValue, start: match.start, end: match.end };
		return undefined;
	}

	return undefined;
}
