import type {
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionStore,
	NgramStore,
} from "../../store/learning/interfaces";
import type {
	AutocompleteSelection,
	CommandAutocompleteContext,
} from "../../store/reference/auto-complete/command-autocomplete-interfaces";
import type { AutocompleteSuggestion } from "../../store/reference/auto-complete/interfaces";
import type { ProseParserTemplateStore } from "../../store/reference/prose-parser-templates/interfaces";
import { NgramSuggester } from "../autocomplete/ngram-suggester";
import type { CdslParser } from "../cdsl-parser";
import type { ParsedItem } from "../schema-parsers";
import { AutocompleteSessionStateMapper } from "./autocomplete-state-mapper";
import { extractNgrams } from "./ngram-extractor";

export interface AutocompleteSessionState {
	activeTemplateId: string | null;
	filledSlots: Record<string, unknown>;
	recentTargetSchemas: string[];
}

export class AutocompleteSessionManager {
	private activeTemplateId: string | null = null;
	private filledSlots: Record<string, unknown> = {};
	private recentTargetSchemas: string[] = [];
	private ngramSuggester?: NgramSuggester;

	constructor(
		private readonly cdslParser: CdslParser,
		private readonly proseTemplateStore?: ProseParserTemplateStore,
		private readonly transitionStore?: AutocompleteTransitionStore,
		private readonly personnelId: string = "system",
		private readonly ngramStore?: NgramStore,
	) {
		if (this.ngramStore) {
			this.ngramSuggester = new NgramSuggester(this.ngramStore);
		}
	}

	async suggest(partialText: string): Promise<AutocompleteSuggestion[]> {
		const commandContext: CommandAutocompleteContext = {
			recentTargetSchemas: this.recentTargetSchemas,
			filledSlots: this.filledSlots,
			personnelId: this.personnelId,
		};
		const primary = await this.cdslParser.suggestAutocomplete(
			partialText,
			{
				personnelId: this.personnelId,
			},
			commandContext,
		);

		// If primary returns enough results, return them directly
		if (primary.length >= 3 || !this.ngramSuggester) return primary;

		// Fallback: merge with n-gram suggestions
		const ngram = await this.ngramSuggester.suggest(
			partialText,
			this.activeTemplateId,
		);
		if (ngram.length === 0) return primary;

		const dedupSet = new Set<string>();
		for (const s of primary) {
			dedupSet.add(s.insertText.toLowerCase());
		}
		const merged = [...primary];
		for (const s of ngram) {
			if (!dedupSet.has(s.insertText.toLowerCase())) {
				merged.push(s);
				dedupSet.add(s.insertText.toLowerCase());
			}
		}
		merged.sort((a, b) => b.rankScore - a.rankScore);
		return merged.slice(0, 5);
	}

	async select(suggestion: AutocompleteSuggestion): Promise<void> {
		if (suggestion.kind === "prose") {
			this.activeTemplateId = suggestion.templateId;
		}

		if (suggestion.kind === "tag" || suggestion.kind === "macro") {
			const now = new Date().toISOString();
			const plan: AutocompleteTransitionInsertPlan = {
				table: "autocomplete_transitions",
				personnelId: this.personnelId,
				templateId: "command",
				fromSlot: suggestion.kind,
				toSlot: suggestion.slotName,
				featureKey: `command_${suggestion.kind}`,
				featureValue: suggestion.slotName,
				numericalValue: null,
				selectionCount: 1,
				lastUpdatedAt: now,
			};
			await this.transitionStore?.increment(plan);
		}
	}

	async updateFromParse(parsedItems: ParsedItem[]): Promise<void> {
		const schemas = parsedItems.map((item) => item.targetSchema);
		this.recentTargetSchemas = [...schemas, ...this.recentTargetSchemas].slice(
			0,
			3,
		);

		if (this.activeTemplateId && this.proseTemplateStore) {
			const template = await this.proseTemplateStore.get(this.activeTemplateId);
			if (template) {
				const slots = AutocompleteSessionStateMapper.mapParsedItemsToSlots(
					parsedItems,
					template,
				);
				Object.assign(this.filledSlots, slots);
			}
		}

		// Feed n-gram store from parsed text
		if (this.ngramStore) {
			for (const item of parsedItems) {
				const kind = item.tag?.startsWith("#") ? "tag" : "prose";
				const ngrams = extractNgrams(item.rawText, kind, {
					templateId: this.activeTemplateId ?? undefined,
					slotName: item.targetSchema,
				});
				for (const ng of ngrams) {
					await this.ngramStore.increment(ng.ngram, ng.n, ng.kind);
				}
			}
		}
	}

	resetSession(): void {
		this.activeTemplateId = null;
		this.filledSlots = {};
		this.recentTargetSchemas = [];
	}

	recordSelection(selection: AutocompleteSelection): void {
		if (selection.kind === "tag" || selection.kind === "macro") {
			const now = new Date().toISOString();
			const plan: AutocompleteTransitionInsertPlan = {
				table: "autocomplete_transitions",
				personnelId: selection.context?.personnelId ?? this.personnelId,
				templateId: "command",
				fromSlot: selection.kind,
				toSlot: selection.value,
				featureKey: `command_${selection.kind}`,
				featureValue: selection.value,
				numericalValue: null,
				selectionCount: 1,
				lastUpdatedAt: now,
			};
			this.transitionStore?.increment(plan);
		}
	}

	getState(): AutocompleteSessionState {
		return {
			activeTemplateId: this.activeTemplateId,
			filledSlots: { ...this.filledSlots },
			recentTargetSchemas: [...this.recentTargetSchemas],
		};
	}
}
