import type { DictionaryStore } from "@stateful-mcp/core";
import type { WorkspaceStore } from "../engine/workspace-store";
import type { CdslParser, ClinicalParseResult } from "../parser/cdsl-parser";
import { planCommandMacroBatch } from "../parser/command/command-macro-graph";
import type { CommandMacroCellPlan } from "../parser/command/command-macro-ir";
import {
	type CommandMacroRenderValue,
	renderCommandMacroTargets,
} from "../parser/command/command-macro-renderer";
import type { ParsedItem } from "../parser/schema-parsers";
import { schemaParserRegistry } from "../parser/schema-parsers";
import type { TextPreprocessor } from "../parser/text-preprocessor";
import type { SoapNote } from "../schemas/document";
import type { SoapSection } from "../schemas/shared";
import type { CellStore } from "../store/interfaces";
import type { ParserCommandMacroStore } from "../store/parser/command-macros/interfaces";
import type { CommandTemplateStore } from "../store/reference/command-templates/interfaces";
import type { Cell } from "./cell";
import { CELL_ERROR_MESSAGES, CellError } from "./cell";
import type { CellCommandContext } from "./cell-command";
import { CellCommandParser } from "./cell-command-parser";
import { CellCommandRegistry } from "./cell-command-registry";
import type { CellDocumentExecutor } from "./cell-execution";
import {
	type CellInterpretationSource,
	type CellInterpretationSummary,
	createCellInterpretationSummary,
} from "./cell-interpretation-summary";
import { WorkspaceCommandParser } from "./workspace-command-parser";

function computePreviewFingerprint(cell: Cell): string {
	const routing = cell.routing;
	const parts = [
		cell.rawInput,
		routing.scope ?? "",
		routing.targetSchema ?? "",
		routing.branchId ?? "",
		routing.resolvedSchema ?? "",
	];
	return parts.join("::");
}

function clearPreviewData(cell: Cell): void {
	cell.parsedOutput = null;
	cell.workspaceCommands = undefined;
	cell.workspaceCommandWarnings = undefined;
	cell.errorMessage = undefined;
	cell.lockedAt = undefined;
	cell.status = "draft";
	cell.metadata = {
		...cell.metadata,
		previewFingerprint: undefined,
	};
	cell.interpretation = undefined;
}

function compactConfidence(
	result: ClinicalParseResult,
): Cell["interpretation"] {
	if (!result.confidence) return undefined;
	return {
		confidence: {
			score: result.confidence.score,
			level: result.confidence.level,
			breakdown: result.confidence.breakdown,
		},
	};
}

const emptyParseResult = (): ClinicalParseResult => ({
	items: [],
	scoredItems: [],
});

export interface PreprocessResult {
	cleanedText: string;
	cell: Cell;
}

export interface CellProcessResult {
	cell: Cell;
	soapNote?: SoapNote;
	workspaceId?: string;
	preview?: ParsedItem[];
	parseResult?: ClinicalParseResult;
	error?: { code: CellError; message?: string };
}

export class CellProcessor {
	constructor(
		private documentExecutor: CellDocumentExecutor,
		private workspaceStore?: WorkspaceStore,
		private parser?: CdslParser,
		private preprocessor?: TextPreprocessor,
		private cellStore?: CellStore,
		private cellCommandRegistry: CellCommandRegistry = CellCommandRegistry.createDefault(),
		private commandMacroStore?: ParserCommandMacroStore,
		private commandTemplateStore?: CommandTemplateStore,
		private dictionaryStore?: DictionaryStore,
	) {}

