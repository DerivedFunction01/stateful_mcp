import type { DictionaryStore } from "@stateful-mcp/core";
import type {
	ParserMacroStore,
	ParserSyntaxProfile,
} from "../store/interfaces";
import type {
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionStore,
	SystemWeightStore,
} from "../store/learning/interfaces";
import type { ProfileTagStore } from "../store/parser/profiles/interfaces";
import type { TagRecord, TagStore } from "../store/parser/tags/interfaces";
import { parseTagMetadata } from "../store/parser/tags/interfaces";
import type {
	CommandAutocompleteContext,
	CommandAutocompleteSuggestion,
} from "../store/reference/auto-complete/command-autocomplete-interfaces";

const TRANSITION_TABLE = "autocomplete_transitions";

// ── Default scoring weights (used when SystemWeightStore is not available) ──

const DEFAULT_MAX_PRIORITY = 100;
const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_COLD_START_BASE_WEIGHT = 0.5;
const DEFAULT_COLD_START_PRIORITY_WEIGHT = 0.2;
const DEFAULT_COLD_START_AFFINITY_WEIGHT = 0.2;
const DEFAULT_COLD_START_DOMAIN_WEIGHT = 0.1;
const DEFAULT_LEARNED_BASE_WEIGHT = 0.3;
const DEFAULT_LEARNED_TRANSITION_WEIGHT = 0.5;
const DEFAULT_LEARNED_PRIORITY_WEIGHT = 0.2;

/**
 * Provides autocomplete suggestions for high-level parser commands
 * (tags, macros, variables, slash commands, terms).
 *
 * Phase 1 implements **tag** suggestions only. Other command kinds
 * are stubbed and return `[]` — they will be added in subsequent phases.
 *
 * Ranking formula (per plan D3):
 *
 * ```
 * baseScore = prefixMatchScore(prefix, tagName)            // 0.0–1.0
 *
 * coldStartScore =
 *   baseScore * 0.5
 *   + (metadata.priority ?? 0) / MAX_PRIORITY * 0.2
 *   + affinityOverlap(recentTargetSchemas, metadata.affinitySchemas ?? []) * 0.2
 *   + domainMatch(recentTargetSchemas, metadata.domain) * 0.1
 *
 * learnedScore =
 *   baseScore * 0.3
 *   + transitionDecayedScore * 0.5
 *   + (metadata.priority ?? 0) / MAX_PRIORITY * 0.2
 *
 * finalScore = transitionDataAvailable ? learnedScore : coldStartScore
 * ```
 */
export class CommandAutocompleteSuggester {
	constructor(
		private tagStore: TagStore,
		private profileTagStore: ProfileTagStore,
		private profile: ParserSyntaxProfile,
		private transitionStore?: AutocompleteTransitionStore,
		private weightStore?: SystemWeightStore,
		private macroStore?: ParserMacroStore,
		private dictionaryStore?: DictionaryStore,
	) {}

	// ── Public API ────────────────────────────────────────────────

