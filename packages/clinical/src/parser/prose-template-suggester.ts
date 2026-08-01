import { executePipeline } from "@stateful-mcp/core";
import type { StopWordStore } from "../store/interfaces";
import type {
	AutocompleteSuggestion,
	Relation,
} from "../store/reference/auto-complete/interfaces";
import type { ProseParserTemplateStore } from "../store/reference/prose-parser-templates/interfaces";
import type {
	ProseSlot,
	ProseTemplate,
} from "../store/reference/prose-parser-templates/prose-template";

interface SuggestionContext {
	personnelId: string;
	workspaceId?: string;
	specialtyId?: string;
	locale?: string;
	filledSlots?: Record<string, unknown>;
}

function isStopWordForPartial(word: string, stopWords: Set<string>): boolean {
	return stopWords.has(word.toLowerCase());
}

interface MatchCandidate {
	template: ProseTemplate;
	slot: ProseSlot;
	matchIndex: number;
	rankScore: number;
}

export class ProseTemplateSuggester {
	constructor(
		private templateStore: ProseParserTemplateStore,
		private stopWordStore?: StopWordStore,
	) {}

	async suggest(
		partialText: string,
		context: SuggestionContext,
	): Promise<AutocompleteSuggestion[]> {
		if (
			partialText.length > 0 &&
			(await this.isCursorInStopWord(partialText, context))
		) {
			return [];
		}

		const templates = await this.templateStore.listAll();
		if (templates.length === 0) return [];

		const lowerPartial = partialText.toLowerCase();
		const partialLen = partialText.length;
		const matches: MatchCandidate[] = [];

		for (const template of templates) {
			let bestMatch: {
				slot: ProseSlot;
				matchIndex: number;
				rankScore: number;
			} | null = null;

			for (const slot of template.slots) {
				if (!slot.triggerPattern) continue;
				const triggerLower = slot.triggerPattern.toLowerCase();
				const matchIndex = lowerPartial.lastIndexOf(triggerLower);
				if (matchIndex === -1) continue;
				const rank = this.slotRank(template, slot, matchIndex, partialLen);
				if (!bestMatch || rank > bestMatch.rankScore) {
					bestMatch = { slot, matchIndex, rankScore: rank };
				}
			}

			if (bestMatch) {
				matches.push({
					template,
					slot: bestMatch.slot,
					matchIndex: bestMatch.matchIndex,
					rankScore: bestMatch.rankScore,
				});
			}
		}

		matches.sort((a, b) => b.rankScore - a.rankScore);
		return matches.slice(0, 5).map((candidate) => {
			const insertText =
				candidate.slot.suggestText ?? candidate.slot.triggerPattern ?? "";
			return {
				kind: "prose" as const,
				templateId: candidate.template.templateId,
				slotName: candidate.slot.slotName,
				triggerPattern: candidate.slot.triggerPattern ?? "",
				insertText,
				cursorOffset: insertText.length,
				targetSchema:
					candidate.slot.targetSchema ?? candidate.template.targetSchema,
				targetConceptId: (candidate.template as any).targetConceptId,
				rankScore: this.clampRank(candidate.rankScore),
				nextHints: this.buildNextHints(
					candidate.template,
					candidate.slot,
					context,
				),
			};
		});
	}

	private slotRank(
		template: ProseTemplate,
		slot: ProseSlot,
		matchIndex: number,
		partialLen: number,
	): number {
		const templatePriority = template.priority ?? 0;
		const conceptBonus = (template as any).targetConceptId ? 0.1 : 0;
		const proximity = partialLen > 0 ? matchIndex / partialLen : 0;
		const seed = Math.min(templatePriority / 100, 1) + conceptBonus;
		return seed + proximity * 0.2;
	}

	private clampRank(value: number): number {
		return Math.max(0, Math.min(1, value));
	}

	private async isCursorInStopWord(
		partialText: string,
		context: SuggestionContext,
	): Promise<boolean> {
		if (!this.stopWordStore) return false;
		const stopWords =
			await this.stopWordStore.compileStopWordsForContext(context);
		if (stopWords.size === 0) return false;

		const words = partialText.split(/\s+/).filter(Boolean);
		if (words.length === 0) return false;
		const lastWord = words[words.length - 1]!;
		return isStopWordForPartial(lastWord, stopWords);
	}

	// Phase 1: always returns empty list.
	// Phase 1.5+ will evaluate slot.conditions against filled slots.
	private buildNextHints(
		template: ProseTemplate,
		matchedSlot: ProseSlot,
		context: SuggestionContext,
	): AutocompleteSuggestion["nextHints"] {
		const filledSlots = context.filledSlots ?? {};
		const relationPriority: Record<Relation, number> = {
			trigger: 3,
			duration: 2,
			qualifier: 1,
			supporting: 0,
			contains: 2,
			excludes: 1,
		};

		const passesConditions = (slot: ProseSlot): boolean => {
			const pipeline = slot.conditions?.pipeline;
			if (!pipeline) return true;
			try {
				const result = executePipeline(pipeline, filledSlots, {});
				return result !== false;
			} catch {
				return false;
			}
		};

		const addHint = (
			hints: Map<
				string,
				NonNullable<AutocompleteSuggestion["nextHints"]>[number]
			>,
			slot: ProseSlot,
			rankScore: number,
			relation?: Relation,
		): void => {
			if (!passesConditions(slot)) return;
			const key = slot.slotName;
			const insertText = slot.suggestText ?? slot.triggerPattern ?? "";
			hints.set(key, {
				slotName: slot.slotName,
				triggerPattern: slot.triggerPattern ?? "",
				insertText,
				cursorOffset: insertText.length,
				rankScore,
				relation,
				slotType: slot.slotType,
			});
		};

		const hints = new Map<
			string,
			NonNullable<AutocompleteSuggestion["nextHints"]>[number]
		>();

		// Sibling slots (every other slot in the template except the matched one).
		for (const slot of template.slots) {
			if (slot.slotName !== matchedSlot.slotName) {
				addHint(hints, slot, 0.2);
			}
		}

		// Child slots (slots defined inside the matched slot's sub-template).
		const childSlots = matchedSlot.subTemplate?.slots ?? [];
		for (const slot of childSlots) {
			addHint(hints, slot, 0.3);
		}

		// Linked slots (slots that reference the matched slot as their parent).
		for (const slot of template.slots) {
			if (slot.linkTo?.parentSlot === matchedSlot.slotName) {
				const relation = slot.linkTo.relation;
				const rank = 0.5 + (relationPriority[relation] ?? 0) * 0.1;
				addHint(hints, slot, rank, relation);
			}
		}

		return Array.from(hints.values()).sort((a, b) => b.rankScore - a.rankScore);
	}
}