	private buildMacroGeneratedCells(
		cell: Cell,
		plans: readonly CommandMacroCellPlan[],
	): Cell[] {
		const generatedIds = new Map(
			plans.map((plan, index) => [
				plan.cellRef,
				`macro-generated:${cell.cellId}:${index}`,
			]),
		);
		const now = new Date().toISOString();
		return plans.map((plan, index) => {
			const generatedCellId = generatedIds.get(plan.cellRef)!;
			const parentCellId = plan.parentRef
				? generatedIds.get(plan.parentRef)
				: undefined;
			const firstOperation = plan.operations[0];
			return {
				cellId: generatedCellId,
				sessionId: cell.sessionId,
				collection: { ...cell.collection },
				intentKind: "directed_value",
				mode: "cdsl",
				rawInput: plan.operations
					.map((operation) => operation.rawValue)
					.join(" "),
				routing: {
					scope: "global",
					targetSchema: plan.targetSchema,
					resolvedSchema: plan.targetSchema,
				},
				parsedOutput: null,
				status: "pending_commit",
				updatedAt: now,
				parentCellId,
				linkTarget:
					parentCellId && plan.linkTarget
						? {
								targetSchema: plan.targetSchema,
								targetCellId: parentCellId,
								targetField: plan.linkTarget.targetField,
								mergeStrategy: plan.linkTarget.mergeStrategy,
							}
						: undefined,
				context: { objects: {}, sourceType: "manual_entry" },
				metadata: {
					macroGenerated: true,
					sourceMacroCellId: cell.cellId,
					macroBatchId: cell.macro?.batchId ?? cell.cellId,
					macroLine: firstOperation?.sourceLine ?? index + 1,
					macroDefinitionId: plan.macroDefinitionId,
					macroDefinitionVersion: plan.macroDefinitionVersion,
					operationIds: plan.operations.map(
						(operation) => operation.operationId,
					),
				},
			};
		});
	}