	/**
	 * Suggest tags whose `tagName` starts with `prefix` (case-insensitive).
	 *
	 * Tags are scoped to the active profile via `ProfileTagStore`.
	 * If the profile has no tags or `profileId` is absent, falls back to
	 * all tags in `TagStore`.
	 *
	 * Scoring uses `tagBlob` metadata (priority, domain, affinitySchemas)
	 * and optional transition data from `AutocompleteTransitionStore`.
	 */
	async suggestTags(
		prefix: string,
		ctx?: CommandAutocompleteContext,
	): Promise<CommandAutocompleteSuggestion[]> {
		// 1. Resolve scoring weights (from SystemWeightStore or defaults)
		const maxPriority = await this.resolveWeight(
			"tag",
			"maxPriority",
			DEFAULT_MAX_PRIORITY,
		);
		const coldStartBaseWeight = await this.resolveWeight(
			"tag",
			"coldStartBaseWeight",
			DEFAULT_COLD_START_BASE_WEIGHT,
		);
		const coldStartPriorityWeight = await this.resolveWeight(
			"tag",
			"coldStartPriorityWeight",
			DEFAULT_COLD_START_PRIORITY_WEIGHT,
		);
		const coldStartAffinityWeight = await this.resolveWeight(
			"tag",
			"coldStartAffinityWeight",
			DEFAULT_COLD_START_AFFINITY_WEIGHT,
		);
		const coldStartDomainWeight = await this.resolveWeight(
			"tag",
			"coldStartDomainWeight",
			DEFAULT_COLD_START_DOMAIN_WEIGHT,
		);
		const learnedBaseWeight = await this.resolveWeight(
			"tag",
			"learnedBaseWeight",
			DEFAULT_LEARNED_BASE_WEIGHT,
		);
		const learnedTransitionWeight = await this.resolveWeight(
			"tag",
			"learnedTransitionWeight",
			DEFAULT_LEARNED_TRANSITION_WEIGHT,
		);
		const learnedPriorityWeight = await this.resolveWeight(
			"tag",
			"learnedPriorityWeight",
			DEFAULT_LEARNED_PRIORITY_WEIGHT,
		);

		// 2. Resolve tag records (profile-scoped or all)
		const records = await this.resolveTagRecords(ctx?.profileId);
		if (records.length === 0) return [];

		// 3. Filter by prefix (case-insensitive startsWith)
		const lowerPrefix = prefix.toLowerCase();
		const filtered =
			lowerPrefix === ""
				? records
				: records.filter((r) =>
						r.tagName.toLowerCase().startsWith(lowerPrefix),
					);
		if (filtered.length === 0) return [];

		// 4. Compute transition scores (if available)
		const recentSchemas = ctx?.recentTargetSchemas ?? [];
		const transitionScores = await this.computeTransitionScores(
			recentSchemas,
			ctx?.personnelId,
		);
		const hasTransitionData = Object.keys(transitionScores).length > 0;

		// 5. Score each tag
		const scored = filtered.map((record) => {
			const metadata = parseTagMetadata(record.tagBlob);
			const baseScore = this.prefixMatchScore(prefix, record.tagName);
			const priorityScore = Math.min((metadata.priority ?? 0) / maxPriority, 1);
			const affinityScore = this.affinityOverlap(
				recentSchemas,
				metadata.affinitySchemas ?? [],
			);
			const domainScore = this.domainMatch(recentSchemas, metadata.domain);
			const transitionScore = transitionScores[record.tagId] ?? 0;

			const coldStartScore =
				baseScore * coldStartBaseWeight +
				priorityScore * coldStartPriorityWeight +
				affinityScore * coldStartAffinityWeight +
				domainScore * coldStartDomainWeight;
			const learnedScore =
				baseScore * learnedBaseWeight +
				transitionScore * learnedTransitionWeight +
				priorityScore * learnedPriorityWeight;
			const finalScore = hasTransitionData ? learnedScore : coldStartScore;

			return { record, finalScore };
		});

		// 5. Sort: score descending, tie-break alphabetical
		scored.sort((a, b) => {
			if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
			return a.record.tagName.localeCompare(b.record.tagName);
		});

		// 6. Build suggestions
		return scored.map(({ record, finalScore }) => {
			const targetSchema = this.resolveTargetSchema(record.tagName);
			const insertText = `${this.profile.tagToken}${record.tagName} `;
			return {
				kind: "tag" as const,
				insertText,
				label: record.tagName,
				detail: targetSchema,
				cursorOffset: insertText.length,
				targetSchema,
				rankScore: Math.max(0, Math.min(1, finalScore)),
			};
		});
	}

	/**
	 * Suggest macros whose `macroName` starts with `prefix` (case-insensitive).
	 *
	 * Macros are fetched from `ParserMacroStore.list()`, filtered by prefix,
	 * and scored by prefix match + optional transition data.
	 */
	async suggestMacros(
		prefix: string,
		ctx?: CommandAutocompleteContext,
	): Promise<CommandAutocompleteSuggestion[]> {
		if (!this.macroStore) return [];

		const macros = await this.macroStore.list();
		if (macros.length === 0) return [];

		const lowerPrefix = prefix.toLowerCase();
		const filtered =
			lowerPrefix === ""
				? macros
				: macros.filter((m) =>
						m.macroName.toLowerCase().startsWith(lowerPrefix),
					);
		if (filtered.length === 0) return [];

		// Compute transition scores
		const recentSchemas = ctx?.recentTargetSchemas ?? [];
		const transitionScores = await this.computeTransitionScores(
			recentSchemas,
			ctx?.personnelId,
			"command_macro",
		);
		const hasTransitionData = Object.keys(transitionScores).length > 0;

		// Score each macro
		const scored = filtered.map((macro) => {
			const baseScore = this.prefixMatchScore(prefix, macro.macroName);
			const transitionScore = transitionScores[macro.macroName] ?? 0;
			const coldStartScore = baseScore;
			const learnedScore = baseScore * 0.3 + transitionScore * 0.7;
			const finalScore = hasTransitionData ? learnedScore : coldStartScore;
			return { macro, finalScore };
		});

		scored.sort((a, b) => {
			if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
			return a.macro.macroName.localeCompare(b.macro.macroName);
		});

		const macroToken = this.profile.macroStartToken ?? "^";
		return scored.map(({ macro, finalScore }) => {
			const insertText = `${macroToken}${macro.macroName} `;
			return {
				kind: "macro" as const,
				insertText,
				label: macro.macroName,
				detail: macro.macroTemplate,
				cursorOffset: insertText.length,
				rankScore: Math.max(0, Math.min(1, finalScore)),
			};
		});
	}

