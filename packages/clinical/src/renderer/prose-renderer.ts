import type { ParsedItem } from "../parser/schema-parsers";
import type { SoapNote } from "../schemas/document";
import type { CodeableConcept } from "../schemas/shared";
import type { Cell, CellContext, CellMode, CellStatus } from "../session/cell";
import type { ClinicalProseTemplate } from "../store/interfaces";
import type { Position } from "../store/reference/auto-complete/interfaces";
import { TemplateRenderer } from "./template-renderer";

// ── Cell Rendering Types ─────────────────────────────────────────────────────

export enum CellRenderWarning {
	NO_PARSED_OUTPUT = "NO_PARSED_OUTPUT",
	NO_MATCHING_TEMPLATE = "NO_MATCHING_TEMPLATE",
	PARSED_ITEM_INDEX_OUT_OF_RANGE = "PARSED_ITEM_INDEX_OUT_OF_RANGE",
	CELL_ERROR = "CELL_ERROR",
	CELL_DELETED = "CELL_DELETED",
	RENDER_MODE_NOT_SUPPORTED = "RENDER_MODE_NOT_SUPPORTED",
}

export interface CellRenderResult {
	cellId: string;
	mode: CellMode;
	status: CellStatus;
	text: string;
	templateId?: string;
	targetSchema?: string;
	targetField?: string;
	warnings: CellRenderWarning[];
}

interface CellTemplateContext {
	cell: Cell;
	parsedItem?: ParsedItem;
	extractedData?: Record<string, unknown>;
	attributes?: Record<string, unknown>;
	concepts?: CodeableConcept[];
	rawInput: string;
	narrativeTarget?: string;
	metadata?: Record<string, unknown>;
	context: CellContext;
}

// ── ProseRenderer ─────────────────────────────────────────────────────────────

export class ProseRenderer {
	static render(note: SoapNote, templates: ClinicalProseTemplate[]): SoapNote {
		const resultNote = structuredClone(note);

		const hpiEvents =
			resultNote.subjective?.historyOfPresentIllness?.events || [];
		const hpiNarrative = ProseRenderer.renderSection(
			resultNote,
			hpiEvents,
			templates,
			"opening" as Position,
		);
		if (resultNote.subjective?.historyOfPresentIllness) {
			resultNote.subjective.historyOfPresentIllness.narrative =
				hpiNarrative || undefined;
		}

		const objectiveEvents = [
			...(resultNote.objective?.vitalSigns || []),
			...(resultNote.objective?.clinicalObservations || []),
		];
		const objNarrative = ProseRenderer.renderSection(
			resultNote,
			objectiveEvents,
			templates,
			"closing",
		);
		if (resultNote.objective) {
			resultNote.objective.narrative = objNarrative || undefined;
		}

		const assessmentEvents = resultNote.assessment?.differentialDiagnoses || [];
		const assessmentNarrative = ProseRenderer.renderSection(
			resultNote,
			assessmentEvents,
			templates,
			"closing",
		);
		if (resultNote.assessment) {
			resultNote.assessment.narrative = assessmentNarrative || undefined;
		}

		const planEvents = resultNote.plan?.prescriptions || [];
		const planNarrative = ProseRenderer.renderSection(
			resultNote,
			planEvents,
			templates,
			"full_paragraph",
		);
		if (resultNote.plan) {
			resultNote.plan.narrative = planNarrative || undefined;
		}

		return resultNote;
	}

	/**
	 * Renders a specific template against the given context scope.
	 * Delegates to TemplateRenderer for backward compatibility.
	 */
	static renderTemplate(
		template: ClinicalProseTemplate,
		context: any,
		templates: ClinicalProseTemplate[],
		visited: Set<string>,
	): string {
		return TemplateRenderer.renderTemplate(
			template,
			context,
			templates,
			visited,
		);
	}