	private async executeCommandMacro(
		cell: Cell,
	): Promise<CellProcessResult | null> {
		if (cell.mode !== "macro" && cell.intentKind !== "macro_command")
			return null;
		if (!this.commandMacroStore)
			return {
				cell,
				error: this.cellError(
					CellError.PARSER_NOT_CONFIGURED,
					"command macro store is not configured",
				),
			};
		const diagnostics: string[] = [];
		const rendered: Array<{
			line: number;
			text: string;
			status: string;
			diagnostics?: string[];
		}> = [];
		const confirmation: typeof rendered = [];
		const audit: typeof rendered = [];
		const graphResult = await planCommandMacroBatch(
			cell.rawInput,
			this.commandMacroStore,
			{
				groupId: cell.macro?.batchId ?? cell.cellId,
				cellRefPrefix: cell.cellId,
				dictionaryStore: this.dictionaryStore,
			},
		);
		diagnostics.push(
			...graphResult.diagnostics.map(
				(item) => `line ${item.line ?? "?"}: ${item.message}`,
			),
		);
		for (const [lineIndex, line] of cell.rawInput.split(/\r?\n/).entries()) {
			if (!line.trim()) continue;
			const name = line.trim().replace(/^\^/, "").split(/\s+/, 1)[0] ?? "";
			const macro = await this.commandMacroStore.get(name);
			if (macro?.renderTemplateIds && this.commandTemplateStore) {
				const plan = graphResult.graph?.plans.find((candidate) =>
					candidate.operations.some(
						(operation) => operation.sourceLine === lineIndex + 1,
					),
				);
				const values: Record<string, CommandMacroRenderValue> = {};
				for (const operation of plan?.operations ?? []) {
					const argument = macro.arguments[operation.sourceArgument];
					if (argument)
						values[argument.argumentId] = {
							value: operation.value,
							status: "assigned",
							evidence: operation.evidence,
						};
				}
				const renderStage = async (
					stage: "preview" | "confirmation" | "audit",
					target: typeof rendered,
				): Promise<void> => {
					const templateId = macro.renderTemplateIds?.[stage];
					if (!templateId) return;
					const template = await this.commandTemplateStore!.getById(templateId);
					if (!template) {
						target.push({
							line: lineIndex + 1,
							text: "",
							status: "invalid",
							diagnostics: [`missing ${stage} render template '${templateId}'`],
						});
						return;
					}
					const output = renderCommandMacroTargets(template, {
						values,
						data: {
							arguments: values,
							execution: { batchId: graphResult.graph?.groupId, stage },
						},
					});
					target.push({ line: lineIndex + 1, ...output });
				};
				await renderStage("preview", rendered);
				await renderStage("confirmation", confirmation);
				await renderStage("audit", audit);
			}
		}
		if (diagnostics.length) {
			cell.status = "error";
			cell.errorMessage = diagnostics.join("; ");
			cell.macro = {
				...(cell.macro ?? { batchId: cell.cellId, definitionIds: [] }),
				status: "error",
				diagnostics,
			};
			await this.saveCell(cell);
			return {
				cell,
				error: this.cellError(
					CellError.PARSER_NOT_CONFIGURED,
					cell.errorMessage,
				),
			};
		}
		if (!graphResult.graph) diagnostics.push("macro graph was not compiled");
		if (
			graphResult.graph?.links.length &&
			!this.documentExecutor.applyMacroGraph &&
			!this.documentExecutor.applyMacroLink
		)
			diagnostics.push(
				"macro graph contains links but the document transaction adapter does not support links",
			);
		if (diagnostics.length) {
			cell.status = "error";
			cell.errorMessage = diagnostics.join("; ");
			cell.macro = {
				...(cell.macro ?? { batchId: cell.cellId, definitionIds: [] }),
				status: "error",
				diagnostics,
			};
			await this.saveCell(cell);
			return {
				cell,
				error: this.cellError(
					CellError.PARSER_NOT_CONFIGURED,
					cell.errorMessage,
				),
			};
		}
		const generatedCells = this.cellStore
			? this.buildMacroGeneratedCells(cell, graphResult.graph!.plans)
			: [];
		try {
			cell.status = "pending_commit";
			cell.macro = {
				...(cell.macro ?? { batchId: cell.cellId, definitionIds: [] }),
				status: "pending_commit",
			};
			await this.saveCell(cell);
			for (const generatedCell of generatedCells)
				await this.cellStore!.save(generatedCell);
			const graphApplication = this.documentExecutor.applyMacroGraph
				? await this.documentExecutor.applyMacroGraph(
						cell.sessionId,
						graphResult.graph!,
						cell.sessionId,
					)
				: undefined;
			if (!graphApplication) {
				for (const plan of graphResult.graph!.plans)
					for (const operation of plan.operations)
						await this.documentExecutor.setSoapNoteField(
							cell.sessionId,
							operation.targetPath,
							operation.value,
						);
				for (const link of graphResult.graph!.links)
					await this.documentExecutor.applyMacroLink!(cell.sessionId, link);
			}
			cell.status = "committed";
			cell.lockedAt = new Date().toISOString();
			const provenance = graphResult.graph!.plans.flatMap((plan) =>
				plan.operations.map((operation) => ({
					sourceMacroCellId: cell.cellId,
					macroBatchId: graphResult.graph!.groupId,
					macroLine: operation.sourceLine,
					macroDefinitionId: plan.macroDefinitionId ?? "",
				})),
			);
			const executionTrace = graphResult.graph!.plans.flatMap((plan) =>
				plan.operations.map((operation) => ({
					phase: "apply" as const,
					status: "completed" as const,
					operationId: operation.operationId,
					line: operation.sourceLine,
					createdAt: new Date().toISOString(),
				})),
			);
			for (const generatedCell of generatedCells) {
				generatedCell.status = "committed";
				generatedCell.updatedAt = new Date().toISOString();
				await this.cellStore!.save(generatedCell);
			}
			cell.macro = {
				...(cell.macro ?? { batchId: cell.cellId, definitionIds: [] }),
				status: "committed",
				preview: rendered,
				rendered: { preview: rendered, confirmation, audit },
				definitionIds: graphResult.graph!.definitionIds,
				definitionVersions: graphResult.graph!.definitionVersions,
				compiledPlan: graphResult.graph,
				generatedCellIds: generatedCells.map(
					(generatedCell) => generatedCell.cellId,
				),
				compatibilitySignature: graphResult.graph!.compatibilitySignature,
				provenance,
				executionTrace,
			};
			cell.metadata = {
				...cell.metadata,
				macroOperations: graphResult.graph!.plans.reduce(
					(count, plan) => count + plan.operations.length,
					0,
				),
				macroLinks: graphResult.graph!.links.length,
			};
			await this.saveCell(cell);
			return { cell };
		} catch (error) {
			for (const generatedCell of generatedCells) {
				try {
					await this.cellStore?.delete(generatedCell.cellId);
				} catch {
					/* best-effort compensation */
				}
			}
			cell.status = "error";
			cell.errorMessage =
				error instanceof Error ? error.message : String(error);
			cell.macro = {
				...(cell.macro ?? { batchId: cell.cellId, definitionIds: [] }),
				status: "error",
				diagnostics: [cell.errorMessage],
			};
			await this.saveCell(cell);
			return {
				cell,
				error: this.cellError(
					CellError.PARSER_NOT_CONFIGURED,
					cell.errorMessage,
				),
			};
		}
	}