	/**
	 * Suggest terms whose `display` or `standardCode` starts with `prefix`
	 * (case-insensitive), using `DictionaryStore.search()`.
	 *
	 * Results are scoped to the namespace of the most recent schema
	 * (via `ctx.schemaNamespaces`). If no namespace matches, a broader
	 * cross-namespace fallback search is attempted.
	 */
	async suggestTerms(
		prefix: string,
		ctx?: CommandAutocompleteContext,
	): Promise<CommandAutocompleteSuggestion[]> {
		if (!this.dictionaryStore) return [];
		if (!prefix) return [];

		// Determine namespace from recent schema
		const recentSchema = ctx?.recentTargetSchemas?.[0];
		const schemaNamespaces = ctx?.schemaNamespaces;
		let namespaceCode: string | undefined;
		if (recentSchema && schemaNamespaces) {
			const nsList = schemaNamespaces[recentSchema.toLowerCase()];
			namespaceCode = nsList?.[0];
		}

		// 1. Namespace-scoped search
		const results = await this.dictionaryStore.search(
			prefix,
			namespaceCode,
			50,
		);
		const filtered = results.filter(
			(c) =>
				c.display.toLowerCase().startsWith(prefix.toLowerCase()) ||
				c.standardCode.toLowerCase().startsWith(prefix.toLowerCase()),
		);
		if (filtered.length > 0) {
			return filtered.slice(0, 10).map((c) => {
				const insertText = `@${c.display};`;
				return {
					kind: "term" as const,
					insertText,
					label: c.display,
					detail: `${c.standardCode} (${c.namespaceCode})`,
					cursorOffset: insertText.length,
					rankScore: 0.5,
				};
			});
		}

		// 2. Cross-namespace fallback
		const fallback = await this.dictionaryStore.search(prefix, undefined, 10);
		const fallbackFiltered = fallback.filter(
			(c) =>
				c.display.toLowerCase().startsWith(prefix.toLowerCase()) ||
				c.standardCode.toLowerCase().startsWith(prefix.toLowerCase()),
		);
		return fallbackFiltered.slice(0, 10).map((c) => {
			const insertText = `@${c.display};`;
			return {
				kind: "term" as const,
				insertText,
				label: c.display,
				detail: `${c.standardCode} (${c.namespaceCode})`,
				cursorOffset: insertText.length,
				rankScore: 0.3,
			};
		});
	}

	/**
	 * Suggest variable names from `ctx.filledSlots` matching `prefix`.
	 * Sorted by recency (most recently filled first).
	 */
	async suggestVariables(
		prefix: string,
		ctx?: CommandAutocompleteContext,
	): Promise<CommandAutocompleteSuggestion[]> {
		const filledSlots = ctx?.filledSlots;
		if (!filledSlots) return [];

		const lowerPrefix = prefix.toLowerCase();
		const matchingKeys =
			lowerPrefix === ""
				? Object.keys(filledSlots)
				: Object.keys(filledSlots).filter((k) =>
						k.toLowerCase().startsWith(lowerPrefix),
					);

		if (matchingKeys.length === 0) return [];

		// Sort alphabetically (no recency data available in filledSlots)
		matchingKeys.sort();

		const varToken = this.profile.variableStartToken ?? "{";
		return matchingKeys.slice(0, 10).map((key) => {
			const insertText = `${varToken}${key}=`;
			return {
				kind: "variable" as const,
				insertText,
				label: key,
				detail: `${typeof filledSlots[key]}`,
				cursorOffset: insertText.length,
				rankScore: 0.5,
			};
		});
	}

