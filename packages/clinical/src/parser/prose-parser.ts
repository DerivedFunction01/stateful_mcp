import type { DictionaryStore } from "@stateful-mcp/core";
import type { ProseSlot, ProseTemplate } from "../schemas/prose-template";
import type {
	AttributeParserRule,
	ConceptFieldStore,
	ParserSyntaxProfile,
} from "../store/interfaces";
import type { ProseParserTemplateStore } from "../store/reference/prose-parser-templates/interfaces";
import { getCompiledRegex } from "./_compiled-regex";
import { type ParsedItem, resolveConceptHelper } from "./schema-parsers";

interface ConsumedRange {
	start: number;
	end: number;
}

interface RemnantSegment {
	text: string;
	remnantContext?: {
		targetSchema?: string;
		itemOverrides?: Record<string, any>;
		parentSlotLink?: string;
	};
}

export class ProseParser {
	constructor(
		private readonly dictionaryStore: DictionaryStore,
		readonly _conceptFieldStore: ConceptFieldStore,
		private readonly attributeRules: AttributeParserRule[],
		private readonly proseTemplateStore: ProseParserTemplateStore,
		private readonly profile: ParserSyntaxProfile,
	) {}

	/**
	 * Parses structured prose using registered templates and outputs parsed items
	 * alongside unmatched remnants and consumed text ranges.
	 */
	async parse(text: string): Promise<{
		parsedItems: ParsedItem[];
		consumedRanges: ConsumedRange[];
		remnantSegments: RemnantSegment[];
	}> {
		const templates = await this.proseTemplateStore.listAll();
		if (templates.length === 0) {
			return { parsedItems: [], consumedRanges: [], remnantSegments: [] };
		}

		// Sort templates by priority descending (higher priority first)
		const sortedTemplates = [...templates].sort((a, b) => {
			const pA = a.priority ?? 0;
			const pB = b.priority ?? 0;
			return pB - pA;
		});

		const parsedItems: ParsedItem[] = [];
		const consumedRanges: ConsumedRange[] = [];
		const remnantSegments: RemnantSegment[] = [];

		// ── Phase 1: Template Matching with Greedy Priority Consumption ───────────
		for (const template of sortedTemplates) {
			const flags = "gi"; // Global and case-insensitive section matching
			const regex = getCompiledRegex(template.sectionPattern, flags);
			regex.lastIndex = 0;

			let match: RegExpExecArray | null = regex.exec(text);
			while (match !== null) {
				const start = match.index;
				const end = regex.lastIndex;

				// Verify this match does not overlap with already consumed text ranges
				const isOverlap = consumedRanges.some(
					(r) =>
						(start >= r.start && start < r.end) ||
						(end > r.start && end <= r.end) ||
						(start <= r.start && end >= r.end),
				);

				if (!isOverlap) {
					// Consume the range
					consumedRanges.push({ start, end });

					// Parse the section text
					const sectionText = match[0];
					const { items, remnants } = await this.parseSection(
						sectionText,
						template,
						templates,
					);
					parsedItems.push(...items);
					remnantSegments.push(...remnants);
				}

				match = regex.exec(text);
			}
		}

		// Sort consumed ranges by start position
		consumedRanges.sort((a, b) => a.start - b.start);

		return { parsedItems, consumedRanges, remnantSegments };
	}

