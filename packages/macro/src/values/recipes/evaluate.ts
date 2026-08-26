import { extractFundamental } from "../fundamentals";
import type {
	AsyncTerminalParser,
	CompiledRecipeNode,
	RecipeDiagnostic,
	RecipeEvaluation,
	TerminalParser,
} from "./types";

export interface NodeEvaluation {
	readonly valid: boolean;
	readonly captures: Record<string, string>;
	readonly captureSpans: Record<string, { start: number; end: number }>;
	readonly evaluation?: RecipeEvaluation;
	readonly variantPath: string[];
	readonly diagnostics: RecipeDiagnostic[];
}

function terminalEvaluation(
	result: Awaited<ReturnType<AsyncTerminalParser>>,
	consumerId: string,
	input: string,
): NodeEvaluation[] {
	return result.valid
		? [
				{
					valid: true,
					captures: {},
					captureSpans: {},
					evaluation: {
						kind: "terminal",
						consumerId,
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

export function evaluateNode(
	node: CompiledRecipeNode,
	input: string,
	parseTerminal: TerminalParser,
	recipeId: string,
	slotId?: string,
): NodeEvaluation[] {
	if (node.kind === "terminal") {
		return terminalEvaluation(
			parseTerminal(node.consumerId, input, {
				consumerId: node.consumerId,
				input,
				recipeId,
				slotId,
			}),
			node.consumerId,
			input,
		);
	}
	const results: NodeEvaluation[] = [];
	for (const variant of node.variants) {
		const extraction = extractFundamental(input, variant);
		if (!extraction) continue;
		const childResults = node.children.map((child, index) =>
			evaluateNode(
				child,
				extraction.slots[variant.slots[index]?.id ?? ""] ?? "",
				parseTerminal,
				recipeId,
				variant.slots[index]?.id,
			),
		);
		if (childResults.some((items) => items.length === 0)) continue;
		for (const combination of cartesianEvaluations(childResults))
			results.push(
				combineEvaluation(variant, node.groupId, extraction, combination),
			);
	}
	return results;
}

export async function evaluateNodeAsync(
	node: CompiledRecipeNode,
	input: string,
	parseTerminal: AsyncTerminalParser,
	recipeId: string,
	slotId?: string,
): Promise<NodeEvaluation[]> {
	if (node.kind === "terminal")
		return terminalEvaluation(
			await parseTerminal(node.consumerId, input, {
				consumerId: node.consumerId,
				input,
				recipeId,
				slotId,
			}),
			node.consumerId,
			input,
		);
	const results: NodeEvaluation[] = [];
	for (const variant of node.variants) {
		const extraction = extractFundamental(input, variant);
		if (!extraction) continue;
		const childResults = await Promise.all(
			node.children.map((child, index) =>
				evaluateNodeAsync(
					child,
					extraction.slots[variant.slots[index]?.id ?? ""] ?? "",
					parseTerminal,
					recipeId,
					variant.slots[index]?.id,
				),
			),
		);
		if (childResults.some((items) => items.length === 0)) continue;
		for (const combination of cartesianEvaluations(childResults))
			results.push(
				combineEvaluation(variant, node.groupId, extraction, combination),
			);
	}
	return results;
}

function combineEvaluation(
	variant: {
		readonly variantId: string;
		readonly slots: readonly { readonly id: string }[];
	},
	groupId: string,
	extraction: {
		readonly slots: Record<string, string>;
		readonly slotSpans: Record<string, { start: number; end: number }>;
	},
	combination: NodeEvaluation[],
): NodeEvaluation {
	const slots: Record<string, RecipeEvaluation> = {};
	const captures = { ...extraction.slots };
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
	return {
		valid: true,
		captures,
		captureSpans,
		evaluation: {
			kind: "fundamental",
			groupId,
			variantId: variant.variantId,
			slots,
			captures,
			captureSpans,
		},
		variantPath,
		diagnostics,
	};
}

export function cartesianEvaluations(
	values: readonly NodeEvaluation[][],
): NodeEvaluation[][] {
	return values.reduce<NodeEvaluation[][]>(
		(results, current) =>
			results.flatMap((prefix) => current.map((value) => [...prefix, value])),
		[[]],
	);
}

export function flattenEvaluationValues(
	evaluation: RecipeEvaluation | undefined,
): unknown[] {
	if (!evaluation) return [];
	if (evaluation.kind === "terminal") return [evaluation.value];
	return Object.values(evaluation.slots).flatMap((slot) =>
		flattenEvaluationValues(slot),
	);
}
