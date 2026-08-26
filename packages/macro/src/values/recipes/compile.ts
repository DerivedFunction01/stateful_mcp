import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { FundamentalGroup } from "../fundamentals";
import { compileFundamentalGroups } from "../fundamentals";
import type {
	CompiledRecipeNode,
	RecipeCompileOptions,
	RecipeCompileResult,
	RecipeDiagnostic,
	RecipeNodeWithReferences,
	ValueRecipe,
} from "./types";

export function diagnostic(
	errorCode: string,
	messageKey: string,
	messageParams: Readonly<Record<string, MessageParam>>,
	extra: Pick<RecipeDiagnostic, "recipeId" | "groupId" | "variantId"> = {},
): RecipeDiagnostic {
	return { errorCode, messageKey, messageParams, ...extra };
}

function compileNode(
	node: RecipeNodeWithReferences,
	groups: Readonly<Record<string, FundamentalGroup>>,
	recipes: Readonly<Record<string, ValueRecipe>>,
	recipeId: string,
	stack: ReadonlySet<string>,
	diagnostics: RecipeDiagnostic[],
	terminalIds?: ReadonlySet<string>,
): CompiledRecipeNode | undefined {
	if (node.kind === "recipe") {
		if (stack.has(node.recipeId)) {
			diagnostics.push(
				diagnostic(
					"RECIPE_CYCLE",
					"values.recipe.cycle",
					{ recipeId: node.recipeId },
					{ recipeId },
				),
			);
			return undefined;
		}
		const referenced = recipes[node.recipeId];
		if (!referenced) {
			diagnostics.push(
				diagnostic(
					"UNKNOWN_RECIPE",
					"values.recipe.unknownRecipe",
					{ recipeId: node.recipeId },
					{ recipeId },
				),
			);
			return undefined;
		}
		return compileNode(
			referenced.root,
			groups,
			recipes,
			node.recipeId,
			new Set([...stack, node.recipeId]),
			diagnostics,
			terminalIds,
		);
	}
	if (node.kind === "terminal") {
		if (terminalIds && !terminalIds.has(node.consumerId)) {
			diagnostics.push(
				diagnostic(
					"UNKNOWN_TERMINAL",
					"values.recipe.unknownTerminal",
					{ consumerId: node.consumerId },
					{ recipeId },
				),
			);
			return undefined;
		}
		return node;
	}
	const group = groups[node.groupId];
	if (!group) {
		diagnostics.push(
			diagnostic(
				"UNKNOWN_FUNDAMENTAL_GROUP",
				"values.recipe.unknownGroup",
				{ groupId: node.groupId },
				{ recipeId },
			),
		);
		return undefined;
	}
	const variants = compileFundamentalGroups([group]);
	for (const item of variants.diagnostics)
		diagnostics.push({ ...item, recipeId });
	const selected = node.variantIds
		? variants.variants.filter((variant) =>
				node.variantIds!.includes(variant.variantId),
			)
		: variants.variants;
	if (!selected.length) {
		diagnostics.push(
			diagnostic(
				"NO_FUNDAMENTAL_VARIANTS",
				"values.recipe.noVariants",
				{ groupId: node.groupId },
				{ recipeId, groupId: node.groupId },
			),
		);
		return undefined;
	}
	const children = node.children.map((child) =>
		compileNode(
			child,
			groups,
			recipes,
			recipeId,
			stack,
			diagnostics,
			terminalIds,
		),
	);
	if (children.some((child) => child === undefined)) return undefined;
	const arities = new Set(selected.map((variant) => variant.slots.length));
	if (arities.size > 1 || [...arities][0] !== children.length) {
		diagnostics.push(
			diagnostic(
				"RECIPE_SLOT_ARITY",
				"values.recipe.slotArity",
				{
					groupId: node.groupId,
					expected: [...arities].join(","),
					actual: children.length,
				},
				{ recipeId, groupId: node.groupId },
			),
		);
		return undefined;
	}
	return {
		kind: "fundamental",
		groupId: node.groupId,
		variants: selected,
		children: children as CompiledRecipeNode[],
	};
}

export function compileValueRecipes(
	groups: readonly FundamentalGroup[],
	recipes: readonly ValueRecipe[],
	options: RecipeCompileOptions = {},
): RecipeCompileResult {
	const diagnostics: RecipeDiagnostic[] = [];
	const groupMap = Object.fromEntries(groups.map((group) => [group.id, group]));
	const recipeMap = Object.fromEntries(
		recipes.map((recipe) => [recipe.id, recipe]),
	);
	const seen = new Set<string>();
	const compiled: import("./types").CompiledRecipe[] = [];
	for (const recipe of recipes) {
		if (seen.has(recipe.id)) {
			diagnostics.push(
				diagnostic(
					"DUPLICATE_RECIPE",
					"values.recipe.duplicate",
					{ id: recipe.id },
					{ recipeId: recipe.id },
				),
			);
			continue;
		}
		seen.add(recipe.id);
		if (
			recipe.outputBuilderId !== undefined &&
			options.outputBuilderIds &&
			!options.outputBuilderIds.has(recipe.outputBuilderId)
		) {
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
		const root = compileNode(
			recipe.root,
			groupMap,
			recipeMap,
			recipe.id,
			new Set([recipe.id]),
			diagnostics,
			options.terminalIds,
		);
		if (!root) continue;
		if (root.kind === "fundamental" && root.children.length === 0) {
			diagnostics.push(
				diagnostic(
					"RECIPE_TERMINAL_REQUIRED",
					"values.recipe.terminalRequired",
					{},
					{ recipeId: recipe.id },
				),
			);
			continue;
		}
		compiled.push({
			id: recipe.id,
			root,
			...(recipe.priority === undefined ? {} : { priority: recipe.priority }),
			...(recipe.outputBuilderId === undefined
				? {}
				: { outputBuilderId: recipe.outputBuilderId }),
			...(recipe.capability === undefined
				? {}
				: { capability: recipe.capability }),
		});
	}
	return {
		recipes: Object.freeze(compiled),
		diagnostics: Object.freeze(diagnostics),
	};
}