	/**
	 * Renders a single cell through the existing template system.
	 *
	 * This is an additional entry point into the rendering pipeline — it does
	 * not replace `render()` and does not mutate the input cell or SoapNote.
	 *
	 * For CDSL cells with parsed output, each parsed item is rendered through
	 * its matching `ClinicalProseTemplate`. For narrative cells, the raw input
	 * is returned as-is. Error/deleted cells return diagnostic-safe text.
	 */
	static renderCell(
		cell: Cell,
		templates: ClinicalProseTemplate[],
		options?: {
			parsedItemIndex?: number;
			templateId?: string;
			fallbackToRawInput?: boolean;
		},
	): CellRenderResult {
		const warnings: CellRenderWarning[] = [];
		const fallbackToRawInput = options?.fallbackToRawInput !== false;

		// Error/deleted cells: do not render error text as clinical prose
		if (cell.status === "error" || cell.status === "deleted") {
			return {
				cellId: cell.cellId,
				mode: cell.mode,
				status: cell.status,
				text: "",
				warnings: [
					cell.status === "error"
						? CellRenderWarning.CELL_ERROR
						: CellRenderWarning.CELL_DELETED,
				],
			};
		}

		// Narrative cells: return rawInput as primary text
		if (cell.mode === "narrative") {
			// If an explicit template is supplied, render through the template engine
			if (options?.templateId || templates.length > 0) {
				const template = options?.templateId
					? templates.find((t) => t.templateId === options.templateId)
					: ProseRenderer.selectTemplateForNarrative(cell, templates);

				if (template) {
					const context = ProseRenderer.buildCellTemplateContext(
						cell,
						undefined,
					);
					const text = TemplateRenderer.renderTemplate(
						template,
						context,
						templates,
						new Set<string>(),
					);
					return {
						cellId: cell.cellId,
						mode: cell.mode,
						status: cell.status,
						text,
						templateId: template.templateId,
						targetField: cell.narrativeTarget,
						warnings,
					};
				}
			}

			// No template — return rawInput
			return {
				cellId: cell.cellId,
				mode: cell.mode,
				status: cell.status,
				text: cell.rawInput,
				targetField: cell.narrativeTarget,
				warnings,
			};
		}

		// CDSL cells: render through parsed output
		if (cell.mode === "cdsl") {
			// Null/empty parsedOutput
			if (!cell.parsedOutput || cell.parsedOutput.length === 0) {
				if (fallbackToRawInput) {
					warnings.push(CellRenderWarning.NO_PARSED_OUTPUT);
					return {
						cellId: cell.cellId,
						mode: cell.mode,
						status: cell.status,
						text: cell.rawInput,
						warnings,
					};
				}
				warnings.push(CellRenderWarning.NO_PARSED_OUTPUT);
				return {
					cellId: cell.cellId,
					mode: cell.mode,
					status: cell.status,
					text: "",
					warnings,
				};
			}

			// Determine which parsed items to render
			const itemsToRender: ParsedItem[] = [];
			if (options?.parsedItemIndex !== undefined) {
				const item = cell.parsedOutput[options.parsedItemIndex];
				if (item) {
					itemsToRender.push(item);
				} else {
					warnings.push(CellRenderWarning.PARSED_ITEM_INDEX_OUT_OF_RANGE);
				}
			} else {
				itemsToRender.push(...cell.parsedOutput);
			}

			// Render each item through its matching template
			const parts: string[] = [];
			let usedTemplateId: string | undefined;
			let usedTargetSchema: string | undefined;

			for (const item of itemsToRender) {
				const template = ProseRenderer.selectTemplateForItem(
					item,
					templates,
					cell,
					options?.templateId,
				);

				if (!template) {
					warnings.push(CellRenderWarning.NO_MATCHING_TEMPLATE);
					if (fallbackToRawInput) {
						parts.push(item.rawText || cell.rawInput);
					}
					continue;
				}

				usedTemplateId = template.templateId;
				usedTargetSchema = item.targetSchema;

				const context = ProseRenderer.buildCellTemplateContext(cell, item);
				const rendered = TemplateRenderer.renderTemplate(
					template,
					context,
					templates,
					new Set<string>(),
				);
				parts.push(rendered);
			}

			return {
				cellId: cell.cellId,
				mode: cell.mode,
				status: cell.status,
				text: parts.join("\n"),
				templateId: usedTemplateId,
				targetSchema: usedTargetSchema,
				warnings,
			};
		}

		// js_script or other modes — not implemented for rendering
		return {
			cellId: cell.cellId,
			mode: cell.mode,
			status: cell.status,
			text: cell.rawInput,
			warnings: [CellRenderWarning.RENDER_MODE_NOT_SUPPORTED],
		};
	}

	// ── Private Helpers ───────────────────────────────────────────────────────

	private static renderSection(
		rootNote: SoapNote,
		items: any[],
		templates: ClinicalProseTemplate[],
		position: Position,
	): string {
		const matchedTemplates = templates.filter(
			(t) => t.slotPosition === position,
		);
		if (matchedTemplates.length === 0) return "";

		const sorted = [...matchedTemplates].sort((a, b) => {
			if (a.targetConceptId && !b.targetConceptId) return -1;
			if (!a.targetConceptId && b.targetConceptId) return 1;
			return 0;
		});

		const template = sorted[0];
		if (!template) return "";

		return TemplateRenderer.renderTemplate(
			template,
			rootNote,
			templates,
			new Set<string>(),
		);
	}

