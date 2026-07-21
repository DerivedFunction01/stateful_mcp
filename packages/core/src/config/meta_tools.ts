import { resolveSource } from "./loader";
import type { ResourceLocator } from "./types";

/**
 * Default fallback list of framework meta-tools, guidance tools (*_about, *_examples),
 * and session state initialization tools that must be excluded from step recording.
 */
export const DEFAULT_NON_RECORDABLE_SERVICE_TOOLS: readonly string[] = [
	"middleware_about",
	"filter_about",
	"filter_examples",
	"object_about",
	"object_examples",
	"form_about",
	"form_examples",
	"event_about",
	"event_examples",
	"dictionary_about",
	"dictionary_examples",
	"log_about",
	"log_examples",
	"trace_record",
	"trace_query",
	"trace_inspect",
	"trace_refine",
	"trace_feedback",
	"trace_about",
	"trace_examples",
];

export interface MetaToolsConfig {
	version?: number;
	non_recordable_tools: string[];
}

export class NonRecordableToolsRegistry {
	private tools = new Set<string>(DEFAULT_NON_RECORDABLE_SERVICE_TOOLS);

	constructor(initialTools: string[] = []) {
		for (const tool of initialTools) {
			this.tools.add(tool);
		}
	}

	public register(toolName: string) {
		this.tools.add(toolName);
	}

	public unregister(toolName: string) {
		this.tools.delete(toolName);
	}

	public isRecordable(toolName: string): boolean {
		return !this.tools.has(toolName);
	}

	public getIgnoredTools(): string[] {
		return Array.from(this.tools);
	}
}

/**
 * Load non-recordable tools configuration via a ResourceLocator (file, remote_url, adapter).
 */
export async function loadMetaToolsConfig(
	locator: ResourceLocator,
	workspaceRoot: string,
): Promise<string[]> {
	try {
		const raw = (await resolveSource(locator, workspaceRoot)) as
			| MetaToolsConfig
			| string[];
		if (Array.isArray(raw)) {
			return raw;
		}
		if (raw && Array.isArray(raw.non_recordable_tools)) {
			return raw.non_recordable_tools;
		}
	} catch (_err) {
		// Return default fallback list on missing or invalid resource
	}
	return [...DEFAULT_NON_RECORDABLE_SERVICE_TOOLS];
}