	/** Returns a read-only, presentation-safe projection of a cell. */
	getCellInterpretationSummary(
		cell: CellInterpretationSource,
	): CellInterpretationSummary {
		return createCellInterpretationSummary({
			...cell,
			presentationContext: this.parser
				? { profile: this.parser.getProfile() }
				: undefined,
		});
	}

	private async executeCellCommand(
		cell: Cell,
	): Promise<CellProcessResult | null> {
		if (!this.parser) return null;
		const token = this.parser.getProfile().cellCommandToken || ":";
		if (!cell.rawInput.trim().startsWith(token)) return null;
		const command = CellCommandParser.parse(
			cell.rawInput,
			this.parser.getProfile(),
		);
		if (
			cell.collection.kind === "workspace" &&
			command &&
			this.parser.getProfile().workspaceCommandMappings?.[command.verb]
		) {
			return null;
		}
		if (!command)
			return {
				cell,
				error: this.cellError(
					CellError.PARSER_NOT_CONFIGURED,
					"invalid cell command",
				),
			};
		const context: CellCommandContext = {
			sessionId: cell.sessionId,
			cell,
			parser: this.parser,
			workspaceStore: this.workspaceStore,
			profile: this.parser.getProfile(),
			processor: this,
		};
		const result = await this.cellCommandRegistry.dispatch(command, context);
		if (!result.success) {
			cell.status = "error";
			cell.errorMessage = result.message;
			await this.saveCell(cell);
			return {
				cell,
				error: this.cellError(CellError.PARSER_NOT_CONFIGURED, result.message),
			};
		}
		if (result.parsedOutput) cell.parsedOutput = result.parsedOutput;
		cell.status = "committed";
		cell.lockedAt = new Date().toISOString();
		cell.metadata = {
			...cell.metadata,
			cellCommand: command.verb,
			commandOutput: result.output,
		};
		await this.saveCell(cell);
		return {
			cell,
			workspaceId: result.workspaceId,
			preview: result.parsedOutput ?? undefined,
		};
	}

	cellError(
		code: CellError,
		message?: string,
	): { code: CellError; message?: string } {
		return { code, message: message ?? CELL_ERROR_MESSAGES[code] };
	}

