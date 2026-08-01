import { schemaParserRegistry } from "../parser/schema-parsers";
import type { ParserSyntaxProfile } from "../store/interfaces";

/**
 * The four main SOAP section codes. These are locale-neutral canonical
 * identifiers (matching the `SoapSection` type), NOT display labels.
 * Display strings are resolved through the locale dictionary in the CLI.
 */
export const SOAP_SECTIONS = [
	"subjective",
	"objective",
	"assessment",
	"plan",
] as const;

export const CELL_MODES = ["cdsl", "narrative", "js_script"] as const;

export function isSoapSection(value: string): boolean {
	return (SOAP_SECTIONS as readonly string[]).includes(value);
}

/**
 * All runtime-registered schema keys from the schema parser registry.
 */
export function getAllSchemaKeys(): string[] {
	return Array.from(schemaParserRegistry.keys());
}

export type SectionSchemaResolver = (section: string) => string[];

/**
 * Resolve the locale-neutral completion codes for a given command (verb) at a
 * given argument index. Returns an empty array when the command/arg has no
 * meaningful code completions (so the UI stops suggesting SOAP sections for
 * unrelated verbs like `:workspace`).
 *
 * @param verb                the typed command verb (lowercased)
 * @param argIndex            zero-based argument position being completed
 * @param profile             active parser syntax profile (for mappings)
 * @param prevArgs            previously typed argument values (for context, e.g. the chosen section)
 * @param getSchemasForSection optional engine-provided section->schema resolver
 */
export function resolveArgCompletions(
	verb: string,
	argIndex: number,
	profile: ParserSyntaxProfile,
	prevArgs: string[] = [],
	getSchemasForSection?: SectionSchemaResolver,
): string[] {
	const v = verb.toLowerCase();

	if (v === "mode") {
		return argIndex === 0 ? [...CELL_MODES] : [];
	}

	if (v === "workspace") {
		return argIndex === 0
			? Object.keys(profile.workspaceCommandMappings ?? {})
			: [];
	}

	if (v === "default" || v === "set-default" || v === "set-default-insert") {
		if (argIndex === 0) return [...SOAP_SECTIONS];
		if (argIndex === 1) {
			const section = prevArgs[0];
			if (section && isSoapSection(section) && getSchemasForSection) {
				return getSchemasForSection(section);
			}
			return [];
		}
		return [];
	}

	if (v === "set") {
		return argIndex === 0 ? Object.keys(profile.fieldMappings ?? {}) : [];
	}

	if (v === "link") {
		return argIndex === 0 ? getAllSchemaKeys() : [];
	}

	return [];
}
