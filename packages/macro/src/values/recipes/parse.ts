import { diagnostic } from "./compile";
import {
	evaluateNode,
	evaluateNodeAsync,
	flattenEvaluationValues,
} from "./evaluate";
import type {
	AsyncTerminalParser,
	CompiledRecipe,
	ConsumerRecipePolicy,
	RecipeCandidate,
	RecipeDiagnostic,
	RecipeOutputBuilder,
	RecipeOutputBuilderContext,
	RecipeParseResult,
	TerminalParser,
} from "./types";

type BuilderContext = Pick<
	RecipeOutputBuilderContext,
	"grammar" | "policy" | "context"
>;

function selectRecipeCandidates(
	candidates: readonly RecipeCandidate[],
	diagnostics: readonly RecipeDiagnostic[],
): RecipeParseResult {
	const ranked = [...candidates].sort(
		(left, right) => right.priority - left.priority,
	);
	const selected =
		ranked.length > 0 &&
		ranked
			.slice(1)
			.every((candidate) => candidate.priority < ranked[0]!.priority)
			? ranked[0]
			: undefined;
	return {
		candidates: Object.freeze(ranked),
		selected,
		ambiguous: ranked.length > 1 && selected === undefined,
		diagnostics: Object.freeze([...diagnostics]),
	};
}

export async function parseValueRecipesAsync(
	input: string,
	recipes: readonly CompiledRecipe[],
	policy: ConsumerRecipePolicy,
	parseTerminal: AsyncTerminalParser,
	outputBuilders: Readonly<Record<string, RecipeOutputBuilder>> = {},
	builderContext: BuilderContext = {},
): Promise<RecipeParseResult> {
	const candidates: RecipeCandidate[] = [];
	const diagnostics: RecipeDiagnostic[] = [];
	for (const recipe of recipes) {
		if (policy.enabledRecipes && !policy.enabledRecipes.includes(recipe.id))
			continue;
		for (const evaluated of await evaluateNodeAsync(
			recipe.root,
			input,
			parseTerminal,
			recipe.id,
		)) {
			if (!evaluated.evaluation) continue;
			const terminalValues = flattenEvaluationValues(evaluated.evaluation);
			let value: unknown =
				terminalValues.length === 1 ? terminalValues[0] : undefined;
			let displayValue: string | undefined;
			const candidateDiagnostics = [...evaluated.diagnostics];
			if (recipe.outputBuilderId) {
				const builder = outputBuilders[recipe.outputBuilderId];
				if (!builder) {
					diagnostics.push(
						diagnostic(
							"MISSING_BUILDER",
							"values.recipe.missingBuilder",
							{ builderId: recipe.outputBuilderId },
							{ recipeId: recipe.id },
						),
					);
					continue;
				}
				const built = builder({
					recipeId: recipe.id,
					input,
					evaluation: evaluated.evaluation,
					captures: evaluated.captures,
					...builderContext,
				});
				if (!built.valid) {
					candidateDiagnostics.push(...(built.diagnostics ?? []));
					continue;
				}
				value = built.value;
				displayValue = built.displayValue;
			}
			candidates.push({
				recipeId: recipe.id,
				canonicalValue: value,
				displayValue,
				captures: evaluated.captures,
				captureSpans: evaluated.captureSpans,
				evaluation: evaluated.evaluation,
				variantPath: evaluated.variantPath,
				priority: policy.priorityOverrides?.[recipe.id] ?? recipe.priority ?? 0,
				explicitPriority:
					policy.priorityOverrides?.[recipe.id] !== undefined ||
					recipe.priority !== undefined,
				diagnostics: candidateDiagnostics,
			});
		}
	}
	return selectRecipeCandidates(candidates, diagnostics);
}

export function parseValueRecipes(
	input: string,
	recipes: readonly CompiledRecipe[],
	policy: ConsumerRecipePolicy,
	parseTerminal: TerminalParser,
	outputBuilders: Readonly<Record<string, RecipeOutputBuilder>> = {},
	builderContext: BuilderContext = {},
): RecipeParseResult {
	const candidates: RecipeCandidate[] = [];
	const diagnostics: RecipeDiagnostic[] = [];
	for (const recipe of recipes) {
		if (!policy.enabledRecipes.includes(recipe.id)) continue;
		for (const evaluated of evaluateNode(
			recipe.root,
			input,
			parseTerminal,
			recipe.id,
		)) {
			const priority =
				policy.priorityOverrides?.[recipe.id] ?? recipe.priority ?? 0;
			const terminalValues = flattenEvaluationValues(evaluated.evaluation);
			let canonicalValue: unknown =
				terminalValues.length === 1 ? terminalValues[0] : undefined;
			let displayValue: string | undefined;
			let candidateDiagnostics = [...evaluated.diagnostics];
			if (recipe.outputBuilderId) {
				const builder = outputBuilders[recipe.outputBuilderId];
				if (!builder) {
					diagnostics.push(
						diagnostic(
							"UNKNOWN_OUTPUT_BUILDER",
							"values.recipe.unknownOutputBuilder",
							{ builderId: recipe.outputBuilderId },
							{ recipeId: recipe.id },
						),
					);
					continue;
				}
				const built = builder({
					recipeId: recipe.id,
					input,
					evaluation: evaluated.evaluation!,
					captures: evaluated.captures,
					...builderContext,
				});
				if (!built.valid) {
					candidateDiagnostics.push(...(built.diagnostics ?? []));
					continue;
				}
				canonicalValue = built.value;
				displayValue = built.displayValue;
				candidateDiagnostics = [
					...candidateDiagnostics,
					...(built.diagnostics ?? []),
				];
			}
			candidates.push({
				recipeId: recipe.id,
				variantPath: evaluated.variantPath,
				priority: typeof priority === "number" ? priority : 0,
				explicitPriority:
					policy.priorityOverrides?.[recipe.id] !== undefined ||
					recipe.priority !== undefined,
				captures: evaluated.captures,
				captureSpans: evaluated.captureSpans,
				evaluation: evaluated.evaluation!,
				canonicalValue,
				displayValue,
				diagnostics: candidateDiagnostics,
			});
		}
	}
	return selectRecipeCandidates(candidates, diagnostics);
}
