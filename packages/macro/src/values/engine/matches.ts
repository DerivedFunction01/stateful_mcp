import { parseConfiguredArgument } from "./configured";
import type { ConfiguredValueMatch, ConfiguredValueRuntime } from "./types";

export function findConfiguredValueMatches(
	raw: string,
	runtime: ConfiguredValueRuntime,
	argumentId: string,
	regions: readonly { start: number; end: number }[],
	consumerId?: string,
): readonly ConfiguredValueMatch[] {
	return regions.flatMap((region) => {
		if (
			region.start < 0 ||
			region.end > raw.length ||
			region.end <= region.start
		)
			return [];
		const result = parseConfiguredArgument(
			raw.slice(region.start, region.end),
			runtime,
			argumentId,
			consumerId,
		);
		return result.candidates.map((candidate) => ({
			candidate,
			start: region.start,
			end: region.end,
			rawText: raw.slice(region.start, region.end),
		}));
	});
}
