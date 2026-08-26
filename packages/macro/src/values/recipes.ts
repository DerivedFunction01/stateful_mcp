import type {
	ErrorDescriptor,
	MessageParam,
} from "@stateful-mcp/macro-protocol";
import type {
	CompiledArgumentPolicy,
	CompiledDomainGrammar,
} from "../contracts/extension-config";
import {
	type CompiledFundamentalVariant,
	compileFundamentalGroups,
	extractFundamental,
	type FundamentalGroup,
} from "./fundamentals";

export type RecipeNode =
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variantIds?: readonly string[];
			readonly children: readonly RecipeNode[];
	  }
	| { readonly kind: "terminal"; readonly consumerId: string };

export interface RecipeReferenceNode {
	readonly kind: "recipe";
	readonly recipeId: string;
}

export type RecipeNodeWithReferences = RecipeNode | RecipeReferenceNode;

export interface ValueRecipe {
	readonly id: string;
	readonly root: RecipeNodeWithReferences;
	readonly priority?: number;
	/** Registered executable builder for the value produced by a structured root. */
	readonly outputBuilderId?: string;
}

export interface ConsumerRecipePolicy {
	readonly enabledRecipes: readonly string[];
	readonly priorityOverrides?: Readonly<Record<string, number>>;
}

export interface RecipeDiagnostic extends ErrorDescriptor {
	readonly errorCode?: string;
	readonly recipeId?: string;
	readonly groupId?: string;
	readonly variantId?: string;
}

export interface CompiledRecipe {
	readonly id: string;
	readonly priority?: number;
	readonly outputBuilderId?: string;
	readonly root: CompiledRecipeNode;
}

export type CompiledRecipeNode =
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variants: readonly CompiledFundamentalVariant[];
			readonly children: readonly CompiledRecipeNode[];
	  }
	| { readonly kind: "terminal"; readonly consumerId: string };

export interface RecipeCompileResult {
	readonly recipes: readonly CompiledRecipe[];
	readonly diagnostics: readonly RecipeDiagnostic[];
}

export interface RecipeCompileOptions {
	/** Registered terminal IDs available to the compiled runtime. */
	readonly terminalIds?: ReadonlySet<string>;
	readonly outputBuilderIds?: ReadonlySet<string>;
}

export interface RecipeCandidate {
	readonly recipeId: string;
	readonly variantPath: readonly string[];
	readonly priority: number;
	readonly explicitPriority: boolean;
	readonly captures: Readonly<Record<string, string>>;
	readonly captureSpans: Readonly<
		Record<string, { start: number; end: number }>
	>;
	readonly evaluation: RecipeEvaluation;
	readonly canonicalValue?: unknown;
	readonly displayValue?: string;
	readonly diagnostics: readonly RecipeDiagnostic[];
}

export interface RecipeParseResult {
	readonly candidates: readonly RecipeCandidate[];
	readonly selected?: RecipeCandidate;
	readonly ambiguous: boolean;
	readonly diagnostics: readonly RecipeDiagnostic[];
}

export interface TerminalParseRequest {
	readonly consumerId: string;
	readonly input: string;
	readonly recipeId?: string;
	readonly slotId?: string;
	readonly grammar?: CompiledDomainGrammar;
	readonly policy?: CompiledArgumentPolicy;
	readonly context?: Readonly<Record<string, unknown>>;
}

export interface TerminalParseResult {
	readonly valid: boolean;
	readonly value?: unknown;
	readonly canonicalValue?: unknown;
	readonly displayValue?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
	readonly diagnostics?: readonly RecipeDiagnostic[];
	readonly stable?: boolean;
}

/**
 * The third request argument is optional so existing terminal functions can
 * be migrated independently without changing the recipe evaluator again.
 */
export type TerminalParser = (
	consumerId: string,
	input: string,
	request?: TerminalParseRequest,
) => TerminalParseResult;

export type RecipeEvaluation =
	| {
			readonly kind: "terminal";
			readonly consumerId: string;
			readonly input: string;
			readonly value?: unknown;
			readonly displayValue?: string;
			readonly metadata?: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly kind: "fundamental";
			readonly groupId: string;
			readonly variantId: string;
			readonly slots: Readonly<Record<string, RecipeEvaluation>>;
			readonly captures: Readonly<Record<string, string>>;
			readonly captureSpans: Readonly<
				Record<string, { start: number; end: number }>
			>;
	  };

export interface RecipeOutputBuilderContext {
	readonly recipeId: string;
	readonly input: string;
	readonly evaluation: RecipeEvaluation;
	readonly captures: Readonly<Record<string, string>>;
}

export interface RecipeOutputBuilderResult {
	readonly valid: boolean;
	readonly value?: unknown;
	readonly displayValue?: string;
	readonly diagnostics?: readonly RecipeDiagnostic[];
}

export type RecipeOutputBuilder = (
	context: RecipeOutputBuilderContext,
) => RecipeOutputBuilderResult;

