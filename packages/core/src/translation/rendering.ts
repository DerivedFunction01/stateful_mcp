import { executePipeline } from "./pipeline";
import type { PipelineStep } from "./types";

export function resolveTranslationPath(value: unknown, path: string): unknown {
	if (!path || path === "$root") return value;
	let current = value;
	for (const segment of path.split(".")) {
		if (current === undefined || current === null) return undefined;
		const index = Number.parseInt(segment, 10);
		current = !Number.isNaN(index)
			? (current as unknown[])[index]
			: (current as Record<string, unknown>)[segment];
	}
	return current;
}

export function normalizeTranslationInput(
	value: unknown,
): Record<string, unknown> {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: { "": value };
}

export function evaluateTranslationCondition(
	pipeline: PipelineStep[],
	value: unknown,
): boolean {
	return Boolean(
		executePipeline(pipeline, normalizeTranslationInput(value), {}),
	);
}

export function formatTranslationValue(
	value: unknown,
	format?: string,
): string {
	if (value === undefined || value === null) return "";
	if (!format) {
		if (Array.isArray(value))
			return value.map((item) => formatTranslationValue(item)).join(", ");
		return typeof value === "object" ? JSON.stringify(value) : String(value);
	}
	return format.replace(/\{([a-zA-Z0-9_.$-]+)\}/g, (token, path: string) => {
		const resolved = resolveTranslationPath(value, path);
		return resolved === undefined || resolved === null ? "" : String(resolved);
	});
}

export function joinTranslationList(
	items: readonly string[],
	options?: { delimiter: string; lastDelimiter?: string },
): string {
	const clean = items.filter((item) => item.trim().length > 0);
	if (clean.length < 2) return clean[0] ?? "";
	if (!options?.lastDelimiter) return clean.join(options?.delimiter ?? ", ");
	return `${clean.slice(0, -1).join(options.delimiter)}${options.lastDelimiter}${clean.at(-1)}`;
}