	/**
	 * Selects a template for a parsed item following the priority order:
	 * 1. Explicit templateId (if supplied)
	 * 2. Templates matching targetSchema
	 * 3. Among those, prefer matching targetConceptId
	 * 4. Prefer matching workspaceId
	 * 5. First deterministic candidate by templateId
	 */
	private static selectTemplateForItem(
		item: ParsedItem,
		templates: ClinicalProseTemplate[],
		cell: Cell,
		explicitTemplateId?: string,
	): ClinicalProseTemplate | undefined {
		// 1. Explicit templateId
		if (explicitTemplateId) {
			return templates.find((t) => t.templateId === explicitTemplateId);
		}

		// 2. Templates matching targetSchema
		const schemaMatches = templates.filter(
			(t) => t.targetSchema === item.targetSchema,
		);
		if (schemaMatches.length === 0) return undefined;

		// 3. Among those, prefer matching targetConceptId
		const conceptIds = new Set(
			item.concept?.map((c) => c.conceptId).filter(Boolean) ?? [],
		);
		const conceptMatches = schemaMatches.filter(
			(t) => t.targetConceptId && conceptIds.has(t.targetConceptId),
		);

		// 4. Prefer matching workspaceId
		const workspaceId = cell.workspaceId;
		const pool = conceptMatches.length > 0 ? conceptMatches : schemaMatches;
		const workspaceMatches = workspaceId
			? pool.filter((t) => t.workspaceId === workspaceId)
			: [];

		// 5. First deterministic candidate by templateId
		const finalPool = workspaceMatches.length > 0 ? workspaceMatches : pool;
		const sorted = [...finalPool].sort((a, b) =>
			a.templateId.localeCompare(b.templateId),
		);
		return sorted[0];
	}

	/**
	 * Selects a template for a narrative cell (no parsed item).
	 * Uses explicit templateId if supplied, otherwise looks for templates
	 * targeting the cell's narrativeTarget field path.
	 */
	private static selectTemplateForNarrative(
		cell: Cell,
		templates: ClinicalProseTemplate[],
	): ClinicalProseTemplate | undefined {
		// For narrative cells, we don't have a targetSchema from parsed output.
		// Look for templates that might be explicitly designed for narrative rendering.
		// This is a best-effort match — narrative cells typically don't use templates.
		return undefined;
	}

	/**
	 * Builds a template context from a cell and optional parsed item.
	 *
	 * Exposes both normalized paths (cell, parsedItem, context, rawInput, metadata)
	 * and convenient root-level access to extractedData fields for backward
	 * compatibility with existing templates.
	 *
	 * Reserved keys (cell, parsedItem, context, rawInput, metadata) are
	 * authoritative and not overwritten by extractedData fields.
	 */
	private static buildCellTemplateContext(
		cell: Cell,
		parsedItem?: ParsedItem,
	): CellTemplateContext {
		const context: CellTemplateContext = {
			cell,
			parsedItem,
			extractedData: parsedItem?.extractedData,
			attributes: parsedItem?.attributes,
			concepts: parsedItem?.concept,
			rawInput: cell.rawInput,
			narrativeTarget: cell.narrativeTarget,
			metadata: cell.metadata,
			context: cell.context,
		};

		// Also expose extracted fields at the root for convenient template access
		// (e.g., {severity}, {measurement}, {concept.display})
		// Reserved keys remain authoritative — do not overwrite them.
		const reservedKeys = new Set([
			"cell",
			"parsedItem",
			"context",
			"rawInput",
			"metadata",
			"extractedData",
			"attributes",
			"concepts",
			"narrativeTarget",
		]);

		if (parsedItem?.extractedData) {
			for (const [key, value] of Object.entries(parsedItem.extractedData)) {
				if (!reservedKeys.has(key)) {
					(context as any)[key] = value;
				}
			}
		}

		// Also expose concept at root for {concept.display} style paths
		if (parsedItem?.concept && parsedItem.concept.length > 0) {
			if (!reservedKeys.has("concept")) {
				(context as any).concept = parsedItem.concept[0];
			}
		}

		return context;
	}
}

export { TemplateWalker } from "./template-walker";
