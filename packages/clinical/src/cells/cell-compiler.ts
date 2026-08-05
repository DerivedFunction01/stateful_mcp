import type { MacroLearningTrace } from "../learning/macro-learning-types";
import type { MacroParseLearningStore } from "../learning/macro-parse-learning-store";
import { MacroCompiler } from "../macros/macro-compiler";
import type { MacroStore } from "../macros/macro-definition";
import { parseMacroLine } from "../macros/macro-input-parser";
import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { SyntaxProfile } from "../macros/macro-profile";
import { createSyntaxProfile } from "../macros/macro-profile";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type { ConceptLookup } from "../values/concept-value";

export interface CellCompileContext {
	sessionId?: string;
	workspaceId?: string;
	documentId?: string;
	observationMode?: import("../learning/interfaces").LearningObservationMode;
	outcome?: import("../learning/interfaces").LearningOutcome;
	correlationId?: string;
}

export interface CellCompileResult {
	plan?: MacroExecutionPlan;
	diagnostics: string[];
	fingerprint: string;
	learningTrace?: MacroLearningTrace;
}

export class CellCompiler {
	private readonly compiler: MacroCompiler;
	private readonly profile: SyntaxProfile;

	constructor(
		private readonly macros: MacroStore,
		registry: SchemaRegistry,
		dictionary?: ConceptLookup,
		profile: SyntaxProfile = createSyntaxProfile({
			profileId: "v2-default",
		}),
		macroParseStore?: MacroParseLearningStore,
	) {
		this.profile = profile;
		this.compiler = new MacroCompiler({
			registry,
			dictionary,
			macroParseStore,
		});
	}

	async compile(
		rawText: string,
		context: CellCompileContext = {},
	): Promise<CellCompileResult> {
		const input = rawText.trim();
		if (!input)
			return {
				diagnostics: ["Cell input is empty"],
				fingerprint: fingerprint(rawText),
			};
		const parsed = parseMacroLine(input, 0, { profile: this.profile });
		if (!parsed) {
			if (
				this.profile.directCommandToken &&
				input.startsWith(this.profile.directCommandToken)
			)
				return {
					diagnostics: [
						"Direct commands must be executed through CommandBarService",
					],
					fingerprint: fingerprint(rawText),
				};
			return {
				diagnostics: ["Narrative cell compilation is not configured"],
				fingerprint: fingerprint(rawText),
			};
		}
		const definition = await this.macros.get(parsed.macroName, {
			personnelId: this.profile.personnelId,
			profileId: this.profile.profileId,
		});
		if (!definition)
			return {
				diagnostics: [` macro '${parsed.macroName}' is not defined`],
				fingerprint: fingerprint(rawText, parsed.macroName),
			};
		const definitionAwareInput = parseMacroLine(input, 0, {
			definition,
			profile: this.profile,
		});
		if (!definitionAwareInput) {
			return {
				diagnostics: [`Unable to parse macro '${definition.macroName}'`],
				fingerprint: fingerprint(rawText, definition.macroId),
			};
		}
		const scope = context.documentId
			? {
					kind: "composite" as const,
					sessionId: context.sessionId ?? "",
					workspaceId: context.workspaceId,
					documentId: context.documentId,
				}
			: context.workspaceId
				? {
						kind: "workspace" as const,
						sessionId: context.sessionId ?? "",
						workspaceId: context.workspaceId,
					}
				: {
						kind: "clinical_document" as const,
						sessionId: context.sessionId ?? "",
					};
		const result = await this.compiler.compile(
			definitionAwareInput,
			definition,
			{
				scope,
				sessionId: context.sessionId,
				personnelId: this.profile.personnelId,
				profileId: this.profile.profileId,
				observationMode: context.observationMode,
				outcome: context.outcome,
				correlationId: context.correlationId,
			},
		);
		return {
			plan: result.plan,
			diagnostics: result.diagnostics,
			fingerprint:
				result.plan?.fingerprint.value ??
				fingerprint(rawText, definition.macroId),
			learningTrace: result.learningTrace,
		};
	}
}

function fingerprint(rawText: string, discriminator = ""): string {
	const source = `${discriminator}\u0000${rawText}`;
	let hash = 2166136261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}