	/**
	 * Parses a matched section block against a selected template.
	 */
	private async parseSection(
		sectionText: string,
		template: ProseTemplate,
		allTemplates: ProseTemplate[],
	): Promise<{ items: ParsedItem[]; remnants: RemnantSegment[] }> {
		const items: ParsedItem[] = [];
		const remnants: RemnantSegment[] = [];

		// 1. Resolve slot inheritance (merge slots from parent template if declared)
		const slots = await this.resolveTemplateSlots(template, allTemplates);

		// Track text ranges consumed internally by slots
		const internalConsumed: ConsumedRange[] = [];

		// Keep a map of slot output arrays to support downstream graph linkages
		const slotOutputs = new Map<string, ParsedItem[]>();

		// 2. Iterate through slots and perform extraction
		for (const slot of slots) {
			// Sub-sections (Nesting / Delegation)
			if (slot.slotType === "sub_section") {
				const flags = "gi";
				const regex = getCompiledRegex(slot.anchorPattern, flags);
				regex.lastIndex = 0;

				let subMatch: RegExpExecArray | null = regex.exec(sectionText);
				while (subMatch !== null) {
					const subStart = subMatch.index;
					const subEnd = regex.lastIndex;

					// Extract substring
					const subText = subMatch[0];
					const capturedText =
						subMatch.groups?.[slot.slotName] ||
						subMatch.groups?.value ||
						subText;

					// Delegate parsing
					if (slot.delegateTemplateId) {
						const delegate = allTemplates.find(
							(t) => t.templateId === slot.delegateTemplateId,
						);
						if (delegate) {
							const { items: subItems, remnants: subRemnants } =
								await this.parseSection(capturedText, delegate, allTemplates);
							items.push(...subItems);
							remnants.push(...subRemnants);
						}
					}

					internalConsumed.push({ start: subStart, end: subEnd });
					subMatch = regex.exec(sectionText);
				}
				continue;
			}

			// Repeating blocks (e.g. ROS table rows)
			if (
				slot.slotType === "repeating_block" &&
				slot.repeatPattern &&
				slot.subTemplate
			) {
				const flags = "gm";
				const regex = getCompiledRegex(slot.repeatPattern, flags);
				regex.lastIndex = 0;

				let repeatMatch: RegExpExecArray | null = regex.exec(sectionText);
				while (repeatMatch !== null) {
					const repStart = repeatMatch.index;
					const repEnd = regex.lastIndex;

					const textGroup = slot.subTemplate.textGroup;
					const repeatText = repeatMatch.groups?.[textGroup];
					if (repeatText) {
						// Parse the sub-template slots inside the repeating block
						for (const subSlot of slot.subTemplate.slots) {
							const subItems = await this.parseSlot(
								repeatText,
								subSlot,
								template,
							);
							items.push(...subItems);
						}
					}

					internalConsumed.push({ start: repStart, end: repEnd });
					repeatMatch = regex.exec(sectionText);
				}
				continue;
			}

			// Single Concept or Attribute Slots
			const slotItems = await this.parseSlot(sectionText, slot, template);
			if (slotItems.length > 0) {
				items.push(...slotItems);
				slotOutputs.set(slot.slotName, slotItems);

				// Mark matched range as consumed locally in section text
				const flags = "i";
				const regex = getCompiledRegex(slot.anchorPattern, flags);
				const match = regex.exec(sectionText);
				if (match) {
					internalConsumed.push({
						start: match.index,
						end: match.index + match[0].length,
					});
				}
			}
		}

		// 3. Handle Linkages (linkTo parentSlot)
		for (const slot of slots) {
			if (slot.linkTo && slotOutputs.has(slot.slotName)) {
				const parentItems = slotOutputs.get(slot.linkTo.parentSlot);
				const childItems = slotOutputs.get(slot.slotName);

				if (parentItems && childItems) {
					const relation = slot.linkTo.relation;
					const targetPath = slot.fieldPath || slot.slotName;

					for (const parent of parentItems) {
						if (!parent.extractedData) {
							parent.extractedData = {};
						}

						for (const child of childItems) {
							const val =
								child.extractedData?.[targetPath] ||
								child.concept?.[0] ||
								child;

							// Apply linkage logic based on the relation type
							if (relation === "duration" || relation === "qualifier") {
								parent.extractedData[targetPath] = val;
							} else if (relation === "trigger" || relation === "supporting") {
								if (!parent.extractedData.supportingConcepts) {
									parent.extractedData.supportingConcepts = [];
								}
								if (child.concept?.[0]) {
									parent.extractedData.supportingConcepts.push(
										child.concept[0],
									);
								}
							}
						}
					}
				}
			}
		}

		// 4. Extract Remnants & Canopy
		internalConsumed.sort((a, b) => a.start - b.start);
		let currentPos = 0;
		for (const range of internalConsumed) {
			if (range.start > currentPos) {
				const remnantText = sectionText
					.substring(currentPos, range.start)
					.trim();
				if (remnantText) {
					remnants.push({
						text: remnantText,
						remnantContext: template.remnantContext,
					});
				}
			}
			currentPos = Math.max(currentPos, range.end);
		}
		if (currentPos < sectionText.length) {
			const remnantText = sectionText.substring(currentPos).trim();
			if (remnantText) {
				remnants.push({
					text: remnantText,
					remnantContext: template.remnantContext,
				});
			}
		}

		return { items, remnants };
	}