function diagnostic(
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
				{
					groupId: node.groupId,
				},
				{ recipeId },
			),
		);
		return undefined;
	}
	const variants = compileFundamentalGroups([group]);
	for (const item of variants.diagnostics) {
		diagnostics.push({ ...item, recipeId });
	}
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
	const compiled: CompiledRecipe[] = [];
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
		});
	}
	return {
		recipes: Object.freeze(compiled),
		diagnostics: Object.freeze(diagnostics),
	};
}

interface NodeEvaluation {
	readonly valid: boolean;
	readonly captures: Record<string, string>;
	readonly captureSpans: Record<string, { start: number; end: number }>;
	readonly evaluation?: RecipeEvaluation;
	readonly variantPath: string[];
	readonly diagnostics: RecipeDiagnostic[];
}

function evaluateNode(
	node: CompiledRecipeNode,
	input: string,
	parseTerminal: TerminalParser,
	recipeId: string,
	slotId?: string,
): NodeEvaluation[] {
	if (node.kind === "terminal") {
		const result = parseTerminal(node.consumerId, input, {
			consumerId: node.consumerId,
			input,
			recipeId,
			slotId,
		});
		return result.valid
			? [
					{
						valid: true,
						captures: {},
						captureSpans: {},
						evaluation: {
							kind: "terminal",
							consumerId: node.consumerId,
							input,
							value: result.canonicalValue ?? result.value,
							displayValue: result.displayValue,
							metadata: result.metadata,
						},
						variantPath: [],
						diagnostics: [...(result.diagnostics ?? [])],
					},
				]
			: [];
	}
	const results: NodeEvaluation[] = [];
	for (const variant of node.variants) {
		const extraction = extractFundamental(input, variant);
		if (!extraction) continue;
		const childResults: NodeEvaluation[][] = node.children.map((child, index) =>
			evaluateNode(
				child,
				extraction.slots[variant.slots[index]?.id ?? ""] ?? "",
				parseTerminal,
				recipeId,
				variant.slots[index]?.id,
			),
		);
		if (childResults.some((items) => items.length === 0)) continue;
		for (const combination of cartesianEvaluations(childResults)) {
			const slots: Record<string, RecipeEvaluation> = {};
			const captures: Record<string, string> = { ...extraction.slots };
			const captureSpans = { ...extraction.slotSpans };
			const diagnostics: RecipeDiagnostic[] = [];
			let variantPath = [variant.variantId];
			for (let index = 0; index < combination.length; index++) {
				const slot = variant.slots[index]!;
				const child = combination[index]!;
				if (child.evaluation) slots[slot.id] = child.evaluation;
				Object.assign(captures, child.captures);
				Object.assign(captureSpans, child.captureSpans);
				diagnostics.push(...child.diagnostics);
				variantPath = [...variantPath, ...child.variantPath];
			}
			results.push({
				valid: true,
				captures,
				captureSpans,
				evaluation: {
					kind: "fundamental",
					groupId: node.groupId,
					variantId: variant.variantId,
					slots,
					captures,
					captureSpans,
				},
				variantPath,
				diagnostics,
			});
		}
	}
	return results;
}

function cartesianEvaluations(
	values: readonly NodeEvaluation[][],
): NodeEvaluation[][] {
	return values.reduce<NodeEvaluation[][]>(
		(results, current) =>
			results.flatMap((prefix) => current.map((value) => [...prefix, value])),
		[[]],
	);
}

export function parseValueRecipes(
	input: string,
	recipes: readonly CompiledRecipe[],
	policy: ConsumerRecipePolicy,
	parseTerminal: TerminalParser,
	outputBuilders: Readonly<Record<string, RecipeOutputBuilder>> = {},
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
			let canonicalValue =
				terminalValues.length === 1 ? terminalValues[0] : undefined;
			let displayValue: string | undefined;
			let candidateDiagnostics = [...evaluated.diagnostics];
			if (recipe.outputBuilderId) {
				const builder = outputBuilders[recipe.outputBuilderId];
				if (!builder) {
					const missingBuilder = diagnostic(
						"UNKNOWN_OUTPUT_BUILDER",
						"values.recipe.unknownOutputBuilder",
						{ builderId: recipe.outputBuilderId },
						{ recipeId: recipe.id },
					);
					diagnostics.push(missingBuilder);
					continue;
				}
				const built = builder({
					recipeId: recipe.id,
					input,
					evaluation: evaluated.evaluation!,
					captures: evaluated.captures,
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
		diagnostics: Object.freeze(diagnostics),
	};
}

function flattenEvaluationValues(
	evaluation: RecipeEvaluation | undefined,
): unknown[] {
	if (!evaluation) return [];
	if (evaluation.kind === "terminal") return [evaluation.value];
	return Object.values(evaluation.slots).flatMap((slot) =>
		flattenEvaluationValues(slot),
	);
}