	async preprocess(cell: Cell): Promise<PreprocessResult> {
		if (!this.preprocessor) {
			return { cleanedText: cell.rawInput, cell };
		}

		let cleanedText = cell.rawInput;

		cleanedText = await this.preprocessor.expandMacros(cleanedText);

		const directiveMatch = cleanedText.match(
			/^\/notes\/(subjective|objective|assessment|plan|\?)\/([A-Za-z0-9_]+|\?)\s*/,
		);
		if (directiveMatch) {
			const rawSection = directiveMatch[1];
			const rawSchema = directiveMatch[2];
			const section = rawSection === "?" ? null : (rawSection as SoapSection);
			const schema = rawSchema === "?" ? null : rawSchema;
			cell.routing = {
				...cell.routing,
				resolvedSection: section,
				resolvedSchema: schema,
				targetSchema: schema ?? cell.routing.targetSchema,
			};
			cleanedText = cleanedText.slice(directiveMatch[0]?.length ?? 0).trim();
		}

		if (!cell.routing.targetSchema && this.parser) {
			const profile = this.parser.getProfile();
			const tagToken = profile.tagToken || "#";
			const tagRegex = new RegExp(
				`(?:\\s|^)(${tagToken.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}[a-zA-Z0-9_-]+)(?:\\s|$)`,
			);
			const tagMatch = cleanedText.match(tagRegex);
			if (tagMatch && tagMatch[1]) {
				const tag = tagMatch[1]!;
				let cleanKey = tag.startsWith(tagToken)
					? tag.substring(tagToken.length).toLowerCase()
					: tag.toLowerCase();
				if (profile.tagMappings && profile.tagMappings[cleanKey]) {
					cleanKey = profile.tagMappings[cleanKey]!.toLowerCase();
				}
				for (const p of Array.from(schemaParserRegistry.values())) {
					if (p.targetSchema.toLowerCase() === cleanKey) {
						cell.routing = {
							...cell.routing,
							targetSchema: p.targetSchema,
						};
						break;
					}
				}
			}
		}

		return { cleanedText, cell };
	}

