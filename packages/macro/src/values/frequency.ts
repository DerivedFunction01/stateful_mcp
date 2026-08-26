import type { MessageParam } from "@stateful-mcp/macro-protocol";
import {
	type BaseValueGrammarConfig,
	buildNumericPatternString,
	parseNumericValue,
} from "./numeric";
import { escapeRegex } from "./regex";
import { flattenAndSortAliases } from "./token-matcher";
import {
	compileFormatRegex,
	FREQUENCY_TOKENS,
	type FrequencyToken,
	type ValueFormatConfig,
} from "./token-spec";

export const CADENCE_TYPES = [
	"interval",
	"recurrence",
	"event_anchored",
	"continuous",
	"one_time",
] as const;

export type CadenceType = (typeof CADENCE_TYPES)[number];

export interface CadenceSchedule<
	TAnchor extends string = string,
	TUnit extends string = string,
	TCadence extends string = CadenceType,
> {
	readonly cadenceType: TCadence;
	readonly interval?: {
		readonly multiplier: number;
		readonly unit: TUnit;
		readonly upperMultiplier?: number;
	};
	readonly recurrence?: {
		readonly count: number;
		readonly period: TUnit;
		readonly upperCount?: number;
	};
	readonly eventAnchor?: TAnchor;
	readonly relativeOffset?: {
		readonly direction: "before" | "after" | "at" | "with";
		readonly duration?: {
			readonly magnitude: number;
			readonly unit: TUnit;
		};
	};
	readonly isConditional?: boolean;
	readonly condition?: string;
	readonly rawText?: string;
}

export interface FrequencyGrammarConfig<
	TAnchor extends string = string,
	TUnit extends string = string,
> extends BaseValueGrammarConfig {
	readonly templates?: readonly (ValueFormatConfig<FrequencyToken> | string)[];
	readonly frequencyAliases?: Readonly<
		Record<string, Partial<CadenceSchedule<TAnchor, TUnit>>>
	>;
	readonly multiplierAliases?: Readonly<Record<string, readonly string[]>>;
	readonly timeUnitAliases?: Readonly<Record<TUnit, readonly string[]>>;
	readonly eventAnchorAliases?: Readonly<Record<TAnchor, readonly string[]>>;
	readonly conditionalAliases?: readonly string[];
	readonly conditionConnectors?: readonly string[];
	readonly intervalPrefixes?: readonly string[];
	readonly recurrenceConnectors?: readonly string[];
	readonly rangeDelimiters?: readonly string[];
	readonly relativeOffsetConnectors?: Readonly<
		Record<"before" | "after" | "at" | "with", readonly string[]>
	>;
}

export interface FrequencyConsumerPolicy<
	TAnchor extends string = string,
	TUnit extends string = string,
> {
	readonly allowedAnchors?: readonly TAnchor[];
	readonly allowedUnits?: readonly TUnit[];
	readonly allowedCadenceTypes?: readonly CadenceType[];
	readonly allowConditional?: boolean;
}

export interface FrequencyDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
}

export interface CadenceScheduleResolution<
	TAnchor extends string = string,
	TUnit extends string = string,
> {
	readonly value?: CadenceSchedule<TAnchor, TUnit>;
	readonly diagnostics: readonly FrequencyDiagnostic[];
}

/**
 * Parses a free-text frequency, cadence, rate schedule, or shorthand into a structured CadenceSchedule.
 * Zero hardcoded language fallbacks. If aliases/connectors/templates are not configured, nothing is parsed.
 */
