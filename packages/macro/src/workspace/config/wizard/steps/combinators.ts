import type {
	RecipeNodeDto,
	ValueAuthoringProfileDto,
	ValueCatalogDto,
	ValueRecipeDto,
} from "@stateful-mcp/macro-protocol";
import { getCollectionEntries, setEntryPriority } from "../collections";
import type { WizardCollectionKey } from "../state";

/**
 * Read-mostly combinator step. Nodes are listed from `recipe.capability` +
 * `outputBuilderId`; child references validate against the catalog and prior
 * recipes with a client-side cycle check mirroring the compiler. Complex
 * combinator graph construction stays deferred (priority edits only).
 */
export type CombinatorIssueCode =
	| "UNKNOWN_TERMINAL"
	| "UNKNOWN_GROUP"
	| "RECIPE_CYCLE"
	| "UNKNOWN_RECIPE";

export interface CombinatorIssue {
	readonly code: CombinatorIssueCode;
	readonly recipeId: string;
	readonly reference?: string;
}

export interface CombinatorNodeView {
	readonly recipeId: string;
	readonly priority: number | null;
	readonly enabled: boolean;
	readonly outputBuilderId: string | null;
	readonly capability: ValueRecipeDto["capability"] | null;
	readonly issues: readonly CombinatorIssue[];
}

function fundamentalGroupIds(
	profile: ValueAuthoringProfileDto,
): ReadonlySet<string> {
	return new Set(
		getCollectionEntries(profile, "fundamentals").map((entry) => entry.id),
	);
}

function referencedRecipe(
	profile: ValueAuthoringProfileDto,
	id: string,
): ValueRecipeDto | null {
	const found = getCollectionEntries(
		profile,
		"recipes" as WizardCollectionKey,
	).find((candidate) => candidate.id === id);
	return found ? (found as ValueRecipeDto) : null;
}

function walkNodeIssues(
	node: RecipeNodeDto,
	context: {
		profile: ValueAuthoringProfileDto;
		catalog: ValueCatalogDto | null;
		groupIds: ReadonlySet<string>;
		recipeIds: ReadonlySet<string>;
		recipeId: string;
	},
	stack: ReadonlySet<string>,
	issues: CombinatorIssue[],
): void {
	switch (node.kind) {
		case "terminal": {
			const terminals = context.catalog?.terminalIds;
			if (terminals && !terminals.includes(node.consumerId)) {
				issues.push({
					code: "UNKNOWN_TERMINAL",
					recipeId: context.recipeId,
					reference: node.consumerId,
				});
			}
			break;
		}
		case "recipe": {
			if (stack.has(node.recipeId)) {
				issues.push({
					code: "RECIPE_CYCLE",
					recipeId: context.recipeId,
					reference: node.recipeId,
				});
				return;
			}
			if (!context.recipeIds.has(node.recipeId)) {
				issues.push({
					code: "UNKNOWN_RECIPE",
					recipeId: context.recipeId,
					reference: node.recipeId,
				});
				return;
			}
			const referenced = referencedRecipe(context.profile, node.recipeId);
			if (!referenced) return;
			walkNodeIssues(
				referenced.root,
				context,
				new Set([...stack, node.recipeId]),
				issues,
			);
			break;
		}
		case "fundamental": {
			if (!context.groupIds.has(node.groupId)) {
				issues.push({
					code: "UNKNOWN_GROUP",
					recipeId: context.recipeId,
					reference: node.groupId,
				});
			}
			for (const child of node.children ?? []) {
				walkNodeIssues(child, context, stack, issues);
			}
			break;
		}
	}
}

/**
 * Validates child references against catalog IDs, fundamentals, and prior
 * recipes with a cycle check mirroring the compiler. Returns `ok:false` when
 * the graph cannot be proven resolvable against available knowledge; with no
 * catalog the guard surfaces catalog unavailability instead of references.
 */
export function isRecipeReferenceGraphResolvable(
	profile: ValueAuthoringProfileDto,
	catalog: ValueCatalogDto | null,
): { ok: boolean; issues: readonly CombinatorIssue[] } {
	const recipes = getCollectionEntries(
		profile,
		"recipes" as WizardCollectionKey,
	).map((entry) => entry as ValueRecipeDto);
	const groupIds = fundamentalGroupIds(profile);
	const recipeIds = new Set(recipes.map((recipe) => recipe.id));
	const issues: CombinatorIssue[] = [];
	for (const recipe of recipes) {
		walkNodeIssues(
			recipe.root,
			{
				profile,
				catalog,
				groupIds,
				recipeIds,
				recipeId: recipe.id,
			},
			new Set(),
			issues,
		);
	}
	return { ok: issues.length === 0, issues };
}

export function listCombinatorNodes(
	profile: ValueAuthoringProfileDto,
	catalog: ValueCatalogDto | null = null,
): readonly CombinatorNodeView[] {
	const recipes = getCollectionEntries(
		profile,
		"recipes" as WizardCollectionKey,
	).map((entry) => entry as ValueRecipeDto);
	const groupIds = fundamentalGroupIds(profile);
	const recipeIds = new Set(recipes.map((recipe) => recipe.id));
	return recipes.map((recipe) => {
		const issues: CombinatorIssue[] = [];
		walkNodeIssues(
			recipe.root,
			{ profile, catalog, groupIds, recipeIds, recipeId: recipe.id },
			new Set(),
			issues,
		);
		return {
			recipeId: recipe.id,
			priority: typeof recipe.priority === "number" ? recipe.priority : null,
			enabled: recipe.enabled !== false,
			outputBuilderId: recipe.outputBuilderId ?? null,
			capability: recipe.capability ?? null,
			issues,
		};
	});
}

export function setRecipePriority(
	profile: ValueAuthoringProfileDto,
	recipeId: string,
	priority: number | null,
): ValueAuthoringProfileDto {
	return setEntryPriority(profile, "recipes", recipeId, priority);
}