	/**
	 * Record a tag selection to the transition store for learned scoring.
	 */
	async recordTagSelection(
		tagId: string,
		targetSchema?: string,
		ctx?: CommandAutocompleteContext,
	): Promise<void> {
		if (!this.transitionStore) return;
		const fromSlot = ctx?.recentTargetSchemas?.[0] ?? "none";
		const pid = ctx?.personnelId ?? this.profile.personnelId;
		const plan: AutocompleteTransitionInsertPlan = {
			table: TRANSITION_TABLE,
			personnelId: pid,
			templateId: "command",
			fromSlot,
			toSlot: targetSchema ?? "",
			featureKey: "command_tag",
			featureValue: tagId,
			numericalValue: null,
			selectionCount: 1,
			lastUpdatedAt: new Date().toISOString(),
		};
		await this.transitionStore.increment(plan);
	}

	/**
	 * Record a macro selection to the transition store for learned scoring.
	 */
	async recordMacroSelection(
		macroName: string,
		ctx?: CommandAutocompleteContext,
	): Promise<void> {
		if (!this.transitionStore) return;
		const fromSlot = ctx?.recentTargetSchemas?.[0] ?? "none";
		const pid = ctx?.personnelId ?? this.profile.personnelId;
		const plan: AutocompleteTransitionInsertPlan = {
			table: TRANSITION_TABLE,
			personnelId: pid,
			templateId: "command",
			fromSlot,
			toSlot: "",
			featureKey: "command_macro",
			featureValue: macroName,
			numericalValue: null,
			selectionCount: 1,
			lastUpdatedAt: new Date().toISOString(),
		};
		await this.transitionStore.increment(plan);
	}

	/**
	 * Top-level dispatcher: detect trigger character and delegate.
	 */
	async suggest(
		partialText: string,
		triggerChar: string,
		ctx?: CommandAutocompleteContext,
	): Promise<CommandAutocompleteSuggestion[]> {
		if (triggerChar === this.profile.tagToken) {
			const prefix = this.extractPrefix(partialText, this.profile.tagToken);
			return this.suggestTags(prefix, ctx);
		}
		if (
			this.profile.macroStartToken &&
			triggerChar === this.profile.macroStartToken
		) {
			const prefix = this.extractPrefix(
				partialText,
				this.profile.macroStartToken,
			);
			return this.suggestMacros(prefix, ctx);
		}
		if (triggerChar === "@") {
			const prefix = this.extractPrefix(partialText, "@");
			return this.suggestTerms(prefix, ctx);
		}
		if (
			this.profile.variableStartToken &&
			triggerChar === this.profile.variableStartToken
		) {
			const prefix = this.extractPrefix(
				partialText,
				this.profile.variableStartToken,
			);
			return this.suggestVariables(prefix, ctx);
		}
		return [];
	}

	// ── Private helpers ───────────────────────────────────────────

	/**
	 * Resolve tag records, scoped to the active profile if `profileId` is set.
	 * Falls back to `tagStore.list()` when the profile has no tags or on error.
	 */
	private async resolveTagRecords(profileId?: string): Promise<TagRecord[]> {
		if (!profileId) {
			return this.tagStore.list();
		}
		let tagIds: string[];
		try {
			tagIds = await this.profileTagStore.getProfileTags(profileId);
		} catch {
			return this.tagStore.list();
		}
		if (tagIds.length === 0) {
			return this.tagStore.list();
		}
		const records = await Promise.all(
			tagIds.map((id) => this.tagStore.get(id)),
		);
		return records.filter((r): r is TagRecord => r !== null);
	}

	/**
	 * Prefix match score: 0.0–1.0 based on how much of the tag name
	 * the prefix covers. Empty prefix returns 0.5 (all tags equally valid).
	 */
	private prefixMatchScore(prefix: string, tagName: string): number {
		if (!prefix) return 0.5;
		const lowerPrefix = prefix.toLowerCase();
		const lowerName = tagName.toLowerCase();
		if (!lowerName.startsWith(lowerPrefix)) return 0;
		return lowerPrefix.length / lowerName.length;
	}

	/**
	 * Count of `recentSchemas` that appear in `affinitySchemas`,
	 * normalized by `recentSchemas.length`.
	 */
	private affinityOverlap(
		recentSchemas: string[],
		affinitySchemas: string[],
	): number {
		if (recentSchemas.length === 0 || affinitySchemas.length === 0) return 0;
		const affinitySet = new Set(affinitySchemas.map((s) => s.toLowerCase()));
		const overlap = recentSchemas.filter((s) =>
			affinitySet.has(s.toLowerCase()),
		).length;
		return overlap / recentSchemas.length;
	}