	/**
	 * Resolves slot definitions, merging inherited slots from a parent template.
	 */
	private async resolveTemplateSlots(
		template: ProseTemplate,
		allTemplates: ProseTemplate[],
	): Promise<ProseSlot[]> {
		const slots = [...template.slots];
		const parentId = template.parentTemplateId;

		if (parentId) {
			const parent = allTemplates.find((t) => t.templateId === parentId);
			if (parent) {
				// Base templates can have parentTemplateId, but we shallow merge one level
				for (const parentSlot of parent.slots) {
					const hasOverride = slots.some(
						(s) => s.slotName === parentSlot.slotName,
					);
					if (!hasOverride) {
						slots.push(parentSlot);
					}
				}
			}
		}

		return slots;
	}

	/**
	 * Parses a single slot within a section text block.
	 */
	private async parseSlot(
		sectionText: string,
		slot: ProseSlot,
		template: ProseTemplate,
	): Promise<ParsedItem[]> {
		const flags = "i";
		const regex = getCompiledRegex(slot.anchorPattern, flags);
		const match = regex.exec(sectionText);
		if (!match) return [];

		// Extract target captured string
		const listCapture = match.groups?.list;
		const valueCapture =
			match.groups?.value || match.groups?.[slot.slotName] || match[0];
		const isList = listCapture !== undefined;
		const capturedText = isList ? listCapture : valueCapture;

		if (!capturedText || !capturedText.trim()) return [];

		// Determine split elements
		const elements: string[] = [];
		if (isList) {
			const delimiterPattern =
				slot.listDelimiter ||
				(this.profile as any).listDelimiter ||
				",\\s*|\\s+and\\s+|\\s+or\\s+";
			const delRegex = getCompiledRegex(delimiterPattern, "i");
			elements.push(
				...capturedText
					.split(delRegex)
					.map((s) => s.trim())
					.filter(Boolean),
			);
		} else {
			elements.push(capturedText.trim());
		}

		const parsedItems: ParsedItem[] = [];

		for (const element of elements) {
			const targetSchema = slot.targetSchema || template.targetSchema;

			// ── Case A: Attribute Extraction ─────────────────────────────────────────
			if (slot.slotType === "attribute" && slot.ruleRef) {
				const rulesToRun = this.attributeRules.filter(
					(r) => r.targetField === slot.ruleRef,
				);

				let extractedValue: any = null;
				for (const rule of rulesToRun) {
					for (const pattern of rule.regexPatterns) {
						const patFlags = rule.isCaseInsensitive !== false ? "i" : "";
						const patRegex = getCompiledRegex(pattern, patFlags);
						if (patRegex.test(element)) {
							extractedValue = rule.targetValue;
							break;
						}
					}
					if (extractedValue !== null) break;
				}

				if (extractedValue !== null) {
					const field = slot.fieldPath || slot.slotName;
					const item: ParsedItem = {
						targetSchema,
						attributes: {},
						concept: [],
						rawText: element,
						tag: targetSchema,
						extractedData: { [field]: extractedValue },
					};
					parsedItems.push(item);
				}
				continue;
			}

			// ── Case B: Concept Extraction (Dictionary Lookup & Attributes) ─────────
			if (slot.slotType === "concept") {
				// Run profile-level attribute rules on the local element text first (scoping)
				const elementAttributes: Record<string, any> = {};
				const sortedRules = [...this.attributeRules].sort((a, b) => {
					const pA = a.priority ?? 1;
					const pB = b.priority ?? 1;
					return pB - pA;
				});

				for (const rule of sortedRules) {
					for (const pattern of rule.regexPatterns) {
						const patFlags = rule.isCaseInsensitive !== false ? "i" : "";
						const patRegex = getCompiledRegex(pattern, patFlags);
						if (patRegex.test(element)) {
							if (elementAttributes[rule.targetField] === undefined) {
								elementAttributes[rule.targetField] = rule.targetValue;
							}
						}
					}
				}

				// Resolve the concept name
				const allowedNamespaces =
					this.profile.schemaNamespaces?.[targetSchema.toLowerCase()] ||
					undefined;
				const resolvedConcepts = await resolveConceptHelper(
					element,
					this.dictionaryStore,
					this.profile.termTokenizer,
					allowedNamespaces,
				);

				const concept =
					resolvedConcepts.length > 0 ? [resolvedConcepts[0]!] : [];
				const field = slot.fieldPath || "concept";

				const item: ParsedItem = {
					targetSchema,
					attributes: {},
					concept,
					rawText: element,
					tag: targetSchema,
					extractedData: {
						[field]: concept[0] || undefined,
						...elementAttributes,
						...slot.itemOverrides,
					},
				};
				parsedItems.push(item);
			}
		}

		return parsedItems;
	}
}