	async execute(cell: Cell, alias?: string): Promise<CellProcessResult> {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CELL_IS_DELETED) };
		}
		if (cell.status === "pending_commit") {
			const fingerprint = cell.metadata?.previewFingerprint as
				| string
				| undefined;
			const currentFingerprint = computePreviewFingerprint(cell);
			if (fingerprint && fingerprint !== currentFingerprint) {
				return {
					cell,
					error: this.cellError(
						CellError.PARSER_NOT_CONFIGURED,
						"stale preview — raw input has changed since last preview",
					),
				};
			}
		}
		const macroResult = await this.executeCommandMacro(cell);
		if (macroResult) return macroResult;
		const cellCommandResult = await this.executeCellCommand(cell);
		if (cellCommandResult) return cellCommandResult;

		const { cleanedText } = await this.preprocess(cell);
		const commandResult = this.parser
			? new WorkspaceCommandParser().parseCell(
					cleanedText,
					this.parser.getProfile(),
				)
			: { remainingText: cleanedText, commands: [], warnings: [] };
		cell.workspaceCommands = commandResult.commands;
		cell.workspaceCommandWarnings = commandResult.warnings;

		// Handle narrative mode: directly write rawInput to the targeted SoapNote field
		if (cell.mode === "narrative") {
			if (!cell.narrativeTarget) {
				cell.status = "error";
				cell.errorMessage =
					CELL_ERROR_MESSAGES[CellError.NARRATIVE_TARGET_REQUIRED];
				await this.saveCell(cell);
				return {
					cell,
					error: this.cellError(CellError.NARRATIVE_TARGET_REQUIRED),
				};
			}
			cell.parsedOutput = null;
			cell.metadata = { ...cell.metadata, sourceType: "narrative" };
			try {
				const effectiveAlias = alias ?? cell.sessionId;
				const note = await this.documentExecutor.setSoapNoteField(
					cell.sessionId,
					cell.narrativeTarget,
					cleanedText,
					effectiveAlias,
				);
				cell.status = "committed";
				cell.lockedAt = new Date().toISOString();
				await this.saveCell(cell);
				return { cell, soapNote: note };
			} catch (err) {
				cell.status = "error";
				cell.errorMessage = err instanceof Error ? err.message : String(err);
				await this.saveCell(cell);
				return {
					cell,
					error: {
						code: CellError.PARSER_NOT_CONFIGURED,
						message: cell.errorMessage,
					},
				};
			}
		}

		// Resolve parent context before processing
		const parentError = await this.resolveParentContext(cell);
		if (parentError) return parentError;

		// Save cell before processing for recoverability
		await this.saveCell(cell);

		const effectiveAlias = alias ?? cell.sessionId;

		switch (cell.routing.scope) {
			case "global": {
				if (commandResult.commands.length)
					cell.workspaceCommandWarnings = [
						...commandResult.warnings,
						...commandResult.commands.map(
							() => "NO_WORKSPACE_CONTEXT" as const,
						),
					];
				cell.parsedOutput = null;
				cell.status = "parsing";
				try {
					const result =
						typeof (this.documentExecutor as any).processCdslDetailed ===
						"function"
							? await this.documentExecutor.processCdslDetailed(
									cell.sessionId,
									commandResult.remainingText,
									effectiveAlias,
								)
							: {
									soapNote: await this.documentExecutor.processCdsl(
										cell.sessionId,
										commandResult.remainingText,
										effectiveAlias,
									),
									parseResult: emptyParseResult(),
								};
					cell.interpretation = compactConfidence(result.parseResult);
					const note = result.soapNote;
					cell.status = "committed";
					cell.lockedAt = new Date().toISOString();

					// Post-processing: populate context and resolve link targets
					this.populateContext(cell);
					await this.resolveLinkTarget(cell);

					// Save cell after processing
					await this.saveCell(cell);

					return { cell, soapNote: note };
				} catch (err) {
					cell.status = "error";
					cell.errorMessage = err instanceof Error ? err.message : String(err);
					await this.saveCell(cell);
					return {
						cell,
						error: {
							code: CellError.PARSER_NOT_CONFIGURED,
							message: cell.errorMessage,
						},
					};
				}
			}
			case "branch_local": {
				const workspaceId =
					cell.collection?.kind === "workspace"
						? cell.collection.collectionId
						: (cell as Cell & { workspaceId?: string }).workspaceId;
				if (!workspaceId || !cell.routing.branchId) {
					cell.status = "error";
					cell.errorMessage =
						CELL_ERROR_MESSAGES[CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID];
					await this.saveCell(cell);
					return {
						cell,
						error: this.cellError(CellError.BRANCH_LOCAL_REQUIRES_WORKSPACE_ID),
					};
				}
				if (!this.workspaceStore) {
					cell.status = "error";
					cell.errorMessage =
						CELL_ERROR_MESSAGES[CellError.WORKSPACE_STORE_NOT_CONFIGURED];
					await this.saveCell(cell);
					return {
						cell,
						error: this.cellError(CellError.WORKSPACE_STORE_NOT_CONFIGURED),
					};
				}
				cell.parsedOutput = null;
				cell.status = "parsing";
				try {
					const result =
						typeof (this.workspaceStore as any).processDetailed === "function"
							? await this.workspaceStore.processDetailed(
									cell.sessionId,
									workspaceId,
									cell.routing.branchId,
									commandResult.remainingText,
									commandResult.commands,
								)
							: {
									workspace: await (this.workspaceStore as any).process(
										cell.sessionId,
										workspaceId,
										cell.routing.branchId,
										commandResult.remainingText,
										commandResult.commands,
									),
									parseResult: emptyParseResult(),
								};
					cell.interpretation = compactConfidence(result.parseResult);
					const updatedWorkspace = result.workspace;
					cell.status = "committed";
					cell.lockedAt = new Date().toISOString();

					// Post-processing: populate context and resolve link targets
					this.populateContext(cell);
					await this.resolveLinkTarget(cell);

					// Save cell after processing
					await this.saveCell(cell);

					return { cell, workspaceId: updatedWorkspace.id };
				} catch (err) {
					cell.status = "error";
					cell.errorMessage = err instanceof Error ? err.message : String(err);
					await this.saveCell(cell);
					return {
						cell,
						error: {
							code: CellError.PARSER_NOT_CONFIGURED,
							message: cell.errorMessage,
						},
					};
				}
			}
			case "unresolved": {
				cell.status = "error";
				cell.errorMessage = CELL_ERROR_MESSAGES[CellError.UNRESOLVED_ROUTING];
				await this.saveCell(cell);
				return { cell, error: this.cellError(CellError.UNRESOLVED_ROUTING) };
			}
		}
	}

	resetToDraft(cell: Cell): CellProcessResult {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CELL_IS_DELETED) };
		}
		if (cell.status === "committed") {
			return {
				cell,
				error: this.cellError(
					CellError.CELL_IS_LOCKED,
					"cannot reset a committed cell; create a correction cell instead",
				),
			};
		}
		clearPreviewData(cell);
		cell.updatedAt = new Date().toISOString();
		return { cell };
	}

	edit(cell: Cell, rawInput: string): CellProcessResult {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CELL_IS_DELETED) };
		}
		if (cell.status === "committed") {
			return {
				cell,
				error: this.cellError(
					CellError.CELL_IS_LOCKED,
					"cannot edit a committed cell; create a correction cell instead",
				),
			};
		}
		cell.rawInput = rawInput;
		clearPreviewData(cell);
		cell.updatedAt = new Date().toISOString();
		return { cell };
	}

	async preview(cell: Cell): Promise<CellProcessResult> {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		if (cell.status === "deleted") {
			return { cell, error: this.cellError(CellError.CELL_IS_DELETED) };
		}
		const cellToken =
			this.parser && typeof (this.parser as any).getProfile === "function"
				? (this.parser as any).getProfile().cellCommandToken || ":"
				: ":";
		if (cell.rawInput.trim().startsWith(cellToken)) {
			return {
				cell,
				error: this.cellError(
					CellError.PARSER_NOT_CONFIGURED,
					"preview not available for cell commands",
				),
			};
		}

		// Narrative cells have no preview — rawInput is written directly to the targeted field
		if (cell.mode === "narrative") {
			return {
				cell,
				error: {
					code: CellError.PARSER_NOT_CONFIGURED,
					message: "preview not available for narrative cells",
				},
			};
		}

		if (!this.parser) {
			return { cell, error: this.cellError(CellError.PARSER_NOT_CONFIGURED) };
		}

		const { cleanedText } = await this.preprocess(cell);
		const commandResult =
			typeof (this.parser as any).getProfile === "function"
				? new WorkspaceCommandParser().parseCell(
						cleanedText,
						this.parser.getProfile(),
					)
				: { remainingText: cleanedText, commands: [], warnings: [] };
		cell.workspaceCommands = commandResult.commands;
		cell.workspaceCommandWarnings = commandResult.warnings;

		// Resolve parent context before processing
		const parentError = await this.resolveParentContext(cell);
		if (parentError) return parentError;

		cell.parsedOutput = null;
		cell.status = "parsing";
		try {
			const parseResult =
				typeof (this.parser as any).parseDetailed === "function"
					? await this.parser.parseDetailed(
							commandResult.remainingText,
							undefined,
							{
								targetSchema: cell.routing.targetSchema ?? undefined,
								resolvedSection: cell.routing.resolvedSection ?? undefined,
							},
						)
					: {
							items: await (this.parser as any).parse(
								commandResult.remainingText,
							),
							scoredItems: [],
						};
			cell.parsedOutput = parseResult.items;
			cell.interpretation = compactConfidence(parseResult);
			cell.status = "pending_commit";
			cell.metadata = {
				...cell.metadata,
				previewFingerprint: computePreviewFingerprint(cell),
			};

			// Post-processing: populate context and resolve link targets
			this.populateContext(cell);
			await this.resolveLinkTarget(cell);

			await this.saveCell(cell);

			return { cell, preview: parseResult.items, parseResult };
		} catch (err) {
			cell.status = "error";
			cell.errorMessage = err instanceof Error ? err.message : String(err);
			await this.saveCell(cell);
			return {
				cell,
				error: {
					code: CellError.PARSER_NOT_CONFIGURED,
					message: cell.errorMessage,
				},
			};
		}
	}

	delete(cell: Cell): CellProcessResult {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_LOCKED) };
		}
		cell.status = "deleted";
		cell.parsedOutput = null;
		return { cell };
	}

	lock(cell: Cell): CellProcessResult {
		if (cell.status === "locked") {
			return { cell, error: this.cellError(CellError.CELL_IS_ALREADY_LOCKED) };
		}
		if (cell.status === "deleted") {
			return {
				cell,
				error: this.cellError(CellError.CANNOT_LOCK_DELETED_CELL),
			};
		}
		cell.status = "locked";
		cell.lockedAt = new Date().toISOString();
		return { cell };
	}

	/**
	 * Populate cell.context.objects from parsedOutput after execution.
	 * Each parsed item is stored under its targetSchema group, keyed by cellId_item_{index}.
	 */
	private populateContext(cell: Cell): void {
		if (!cell.parsedOutput) return;
		for (let i = 0; i < cell.parsedOutput.length; i++) {
			const item = cell.parsedOutput[i]!;
			if (!cell.context.objects[item.targetSchema]) {
				cell.context.objects[item.targetSchema] = {};
			}
			const id = `${cell.cellId}_item_${i}`;
			cell.context.objects[item.targetSchema]![id] = item.extractedData;
		}
	}

	/**
	 * Resolve parentCellId by loading the parent cell from the store and
	 * copying its context into the current cell. If the parent is not found,
	 * the cell is set to error state.
	 */
	private async resolveParentContext(
		cell: Cell,
	): Promise<CellProcessResult | null> {
		if (!cell.parentCellId || !this.cellStore) return null;
		const parent = await this.cellStore.get(cell.parentCellId);
		if (!parent) {
			cell.status = "error";
			cell.errorMessage = CELL_ERROR_MESSAGES[CellError.PARENT_CELL_NOT_FOUND];
			return {
				cell,
				error: this.cellError(CellError.PARENT_CELL_NOT_FOUND),
			};
		}
		cell.context = structuredClone(parent.context);
		return null;
	}

	/**
	 * Resolve linkTarget by finding the target object in the parent cell's
	 * context and applying the merge strategy.
	 */
	private async resolveLinkTarget(cell: Cell): Promise<void> {
		if (!cell.linkTarget || !cell.parsedOutput || !this.cellStore) return;

		const { targetSchema, targetCellId, targetField, mergeStrategy } =
			cell.linkTarget;

		// Find the parent cell to get its context.objects
		const parent = await this.cellStore.get(targetCellId);
		if (!parent) return;

		// Find the target object in parent's context
		const targetContainer = parent.context.objects[targetSchema];
		if (!targetContainer) return;

		// Find the matching item — use the first item matching targetSchema
		const targetObj = Object.values(targetContainer)[0];
		if (!targetObj) return;

		// Navigate to targetField (dot-separated path)
		const fieldParts = targetField.split(".");
		let current: any = targetObj;
		for (let i = 0; i < fieldParts.length - 1; i++) {
			const part = fieldParts[i]!;
			current = current?.[part];
			if (!current) return;
		}
		const lastField = fieldParts[fieldParts.length - 1]!;

		// Apply mergeStrategy using the first parsed item's extractedData
		const newValue = cell.parsedOutput[0]?.extractedData;
		if (!newValue) return;

		switch (mergeStrategy) {
			case "replace":
				current[lastField] = newValue;
				break;
			case "append":
				if (!Array.isArray(current[lastField])) {
					current[lastField] = [];
				}
				(current[lastField] as unknown[]).push(newValue);
				break;
			case "deep_merge":
				current[lastField] = {
					...(current[lastField] as Record<string, unknown>),
					...newValue,
				};
				break;
			case "partial_fill":
				current[lastField] = {
					...newValue,
					...(current[lastField] as Record<string, unknown>),
				};
				break;
		}

		// Save the parent cell with the updated context
		await this.cellStore.save(parent);
	}

	/**
	 * Save cell to the store if configured. Silently no-ops if no store.
	 */
	private async saveCell(cell: Cell): Promise<void> {
		if (!this.cellStore) return;
		await this.cellStore.save(cell);
	}
}