	/**
	 * 1.0 if any schema in `recentSchemas` contains the domain string
	 * (case-insensitive substring), else 0.0.
	 */
	private domainMatch(recentSchemas: string[], domain?: string): number {
		if (!domain || recentSchemas.length === 0) return 0;
		const lowerDomain = domain.toLowerCase();
		return recentSchemas.some((s) => s.toLowerCase().includes(lowerDomain))
			? 1.0
			: 0.0;
	}

	/**
	 * Compute decayed transition scores for a given feature key.
	 *
	 * Uses `getByFromSlot()` to retrieve raw records, filters by
	 * `featureKey`, and computes a time-decayed score (half-life =
	 * configurable via SystemWeightStore, default 30 days).
	 * Scores are normalized to 0–1 by dividing by the maximum raw score.
	 *
	 * @param recentSchemas - Recent target schemas for the fromSlot
	 * @param personnelId - Personnel ID for the lookup
	 * @param featureKey - The feature key to filter by (e.g. "command_tag", "command_macro")
	 */
	private async computeTransitionScores(
		recentSchemas: string[],
		personnelId?: string,
		featureKey: string = "command_tag",
	): Promise<Record<string, number>> {
		if (!this.transitionStore || recentSchemas.length === 0) return {};

		const fromSlot = recentSchemas[0] ?? "none";
		const pid = personnelId ?? this.profile.personnelId;
		const halfLifeDays = await this.resolveWeight(
			"tag",
			"halfLifeDays",
			DEFAULT_HALF_LIFE_DAYS,
		);
		const halfLifeSecs = halfLifeDays * 86400;

		try {
			const records = await this.transitionStore.getByFromSlot({
				personnelId: pid,
				templateId: "command",
				fromSlot,
				toSlot: "",
				featureKey,
			});

			const filtered = records.filter((r) => r.featureKey === featureKey);
			if (filtered.length === 0) return {};

			const now = Date.now();
			const rawScores: Record<string, number> = {};
			let maxScore = 0;

			for (const r of filtered) {
				if (!r.featureValue) continue;
				const lastT = new Date(r.lastUpdatedAt).getTime();
				const deltaSec = Math.max(0, (now - lastT) / 1000);
				const decay = 0.5 ** (deltaSec / halfLifeSecs);
				const decayed = (r.selectionCount || 0) * decay;
				rawScores[r.featureValue] = (rawScores[r.featureValue] ?? 0) + decayed;
				maxScore = Math.max(maxScore, rawScores[r.featureValue]!);
			}

			// Normalize to 0–1
			const normalized: Record<string, number> = {};
			if (maxScore > 0) {
				for (const [key, val] of Object.entries(rawScores)) {
					normalized[key] = val / maxScore;
				}
			}
			return normalized;
		} catch {
			return {};
		}
	}

	/**
	 * Resolve a scoring weight from SystemWeightStore, falling back to
	 * the provided default if the store is not available or the key is
	 * not found. Follows the same pattern as GenericConfidenceScorer.
	 *
	 * @param key - Weight key (e.g. "tag" for tag autocomplete)
	 * @param subKey - Sub-key for the specific weight (e.g. "coldStartBaseWeight")
	 * @param defaultValue - Fallback value if weightStore is absent
	 */
	private async resolveWeight(
		key: string,
		subKey: string,
		defaultValue: number,
	): Promise<number> {
		if (!this.weightStore) return defaultValue;
		try {
			return await this.weightStore.getWeight("autocomplete", key, subKey);
		} catch {
			return defaultValue;
		}
	}

	/**
	 * Resolve the target schema for a tag name via `profile.tagMappings`.
	 * Attempts exact match first, then case-insensitive match.
	 */
	private resolveTargetSchema(tagName: string): string | undefined {
		const mappings = this.profile.tagMappings;
		if (!mappings) return undefined;
		if (mappings[tagName]) return mappings[tagName];
		const lowerName = tagName.toLowerCase();
		for (const [key, value] of Object.entries(mappings)) {
			if (key.toLowerCase() === lowerName) return value;
		}
		return undefined;
	}

	/**
	 * Extract the prefix text after the last occurrence of `triggerChar`.
	 */
	private extractPrefix(text: string, triggerChar: string): string {
		const idx = text.lastIndexOf(triggerChar);
		if (idx === -1) return "";
		return text.slice(idx + triggerChar.length);
	}
}