export function evaluateCadenceGrammar<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	input: string,
	config: Partial<FrequencyGrammarConfig<TAnchor, TUnit>> = {},
	policy: FrequencyConsumerPolicy<TAnchor, TUnit> = {},
): CadenceScheduleResolution<TAnchor, TUnit> {
	const rawText = input.trim();
	if (!rawText) {
		return {
			diagnostics: [
				{
					code: "empty_input",
					messageKey: "errors.frequencyEmpty",
				},
			],
		};
	}

	const diagnostics: FrequencyDiagnostic[] = [];
	const timeUnitAliases = (config.timeUnitAliases ?? {}) as Record<
		string,
		readonly string[]
	>;
	const multiplierAliases = config.multiplierAliases ?? {};
	const frequencyAliases = (config.frequencyAliases ?? {}) as Record<
		string,
		Partial<CadenceSchedule<TAnchor, TUnit>>
	>;
	const eventAnchorAliases = (config.eventAnchorAliases ?? {}) as Record<
		string,
		readonly string[]
	>;
	const conditionalAliases = config.conditionalAliases ?? [];
	const intervalPrefixes = config.intervalPrefixes ?? [];
	const recurrenceConnectors = config.recurrenceConnectors ?? [];
	const rangeDelimiters = config.rangeDelimiters ?? [];
	const relativeOffsetConnectors = config.relativeOffsetConnectors ?? {};
	const conditionConnectors = config.conditionConnectors ?? [];

	let workingText = rawText;
	let isConditional = false;
	let conditionReason: string | undefined;

	// 1. Check for Conditional / PRN trigger
	for (const prnAlias of conditionalAliases) {
		const prnRegex = new RegExp(
			`(?<![\\p{L}\\p{N}])${escapeRegex(prnAlias)}(?![\\p{L}\\p{N}])(?:\\s+(?<reason>.+))?`,
			"iu",
		);
		const match = workingText.match(prnRegex);
		if (match) {
			isConditional = true;
			if (match.groups?.reason) {
				let reasonText = match.groups.reason.trim();
				for (const conn of conditionConnectors) {
					const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(conn);
					const connPattern = isSymbol
						? `^${escapeRegex(conn)}\\s*`
						: `^${escapeRegex(conn)}(?![\\p{L}\\p{N}])\\s*`;
					const connRegex = new RegExp(connPattern, "iu");
					if (connRegex.test(reasonText)) {
						reasonText = reasonText.replace(connRegex, "").trim();
						break;
					}
				}
				conditionReason = reasonText;
			}
			workingText = (
				workingText.slice(0, match.index) +
				workingText.slice((match.index ?? 0) + match[0].length)
			).trim();
			break;
		}
	}

	if (isConditional && policy.allowConditional === false) {
		diagnostics.push({
			code: "conditional_not_allowed",
			messageKey: "errors.frequencyConditionalNotAllowed",
		});
	}

	// Helper to resolve a raw time unit string
	const resolveTimeUnit = (raw: string): TUnit | undefined => {
		const lower = raw.toLocaleLowerCase(config.locales as string).trim();
		for (const [canonical, aliases] of Object.entries(timeUnitAliases)) {
			if (
				canonical.toLocaleLowerCase(config.locales as string) === lower ||
				aliases.some(
					(a) => a.toLocaleLowerCase(config.locales as string) === lower,
				)
			) {
				return canonical as TUnit;
			}
		}
		return undefined;
	};

	// Helper to resolve multiplier counts (e.g. "twice" -> 2, "3x" -> 3)
	const resolveMultiplier = (raw: string): number | undefined => {
		const num = Number(raw);
		if (!Number.isNaN(num) && num > 0) return num;
		const lower = raw.toLocaleLowerCase(config.locales as string).trim();
		for (const [countStr, aliases] of Object.entries(multiplierAliases)) {
			if (
				aliases.some(
					(a) => a.toLocaleLowerCase(config.locales as string) === lower,
				)
			) {
				return Number(countStr);
			}
		}
		return undefined;
	};

	// 2. Direct Shorthand Lookup (e.g. "BID", "Q4H", "QHS", "DAILY")
	const normalizedLower = workingText
		.toLocaleLowerCase(config.locales as string)
		.replace(/[.\s]/g, "");
	for (const [aliasKey, aliasSchedule] of Object.entries(frequencyAliases)) {
		const normKey = aliasKey
			.toLocaleLowerCase(config.locales as string)
			.replace(/[.\s]/g, "");
		if (normalizedLower === normKey) {
			const candidate: CadenceSchedule<TAnchor, TUnit> = {
				cadenceType: (aliasSchedule.cadenceType ?? "interval") as any,
				...(aliasSchedule.interval ? { interval: aliasSchedule.interval } : {}),
				...(aliasSchedule.recurrence
					? { recurrence: aliasSchedule.recurrence }
					: {}),
				...(aliasSchedule.eventAnchor
					? { eventAnchor: aliasSchedule.eventAnchor }
					: {}),
				...(isConditional || aliasSchedule.isConditional
					? { isConditional: true }
					: {}),
				...(conditionReason || aliasSchedule.condition
					? { condition: conditionReason ?? aliasSchedule.condition }
					: {}),
				rawText,
			};
			return validateAndResolve(candidate, policy, diagnostics);
		}
	}

	// 3. Match explicit configured templates if provided
	if (config.templates && config.templates.length > 0) {
		const numPattern = buildNumericPatternString({
			...config.numericConfig,
			allowNegative: false,
		});

		const sortedPrefixes = [...intervalPrefixes].sort(
			(a, b) => b.length - a.length,
		);
		const prefixPattern =
			sortedPrefixes.length > 0
				? `(?:${sortedPrefixes.map(escapeRegex).join("|")})`
				: "";

		const sortedUnitPairs = flattenAndSortAliases(timeUnitAliases, true);
		const unitPattern =
			sortedUnitPairs.length > 0
				? `(?:${sortedUnitPairs.map((p) => escapeRegex(p.alias)).join("|")})`
				: "";

		const sortedRecConn = [...recurrenceConnectors].sort(
			(a, b) => b.length - a.length,
		);
		const recConnPattern =
			sortedRecConn.length > 0
				? `(?:${sortedRecConn.map(escapeRegex).join("|")})`
				: "";

		const sortedOffsetDirs = flattenAndSortAliases(
			relativeOffsetConnectors,
			false,
		);
		const offsetDirPattern =
			sortedOffsetDirs.length > 0
				? `(?:${sortedOffsetDirs.map((p) => escapeRegex(p.alias)).join("|")})`
				: "";

		const sortedAnchors = flattenAndSortAliases(eventAnchorAliases, true);
		const anchorPattern =
			sortedAnchors.length > 0
				? `(?:${sortedAnchors.map((p) => escapeRegex(p.alias)).join("|")})`
				: "";

		const tokenPatternMap: Record<string, string> = {
			INTERVAL_PREFIX: prefixPattern
				? `(?<INTERVAL_PREFIX>${prefixPattern})`
				: "",
			INTERVAL_MAG: `(?<INTERVAL_MAG>${numPattern})`,
			INTERVAL_HIGH: `(?<INTERVAL_HIGH>${numPattern})`,
			INTERVAL_UNIT: unitPattern ? `(?<INTERVAL_UNIT>${unitPattern})` : "",
			RECURRENCE_COUNT: `(?<RECURRENCE_COUNT>${numPattern})`,
			RECURRENCE_CONN: recConnPattern
				? `(?<RECURRENCE_CONN>${recConnPattern})`
				: "",
			PERIOD: unitPattern ? `(?<PERIOD>${unitPattern})` : "",
			OFFSET_MAG: `(?<OFFSET_MAG>${numPattern})`,
			OFFSET_UNIT: unitPattern ? `(?<OFFSET_UNIT>${unitPattern})` : "",
			OFFSET_DIR: offsetDirPattern ? `(?<OFFSET_DIR>${offsetDirPattern})` : "",
			ANCHOR: anchorPattern ? `(?<ANCHOR>${anchorPattern})` : "",
		};

		for (const tpl of config.templates) {
			const regex = compileFormatRegex(
				tpl,
				tokenPatternMap,
				{ exact: true },
				FREQUENCY_TOKENS,
			);
			const match = workingText.match(regex);
			if (match?.groups) {
				const g = match.groups;
				// Check for Interval
				if (g.INTERVAL_MAG && g.INTERVAL_UNIT) {
					const mag = parseNumericValue(g.INTERVAL_MAG, config.numericConfig)
						?.parsed?.value;
					const high = g.INTERVAL_HIGH
						? parseNumericValue(g.INTERVAL_HIGH, config.numericConfig)?.parsed
								?.value
						: undefined;
					const unit = resolveTimeUnit(g.INTERVAL_UNIT);
					if (mag !== undefined && unit) {
						const candidate: CadenceSchedule<TAnchor, TUnit> = {
							cadenceType: "interval" as any,
							interval: {
								multiplier: mag,
								unit,
								...(high !== undefined ? { upperMultiplier: high } : {}),
							},
							...(isConditional ? { isConditional: true } : {}),
							...(conditionReason ? { condition: conditionReason } : {}),
							rawText,
						};
						return validateAndResolve(candidate, policy, diagnostics);
					}
				}

				// Check for Recurrence
				if (g.RECURRENCE_COUNT && g.PERIOD) {
					const count = resolveMultiplier(g.RECURRENCE_COUNT);
					const period = resolveTimeUnit(g.PERIOD);
					if (count !== undefined && period) {
						const candidate: CadenceSchedule<TAnchor, TUnit> = {
							cadenceType: "recurrence" as any,
							recurrence: { count, period },
							...(isConditional ? { isConditional: true } : {}),
							...(conditionReason ? { condition: conditionReason } : {}),
							rawText,
						};
						return validateAndResolve(candidate, policy, diagnostics);
					}
				}

				// Check for Event Anchor & Relative Offset
				if (g.ANCHOR) {
					let matchedAnchorKey: TAnchor | undefined;
					const anchorLower = g.ANCHOR.toLocaleLowerCase(
						config.locales as string,
					);
					for (const [k, aliases] of Object.entries(eventAnchorAliases)) {
						if (
							k.toLocaleLowerCase(config.locales as string) === anchorLower ||
							aliases.some(
								(a) =>
									a.toLocaleLowerCase(config.locales as string) === anchorLower,
							)
						) {
							matchedAnchorKey = k as TAnchor;
							break;
						}
					}

					if (matchedAnchorKey) {
						let relativeOffset:
							| CadenceSchedule<TAnchor, TUnit>["relativeOffset"]
							| undefined;
						if (g.OFFSET_DIR) {
							const dirLower = g.OFFSET_DIR.toLocaleLowerCase(
								config.locales as string,
							);
							let dir: "before" | "after" | "at" | "with" = "at";
							for (const [d, dAliases] of Object.entries(
								relativeOffsetConnectors,
							) as ["before" | "after" | "at" | "with", readonly string[]][]) {
								if (
									dAliases.some(
										(da) =>
											da.toLocaleLowerCase(config.locales as string) ===
											dirLower,
									)
								) {
									dir = d;
									break;
								}
							}

							const offsetMag = g.OFFSET_MAG
								? parseNumericValue(g.OFFSET_MAG, config.numericConfig)?.parsed
										?.value
								: undefined;
							const offsetUnit = g.OFFSET_UNIT
								? resolveTimeUnit(g.OFFSET_UNIT)
								: undefined;

							relativeOffset = {
								direction: dir,
								...(offsetMag !== undefined && offsetUnit
									? { duration: { magnitude: offsetMag, unit: offsetUnit } }
									: {}),
							};
						}

						const candidate: CadenceSchedule<TAnchor, TUnit> = {
							cadenceType: "event_anchored" as any,
							eventAnchor: matchedAnchorKey,
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
	}

	// 4. Match Interval Schedules with explicit interval prefix (e.g. "every 4 hours", "cada 8 horas", "每4小时", "q4h")
	for (const prefix of intervalPrefixes) {
		const isSymbol = /^[^a-zA-Z0-9\s]+$/u.test(prefix);
		const prefixPattern = isSymbol
			? `^${escapeRegex(prefix)}\\s*`
			: `^${escapeRegex(prefix)}(?:\\s+|(?=[\\d\\p{Nd}]))`;

		const sortedRangeDelims = [...rangeDelimiters].sort(
			(a, b) => b.length - a.length,
		);
		const rangeDelimPattern =
			sortedRangeDelims.length > 0
				? `(?:\\s*(?:${sortedRangeDelims.map(escapeRegex).join("|")})\\s*(?<high>[\\d\\p{Nd}]+(?:[.,][\\d\\p{Nd}]+)?))?`
				: "";

		const intRegex = new RegExp(
			`${prefixPattern}(?<low>[\\d\\p{Nd}]+(?:[.,][\\d\\p{Nd}]+)?)${rangeDelimPattern}\\s*(?<unit>[\\p{L}]+)$`,
			"iu",
		);
		const match = workingText.match(intRegex);
		if (match?.groups?.low && match.groups.unit) {
			const lowRes = parseNumericValue(match.groups.low, config.numericConfig);
			const highRes = match.groups.high
				? parseNumericValue(match.groups.high, config.numericConfig)
				: undefined;
			const unit = resolveTimeUnit(match.groups.unit);
			if (lowRes.parsed && unit) {
				const candidate: CadenceSchedule<TAnchor, TUnit> = {
					cadenceType: "interval" as any,
					interval: {
						multiplier: lowRes.parsed.value,
						unit,
						...(highRes?.parsed
							? { upperMultiplier: highRes.parsed.value }
							: {}),
					},
					...(isConditional ? { isConditional: true } : {}),
					...(conditionReason ? { condition: conditionReason } : {}),
					rawText,
				};
				return validateAndResolve(candidate, policy, diagnostics);
			}
		}
	}

	// 5. Match Event Anchors with Optional Relative Offsets (e.g. "at bedtime", "30 min before meals", "就寝前", "睡前")
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
								if (magRes?.parsed && unit) {
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
								if (magRes?.parsed && unit) {
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

	// 6. Match Recurrence Schedules (e.g. "3 times a day", "twice daily", "100 req/sec", "2x/day")
	// 6a. Multiplier word/alias + connector/space + period (e.g. "twice a week", "once daily", "thrice monthly")
	for (const [countStr, mAliases] of Object.entries(multiplierAliases)) {
		const sortedMAliases = [...mAliases].sort((a, b) => b.length - a.length);
		for (const mAlias of sortedMAliases) {
			const isMSymbol = /^[^a-zA-Z0-9\s]+$/u.test(mAlias);
			const mPrefix = isMSymbol
				? `^${escapeRegex(mAlias)}\\s*`
				: `^${escapeRegex(mAlias)}(?:\\s+|$)`;

			// Direct match against single word period if period is already daily/monthly etc.
			// Or via connector (e.g. "twice a week", "once daily")
			const sortedConnectors = [...recurrenceConnectors].sort(
				(a, b) => b.length - a.length,
			);
			const connPatterns = sortedConnectors.map((c) => {
				const isCSymbol = /^[^a-zA-Z0-9\s]+$/u.test(c);
				return isCSymbol
					? `\\s*${escapeRegex(c)}\\s*`
					: `\\s+${escapeRegex(c)}\\s+`;
			});

			const combinedConnPattern =
				connPatterns.length > 0 ? `(?:${connPatterns.join("|")}|\\s+)` : "\\s+";

			const mRegex = new RegExp(
				`^${escapeRegex(mAlias)}${combinedConnPattern}(?<period>[\\p{L}]+)$`,
				"iu",
			);
			const mMatch = workingText.match(mRegex);
			if (mMatch?.groups?.period) {
				const period = resolveTimeUnit(mMatch.groups.period);
				if (period) {
					const candidate: CadenceSchedule<TAnchor, TUnit> = {
						cadenceType: "recurrence" as any,
						recurrence: { count: Number(countStr), period },
						...(isConditional ? { isConditional: true } : {}),
						...(conditionReason ? { condition: conditionReason } : {}),
						rawText,
					};
					return validateAndResolve(candidate, policy, diagnostics);
				}
			}
		}
	}

	// 6b. Count + connector + period (e.g. "3 times a day", "2x/day", "100 / sec")
	const sortedConnectors = [...recurrenceConnectors].sort(
		(a, b) => b.length - a.length,
	);
	for (const connector of sortedConnectors) {
		const isCSymbol = /^[^a-zA-Z0-9\s]+$/u.test(connector);
		const connPattern = isCSymbol
			? `\\s*${escapeRegex(connector)}\\s*`
			: `\\s+${escapeRegex(connector)}\\s+`;

		const recRegex = new RegExp(
			`^(?<count>[\\d\\p{Nd}]+|[\\p{L}]+(?:\\s*x)?)${connPattern}(?<period>[\\p{L}]+)$`,
			"iu",
		);
		const match = workingText.match(recRegex);
		if (match?.groups?.count && match.groups.period) {
			const count = resolveMultiplier(match.groups.count);
			const period = resolveTimeUnit(match.groups.period);
			if (count !== undefined && period) {
				const candidate: CadenceSchedule<TAnchor, TUnit> = {
					cadenceType: "recurrence" as any,
					recurrence: { count, period },
					...(isConditional ? { isConditional: true } : {}),
					...(conditionReason ? { condition: conditionReason } : {}),
					rawText,
				};
				return validateAndResolve(candidate, policy, diagnostics);
			}
		}
	}

	// 7. If only PRN / Conditional was found without explicit interval (e.g. "prn pain")
	if (isConditional) {
		const candidate: CadenceSchedule<TAnchor, TUnit> = {
			cadenceType: "one_time" as any,
			isConditional: true,
			...(conditionReason ? { condition: conditionReason } : {}),
			rawText,
		};
		return validateAndResolve(candidate, policy, diagnostics);
	}

	return {
		diagnostics: [
			{
				code: "unrecognized_cadence",
				messageKey: "errors.frequencyUnrecognized",
				messageParams: { rawText },
			},
		],
	};
}

function validateAndResolve<TAnchor extends string, TUnit extends string>(
	schedule: CadenceSchedule<TAnchor, TUnit>,
	policy: FrequencyConsumerPolicy<TAnchor, TUnit>,
	diagnostics: FrequencyDiagnostic[],
): CadenceScheduleResolution<TAnchor, TUnit> {
	if (
		policy.allowedCadenceTypes &&
		!policy.allowedCadenceTypes.includes(schedule.cadenceType as CadenceType)
	) {
		diagnostics.push({
			code: "cadence_type_not_allowed",
			messageKey: "errors.frequencyCadenceTypeNotAllowed",
			messageParams: { cadenceType: schedule.cadenceType },
		});
	}

	if (schedule.eventAnchor && policy.allowedAnchors) {
		if (!policy.allowedAnchors.includes(schedule.eventAnchor)) {
			diagnostics.push({
				code: "invalid_event_anchor",
				messageKey: "errors.frequencyEventAnchorNotAllowed",
				messageParams: { eventAnchor: schedule.eventAnchor },
			});
		}
	}

	if (schedule.interval?.unit && policy.allowedUnits) {
		if (!policy.allowedUnits.includes(schedule.interval.unit)) {
			diagnostics.push({
				code: "invalid_time_unit",
				messageKey: "errors.frequencyTimeUnitNotAllowed",
				messageParams: { unit: schedule.interval.unit },
			});
		}
	}

	if (schedule.recurrence?.period && policy.allowedUnits) {
		if (!policy.allowedUnits.includes(schedule.recurrence.period)) {
			diagnostics.push({
				code: "invalid_time_unit",
				messageKey: "errors.frequencyTimeUnitNotAllowed",
				messageParams: { unit: schedule.recurrence.period },
			});
		}
	}

	return {
		value: diagnostics.length === 0 ? schedule : undefined,
		diagnostics,
	};
}

/**
 * Formats a structured CadenceSchedule back into a standardized human-readable string.
 */
export function formatCadenceSchedule<
	TAnchor extends string = string,
	TUnit extends string = string,
>(schedule: CadenceSchedule<TAnchor, TUnit>): string {
	const parts: string[] = [];

	switch (schedule.cadenceType) {
		case "interval": {
			if (schedule.interval) {
				const range =
					schedule.interval.upperMultiplier !== undefined
						? `${schedule.interval.multiplier}-${schedule.interval.upperMultiplier}`
						: `${schedule.interval.multiplier}`;
				const unit =
					schedule.interval.multiplier === 1 &&
					schedule.interval.upperMultiplier === undefined
						? schedule.interval.unit
						: `${schedule.interval.unit}s`;
				parts.push(`every ${range} ${unit}`);
			}
			break;
		}
		case "recurrence": {
			if (schedule.recurrence) {
				const countStr =
					schedule.recurrence.count === 1
						? "once"
						: schedule.recurrence.count === 2
							? "twice"
							: `${schedule.recurrence.count} times`;
				parts.push(`${countStr} a ${schedule.recurrence.period}`);
			}
			break;
		}
		case "event_anchored": {
			if (schedule.relativeOffset?.duration) {
				const dur = schedule.relativeOffset.duration;
				parts.push(
					`${dur.magnitude} ${dur.unit}${dur.magnitude > 1 ? "s" : ""} ${schedule.relativeOffset.direction} ${schedule.eventAnchor?.replace(/_/g, " ")}`,
				);
			} else if (schedule.eventAnchor) {
				parts.push(`at ${schedule.eventAnchor.replace(/_/g, " ")}`);
			}
			break;
		}
		case "continuous": {
			parts.push("continuously");
			break;
		}
		case "one_time": {
			if (!schedule.isConditional) {
				parts.push("once");
			}
			break;
		}
	}

	if (schedule.isConditional) {
		parts.push("as needed");
		if (schedule.condition) {
			parts.push(`for ${schedule.condition}`);
		}
	}

	return parts.join(" ").trim();
}
