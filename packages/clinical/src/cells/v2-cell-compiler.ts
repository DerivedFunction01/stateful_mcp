import { MacroCompiler } from "../macros/macro-compiler";
import type { MacroStore } from "../macros/macro-definition";
import { parseMacroLine } from "../macros/macro-input-parser";
import type { MacroExecutionPlan } from "../macros/macro-plan";
import type { V2SyntaxProfile } from "../macros/macro-profile";
import { createV2SyntaxProfile } from "../macros/macro-profile";
import type { SchemaRegistry } from "../schemas/schema-registry";
import type { ConceptLookup } from "../values/concept-value";

export interface V2CellCompileContext {
	sessionId?: string;
	workspaceId?: string;
	documentId?: string;
}

export interface V2CellCompileResult {
	plan?: MacroExecutionPlan;
	diagnostics: string[];
	fingerprint: string;
}

export class V2CellCompiler {
	private readonly compiler: MacroCompiler;
	private readonly profile: V2SyntaxProfile;

	constructor(
		private readonly macros: MacroStore,
		registry: SchemaRegistry,
		dictionary?: ConceptLookup,
		profile: V2SyntaxProfile = createV2SyntaxProfile({
			profileId: "v2-default",
		}),
	) {
		this.profile = profile;
		this.compiler = new MacroCompiler({ registry, dictionary });
	}

	async compile(
		rawText: string,
		context: V2CellCompileContext = {},
	): Promise<V2CellCompileResult> {
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
						"Direct commands must be executed through V2CommandBarService",
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
				diagnostics: [`V2 macro '${parsed.macroName}' is not defined`],
				fingerprint: fingerprint(rawText, parsed.macroName),
			};
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
		const result = await this.compiler.compile(parsed, definition, { scope });
		return {
			plan: result.plan,
			diagnostics: result.diagnostics,
			fingerprint:
				result.plan?.fingerprint.value ??
				fingerprint(rawText, definition.macroId),
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
