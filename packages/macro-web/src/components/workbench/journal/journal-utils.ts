import type {
	EditorOutputEntryDto,
	GatedActionDescriptorDto,
	MacroArtifactDescriptorDto,
	MacroDisplayFacetsDto,
	MacroExecutionPayloadDto,
} from "@stateful-mcp/macro-protocol";

export type JournalPayload =
	| MacroExecutionPayloadDto
	| Record<string, unknown>
	| undefined;

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getJournalPayload(entry: EditorOutputEntryDto): JournalPayload {
	const { result } = entry;
	if (result && typeof result === "object" && "data" in result) {
		return (result as { data: MacroExecutionPayloadDto }).data;
	}
	return result as JournalPayload;
}

export function getFacets(
	payload: JournalPayload,
): MacroDisplayFacetsDto | undefined {
	return payload && typeof payload === "object" && "facets" in payload
		? (payload as MacroExecutionPayloadDto).facets
		: undefined;
}

export function getArtifacts(
	payload: JournalPayload,
): readonly MacroArtifactDescriptorDto[] | undefined {
	return payload && typeof payload === "object" && "artifacts" in payload
		? (payload as MacroExecutionPayloadDto).artifacts
		: undefined;
}

export function getGatedActions(
	payload: JournalPayload,
): readonly GatedActionDescriptorDto[] | undefined {
	return payload && typeof payload === "object" && "gatedActions" in payload
		? (payload as MacroExecutionPayloadDto).gatedActions
		: undefined;
}
