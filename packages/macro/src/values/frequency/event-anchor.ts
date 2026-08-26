import { parseNumericValue } from "../numeric";
import { escapeRegex } from "../regex";
import { validateAndResolve } from "./grammar-validation";
import type { CadenceParseContext } from "./parse-context";
import type { CadenceSchedule, CadenceScheduleResolution } from "./types";

/**
 * 5. Match Event Anchors with Optional Relative Offsets
 * (e.g. "at bedtime", "30 min before meals", "就寝前", "睡前").
 */
export function tryEventAnchor<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	ctx: CadenceParseContext<TAnchor, TUnit>,
): CadenceScheduleResolution<TAnchor, TUnit> | undefined {
	const {
		config,
		eventAnchorAliases,
		relativeOffsetConnectors,
		workingText,
		isConditional,
		conditionReason,
		rawText,
		diagnostics,
		policy,
		resolveTimeUnit,
	} = ctx;

	for (const [anchorKey, aliases] of Object.entries(eventAnchorAliases)) {
		const sortedAliases = [...aliases].sort((a, b) => b.length - a.length);
		for (const alias of sortedAliases) {
			const anchorRegex = new RegExp(
				`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}])`,
				"iu",
			);
			const match = workingText.match(anchorRegex);
			if (match && match.index !== undefined) {
				const prefix = workingText.slice(0, match.index).trim();
				const postfix = workingText.slice(match.index + match[0].length).trim();

				let relativeOffset:
					| CadenceSchedule<TAnchor, TUnit>["relativeOffset"]
					| undefined;

				const relativeOffsetEntries = Object.entries(
					relativeOffsetConnectors,
				) as ["before" | "after" | "at" | "with", readonly string[]][];

				// 5a. Prefix relative offset check (e.g. "30 min before meals" or "at bedtime")
				if (prefix) {
					for (const [dir, dirAliases] of relativeOffsetEntries) {
						const sortedDirAliases = [...dirAliases].sort(
							(a, b) => b.length - a.length,
						);
						for (const dirAlias of sortedDirAliases) {
							const isDirSymbol = /^[^a-zA-Z0-9\s]+$/u.test(dirAlias);
							const dirPattern = isDirSymbol
								? `\\s*${escapeRegex(dirAlias)}$`
								: `(?:\\s+|^)${escapeRegex(dirAlias)}$`;
							const offsetRegex = new RegExp(
								`^(?:(?<mag>[\\d\\p{Nd}]+(?:[.,][\\d\\p{Nd}]+)?)\\s*(?<unit>[\\p{L}]+))?${dirPattern}`,
								"iu",
							);
							const offsetMatch = prefix.match(offsetRegex);
							if (offsetMatch) {
								const magRes = offsetMatch.groups?.mag
									? parseNumericValue(
											offsetMatch.groups.mag,
											config.numericConfig,
										)
									: undefined;
								const unit = offsetMatch.groups?.unit
									? resolveTimeUnit(offsetMatch.groups.unit)
									: undefined;
								relativeOffset = {
									direction: dir,
									...(magRes?.parsed && unit
										? { duration: { magnitude: magRes.parsed.value, unit } }
										: {}),
								};
								break;
							}
						}
						if (relativeOffset) break;
					}

					// Pure duration in prefix if anchor itself implies direction
					if (!relativeOffset) {
						const pureDurationRegex =
							/^(?<mag>[\d\p{Nd}]+(?:[.,][\d\p{Nd}]+)?)\s*(?<unit>[\p{L}]+)$/iu;
						const durMatch = prefix.match(pureDurationRegex);
						if (durMatch?.groups?.mag && durMatch.groups.unit) {
							const magRes = parseNumericValue(
								durMatch.groups.mag,
								config.numericConfig,
							);
							const unit = resolveTimeUnit(durMatch.groups.unit);
							if (magRes?.parsed && unit) {
								let detectedDir: "before" | "after" | "at" | "with" = "at";
								for (const [dir, dirAliases] of relativeOffsetEntries) {
									if (
										dirAliases.some((da) =>
											alias
												.toLocaleLowerCase(config.locales as string)
												.startsWith(
													da.toLocaleLowerCase(config.locales as string),
												),
										) ||
										anchorKey.startsWith(dir)
									) {
										detectedDir = dir;
										break;
									}
								}
								relativeOffset = {
									direction: detectedDir,
									duration: { magnitude: magRes.parsed.value, unit },
								};
							}
						}
					}
				}

				// 5b. Postfix relative offset check (e.g. "meals 30 min after", "饭后30分钟", "就寝前", "睡前")
				if (!relativeOffset && postfix) {
					for (const [dir, dirAliases] of relativeOffsetEntries) {
						const sortedDirAliases = [...dirAliases].sort(
							(a, b) => b.length - a.length,
						);
						for (const dirAlias of sortedDirAliases) {
							const isDirSymbol = /^[^a-zA-Z0-9\s]+$/u.test(dirAlias);
							const dirPattern = isDirSymbol
								? `^${escapeRegex(dirAlias)}\\s*`
								: `^${escapeRegex(dirAlias)}(?:\\s+|$)`;

							// Postfix 1: Direction only (e.g. "前", "after", "before") -> NO duration tokens
							const dirOnlyRegex = new RegExp(
								`^${escapeRegex(dirAlias)}$`,
								"iu",
							);
							if (dirOnlyRegex.test(postfix)) {
								relativeOffset = { direction: dir };
								break;
							}

							// Postfix 2: Direction + Duration (e.g. "after 30 min", "前30分钟")
							const dirDurRegex = new RegExp(
								`${dirPattern}(?<mag>[\\d\\p{Nd}]+(?:[.,][\\d\\p{Nd}]+)?)\\s*(?<unit>[\\p{L}]+)$`,
								"iu",
							);
							const dirDurMatch = postfix.match(dirDurRegex);
							if (dirDurMatch?.groups?.mag && dirDurMatch.groups.unit) {
								const magRes = parseNumericValue(
									dirDurMatch.groups.mag,
									config.numericConfig,
								);
								const unit = resolveTimeUnit(dirDurMatch.groups.unit);
								if (magRes.parsed && unit) {
									relativeOffset = {
										direction: dir,
										duration: { magnitude: magRes.parsed.value, unit },
									};
									break;
								}
							}

							// Postfix 3: Duration + Direction (e.g. "30 min after")
							const durDirRegex = new RegExp(
								`^(?<mag>[\\d\\p{Nd}]+(?:[.,][\\d\\p{Nd}]+)?)\\s*(?<unit>[\\p{L}]+)\\s+${escapeRegex(dirAlias)}$`,
								"iu",
							);
							const durDirMatch = postfix.match(durDirRegex);
							if (durDirMatch?.groups?.mag && durDirMatch.groups.unit) {
								const magRes = parseNumericValue(
									durDirMatch.groups.mag,
									config.numericConfig,
								);
								const unit = resolveTimeUnit(durDirMatch.groups.unit);
								if (magRes.parsed && unit) {
									relativeOffset = {
										direction: dir,
										duration: { magnitude: magRes.parsed.value, unit },
									};
									break;
								}
							}
						}
						if (relativeOffset) break;
					}
				}

				// If no prefix/postfix or prefix/postfix successfully matched as relative offset
				if ((!prefix && !postfix) || relativeOffset) {
					const candidate: CadenceSchedule<TAnchor, TUnit> = {
						cadenceType: "event_anchored" as any,
						eventAnchor: anchorKey as TAnchor,
						...(relativeOffset ? { relativeOffset } : {}),
						...(isConditional ? { isConditional: true } : {}),
						...(conditionReason ? { condition: conditionReason } : {}),
						rawText,
					};
					return validateAndResolve(candidate, policy, diagnostics);
				}
			}
		}
	}
	return undefined;
}
