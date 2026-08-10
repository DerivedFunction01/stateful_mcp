import {
	isLegacySetupSource,
	type SetupSourceStore,
	withSetupStatus,
} from "./setup-store";
import type { SetupSourceDocument } from "./setup-types";
import { validateSetupSource } from "./setup-validator";

export async function publishSetupSource(
	store: SetupSourceStore,
	source: SetupSourceDocument,
): Promise<SetupSourceDocument> {
	const validation = validateSetupSource(source);
	if (!validation.valid)
		throw new Error(
			validation.diagnostics.map((item) => item.message).join("; "),
		);
	const published = withSetupStatus(source, "published");
	await store.set(published);
	return published;
}

export async function activateSetupSource(
	store: SetupSourceStore,
	sourceId: string,
): Promise<SetupSourceDocument> {
	const source = await store.get(sourceId);
	if (!source) throw new Error(`Setup source '${sourceId}' was not found`);
	if (source.status !== "published" && source.status !== "active")
		throw new Error(
			`Setup source '${sourceId}' must be published before activation`,
		);
	const sources = await store.list();
	for (const candidate of sources) {
		if (candidate.status === "active" && candidate.sourceId !== sourceId)
			await store.set(withSetupStatus(candidate, "retired"));
	}
	const active = withSetupStatus(source, "active");
	await store.set(active);
	return active;
}

export async function deactivateSetupSource(
	store: SetupSourceStore,
	sourceId: string,
): Promise<SetupSourceDocument> {
	const source = await store.get(sourceId);
	if (!source) throw new Error(`Setup source '${sourceId}' was not found`);
	const retired = withSetupStatus(source, "retired");
	await store.set(retired);
	return retired;
}

export async function rollbackSetupSource(
	store: SetupSourceStore,
	sourceId: string,
): Promise<SetupSourceDocument> {
	const target = await store.get(sourceId);
	if (!target) throw new Error(`Setup source '${sourceId}' was not found`);
	if (target.status === "retired") {
		const published = withSetupStatus(target, "published");
		await store.set(published);
	}
	return activateSetupSource(store, sourceId);
}

export function diffSetupSources(
	left: SetupSourceDocument,
	right: SetupSourceDocument,
): { changes: string[] } {
	const changes: string[] = [];
	for (const key of [
		"primitiveProfile",
		"concepts",
		"expressions",
		"conceptFilters",
		"placements",
		"blocks",
		"macros",
	] as const) {
		if (JSON.stringify(left[key]) !== JSON.stringify(right[key]))
			changes.push(key);
	}
	return { changes };
}

export function selectBootstrapSetupSource(
	sources: SetupSourceDocument[],
): SetupSourceDocument | undefined {
	const active = sources.filter((source) => source.status === "active");
	if (active.length > 1)
		throw new Error("Multiple active clinical setup sources are configured");
	if (active[0]) return active[0];
	// Development compatibility for documents written before lifecycle support.
	if (sources.length > 0 && sources.every(isLegacySetupSource))
		return [...sources].sort((left, right) =>
			right.updatedAt.localeCompare(left.updatedAt),
		)[0];
	return undefined;
}
