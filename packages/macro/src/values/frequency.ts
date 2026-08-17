import { escapeRegex } from "./regex";

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
> {
	readonly frequencyAliases?: Readonly<
		Record<string, Partial<CadenceSchedule<TAnchor, TUnit>>>
	>;
	readonly multiplierAliases?: Readonly<Record<string, readonly string[]>>;
	readonly timeUnitAliases?: Readonly<Record<TUnit, readonly string[]>>;
	readonly eventAnchorAliases?: Readonly<Record<TAnchor, readonly string[]>>;
	readonly conditionalAliases?: readonly string[];
	readonly intervalPrefixes?: readonly string[];
	readonly recurrenceConnectors?: readonly string[];
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
	readonly message: string;
}

export interface CadenceScheduleResolution<
	TAnchor extends string = string,
	TUnit extends string = string,
> {
	readonly value?: CadenceSchedule<TAnchor, TUnit>;
	readonly diagnostics: readonly FrequencyDiagnostic[];
}

export function createStandardTimeUnits(): Record<string, readonly string[]> {
	return {
		second: [
			"s",
			"sec",
			"secs",
			"second",
			"seconds",
			"segundo",
			"segundos",
			"sekunde",
			"sekunden",
			"秒",
		],
		minute: [
			"min",
			"mins",
			"minute",
			"minutes",
			"minuto",
			"minutos",
			"分",
			"minuten",
		],
		hour: [
			"h",
			"hr",
			"hrs",
			"hour",
			"hours",
			"hora",
			"horas",
			"stunde",
			"stunden",
			"std",
			"時",
			"小时",
			"時間",
		],
		day: [
			"d",
			"day",
			"days",
			"daily",
			"dia",
			"dias",
			"diario",
			"tag",
			"tage",
			"täglich",
			"日",
			"天",
		],
		week: [
			"w",
			"wk",
			"wks",
			"week",
			"weeks",
			"weekly",
			"semana",
			"semanas",
			"semanal",
			"woche",
			"wochen",
			"wöchentlich",
			"週",
			"周",
		],
		month: [
			"mo",
			"mos",
			"month",
			"months",
			"monthly",
			"mes",
			"meses",
			"mensual",
			"monat",
			"monate",
			"monatlich",
			"月",
		],
		quarter: [
			"q",
			"quarter",
			"quarters",
			"quarterly",
			"trimestre",
			"quartal",
			"quartale",
			"vierteljährlich",
			"季度",
		],
		year: [
			"y",
			"yr",
			"yrs",
			"year",
			"years",
			"yearly",
			"annual",
			"annually",
			"año",
			"años",
			"anual",
			"jahr",
			"jahre",
			"jährlich",
			"年",
		],
	};
}

export function createStandardMultiplierAliases(): Record<
	string,
	readonly string[]
> {
	return {
		"1": ["once", "1x", "single", "una vez", "einmal", "1回", "1次"],
		"2": ["twice", "2x", "double", "dos veces", "zweimal", "2回", "2次"],
		"3": [
			"thrice",
			"3x",
			"triple",
			"three times",
			"tres veces",
			"dreimal",
			"3回",
			"3次",
		],
		"4": ["4x", "four times", "cuatro veces", "viermal", "4回", "4次"],
		"5": ["5x", "five times", "cinco veces", "fünfmal", "5回", "5次"],
	};
}

export function createStandardFrequencyAliases(): Record<
	string,
	Partial<CadenceSchedule<string, string>>
> {
	return {
		daily: {
			cadenceType: "recurrence",
			recurrence: { count: 1, period: "day" },
		},
		qd: { cadenceType: "recurrence", recurrence: { count: 1, period: "day" } },
		"q.d.": {
			cadenceType: "recurrence",
			recurrence: { count: 1, period: "day" },
		},
		bid: { cadenceType: "recurrence", recurrence: { count: 2, period: "day" } },
		"b.i.d.": {
			cadenceType: "recurrence",
			recurrence: { count: 2, period: "day" },
		},
		tid: { cadenceType: "recurrence", recurrence: { count: 3, period: "day" } },
		"t.i.d.": {
			cadenceType: "recurrence",
			recurrence: { count: 3, period: "day" },
		},
		qid: { cadenceType: "recurrence", recurrence: { count: 4, period: "day" } },
		"q.i.d.": {
			cadenceType: "recurrence",
			recurrence: { count: 4, period: "day" },
		},
		weekly: {
			cadenceType: "recurrence",
			recurrence: { count: 1, period: "week" },
		},
		qw: { cadenceType: "recurrence", recurrence: { count: 1, period: "week" } },
		monthly: {
			cadenceType: "recurrence",
			recurrence: { count: 1, period: "month" },
		},
		qm: {
			cadenceType: "recurrence",
			recurrence: { count: 1, period: "month" },
		},
		q2h: { cadenceType: "interval", interval: { multiplier: 2, unit: "hour" } },
		q4h: { cadenceType: "interval", interval: { multiplier: 4, unit: "hour" } },
		q6h: { cadenceType: "interval", interval: { multiplier: 6, unit: "hour" } },
		q8h: { cadenceType: "interval", interval: { multiplier: 8, unit: "hour" } },
		q12h: {
			cadenceType: "interval",
			interval: { multiplier: 12, unit: "hour" },
		},
		qhs: { cadenceType: "event_anchored", eventAnchor: "before_sleep" },
		"q.h.s.": { cadenceType: "event_anchored", eventAnchor: "before_sleep" },
		qam: { cadenceType: "event_anchored", eventAnchor: "waking" },
		"q.a.m.": { cadenceType: "event_anchored", eventAnchor: "waking" },
		continuous: { cadenceType: "continuous" },
		stat: { cadenceType: "one_time" },
		prn: { cadenceType: "one_time", isConditional: true },
		"p.r.n.": { cadenceType: "one_time", isConditional: true },
	};
}

export function createStandardEventAnchors(): Record<
	string,
	readonly string[]
> {
	return {
		before_sleep: [
			"at bedtime",
			"before bedtime",
			"before sleep",
			"bedtime",
			"antes de dormir",
			"vor dem schlafen",
			"就寝前",
			"睡前",
		],
		waking: [
			"in the morning",
			"upon waking",
			"on waking",
			"al despertar",
			"beim aufwachen",
			"起床時",
			"晨起",
		],
		before_meal: [
			"before meals",
			"before meal",
			"before food",
			"preprandial",
			"ac",
			"a.c.",
			"antes de las comidas",
			"vor den mahlzeiten",
			"食前",
		],
		with_meal: [
			"with meals",
			"with meal",
			"with food",
			"during meals",
			"con las comidas",
			"zu den mahlzeiten",
			"食中",
			"随餐",
		],
		after_meal: [
			"after meals",
			"after meal",
			"after food",
			"postprandial",
			"pc",
			"p.c.",
			"después de las comidas",
			"nach den mahlzeiten",
			"食後",
		],
		market_open: [
			"market open",
			"at market open",
			"market opening",
			"apertura del mercado",
			"开盘",
		],
		market_close: [
			"market close",
			"at market close",
			"market closing",
			"cierre del mercado",
			"收盘",
		],
		midnight: [
			"at midnight",
			"midnight",
			"a medianoche",
			"mitternacht",
			"午夜",
		],
		startup: ["on startup", "at startup", "startup", "al inicio", "启动时"],
		shutdown: [
			"on shutdown",
			"at shutdown",
			"shutdown",
			"al apagado",
			"关机时",
		],
	};
}

/**
 * Parses a free-text frequency, cadence, rate schedule, or shorthand into a structured CadenceSchedule.
 */
export function parseCadenceSchedule<
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
				{ code: "empty_input", message: "Frequency text is empty" },
			],
		};
	}

	const diagnostics: FrequencyDiagnostic[] = [];
	const timeUnitAliases = (config.timeUnitAliases ??
		createStandardTimeUnits()) as Record<string, readonly string[]>;
	const multiplierAliases =
		config.multiplierAliases ?? createStandardMultiplierAliases();
	const frequencyAliases = (config.frequencyAliases ??
		createStandardFrequencyAliases()) as Record<
		string,
		Partial<CadenceSchedule<TAnchor, TUnit>>
	>;
	const eventAnchorAliases = (config.eventAnchorAliases ??
		createStandardEventAnchors()) as Record<string, readonly string[]>;
	const conditionalAliases = config.conditionalAliases ?? [
		"prn",
		"p.r.n.",
		"as needed",
		"as-needed",
		"on demand",
		"on-demand",
		"según sea necesario",
		"nach bedarf",
		"必要時",
		"按需",
	];
	const intervalPrefixes = config.intervalPrefixes ?? [
		"every",
		"cada",
		"alle",
		"jede",
		"jeder",
		"jedes",
		"每",
		"q",
	];
	const recurrenceConnectors = config.recurrenceConnectors ?? [
		"times a",
		"times per",
		"time a",
		"time per",
		"x a",
		"x per",
		"x/",
		"veces al",
		"veces por",
		"mal pro",
		"mal pro",
		"回/",
		"次/",
		"per",
		"a",
		"por",
		"pro",
		"/",
	];
	const relativeOffsetConnectors = config.relativeOffsetConnectors ?? {
		before: ["before", "prior to", "antes de", "vor", "前"],
		after: ["after", "post", "después de", "nach", "後", "后"],
		at: ["at", "on", "in the", "a", "um", "bei", "在", "于"],
		with: ["with", "during", "con", "mit", "zu", "随"],
	};

	let workingText = rawText;
	let isConditional = false;
	let conditionReason: string | undefined;

	// 1. Check for Conditional / PRN trigger
	for (const prnAlias of conditionalAliases) {
		const prnRegex = new RegExp(
			`(?<![\\p{L}\\p{N}])${escapeRegex(prnAlias)}(?![\\p{L}\\p{N}])(?:\\s+(?:for|due to|on|with)?\\s*(?<reason>[^,;]+))?`,
			"iu",
		);
		const match = workingText.match(prnRegex);
		if (match) {
			isConditional = true;
			if (match.groups?.reason) {
				conditionReason = match.groups.reason.trim();
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
			message: "Conditional / PRN schedules are not permitted by policy",
		});
	}

	// Helper to resolve a raw time unit string
	const resolveTimeUnit = (raw: string): TUnit | undefined => {
		const lower = raw.toLocaleLowerCase().trim();
		for (const [canonical, aliases] of Object.entries(timeUnitAliases)) {
			if (
				canonical.toLocaleLowerCase() === lower ||
				aliases.some((a) => a.toLocaleLowerCase() === lower)
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
		const lower = raw.toLocaleLowerCase().trim();
		for (const [countStr, aliases] of Object.entries(multiplierAliases)) {
			if (aliases.some((a) => a.toLocaleLowerCase() === lower)) {
				return Number(countStr);
			}
		}
		return undefined;
	};

	// 2. Direct Shorthand Lookup (e.g. "BID", "Q4H", "QHS", "DAILY")
	const normalizedLower = workingText.toLocaleLowerCase().replace(/[.\s]/g, "");
	for (const [aliasKey, aliasSchedule] of Object.entries(frequencyAliases)) {
		const normKey = aliasKey.toLocaleLowerCase().replace(/[.\s]/g, "");
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

	// 3. Match Interval Schedules with explicit interval prefix (e.g. "every 4 hours", "every 4-6 hours", "cada 8 horas", "alle 2 wochen", "每4時間")
	for (const prefix of intervalPrefixes) {
		const isCjkPrefix = prefix === "每";
		const intRegex = new RegExp(
			`^${escapeRegex(prefix)}${isCjkPrefix ? "\\s*" : "\\s+"}(?<low>\\d+)(?:\\s*(?:-|–|to|a|bis|至)\\s*(?<high>\\d+))?\\s*(?<unit>[\\p{L}]+)$`,
			"iu",
		);
		const match = workingText.match(intRegex);
		if (match?.groups?.low && match.groups.unit) {
			const low = Number(match.groups.low);
			const high = match.groups.high ? Number(match.groups.high) : undefined;
			const unit = resolveTimeUnit(match.groups.unit);
			if (!Number.isNaN(low) && unit) {
				const candidate: CadenceSchedule<TAnchor, TUnit> = {
					cadenceType: "interval" as any,
					interval: {
						multiplier: low,
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
	}

	// 4. Match Event Anchors with Optional Relative Offsets (e.g. "at bedtime", "30 min before meals", "15 min before market close")
	for (const [anchorKey, aliases] of Object.entries(eventAnchorAliases)) {
		for (const alias of aliases) {
			const anchorRegex = new RegExp(
				`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}])`,
				"iu",
			);
			const match = workingText.match(anchorRegex);
			if (match) {
				const prefix = workingText.slice(0, match.index).trim();
				let relativeOffset:
					| CadenceSchedule<TAnchor, TUnit>["relativeOffset"]
					| undefined;

				if (prefix) {
					// 1. Check if prefix ends with a direction connector (e.g. "30 min before")
					for (const [dir, dirAliases] of Object.entries(
						relativeOffsetConnectors,
					)) {
						for (const dirAlias of dirAliases) {
							const offsetRegex = new RegExp(
								`^(?:(?<mag>\\d+)\\s*(?<unit>[\\p{L}]+)\\s+)?${escapeRegex(dirAlias)}$`,
								"iu",
							);
							const offsetMatch = prefix.match(offsetRegex);
							if (offsetMatch) {
								const mag = offsetMatch.groups?.mag
									? Number(offsetMatch.groups.mag)
									: undefined;
								const unit = offsetMatch.groups?.unit
									? resolveTimeUnit(offsetMatch.groups.unit)
									: undefined;
								relativeOffset = {
									direction: dir as "before" | "after" | "at" | "with",
									...(mag !== undefined && unit
										? { duration: { magnitude: mag, unit } }
										: {}),
								};
								break;
							}
						}
						if (relativeOffset) break;
					}

					// 2. If prefix is a pure duration (e.g. "30 min") and alias/anchor starts with a direction (e.g. "before meals")
					if (!relativeOffset) {
						const pureDurationRegex = /^(?<mag>\d+)\s*(?<unit>[\p{L}]+)$/iu;
						const durMatch = prefix.match(pureDurationRegex);
						if (durMatch?.groups?.mag && durMatch.groups.unit) {
							const mag = Number(durMatch.groups.mag);
							const unit = resolveTimeUnit(durMatch.groups.unit);
							if (!Number.isNaN(mag) && unit) {
								let detectedDir: "before" | "after" | "at" | "with" = "at";
								for (const [dir, dirAliases] of Object.entries(
									relativeOffsetConnectors,
								)) {
									if (
										dirAliases.some((da) =>
											alias
												.toLocaleLowerCase()
												.startsWith(da.toLocaleLowerCase()),
										) ||
										anchorKey.startsWith(dir)
									) {
										detectedDir = dir as any;
										break;
									}
								}
								relativeOffset = {
									direction: detectedDir,
									duration: { magnitude: mag, unit },
								};
							}
						}
					}
				}

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

	// 5. Match Recurrence Schedules (e.g. "3 times a day", "twice a week", "once daily", "100 req/sec")
	// Try multiplier + period (e.g. "once daily", "twice weekly")
	for (const [countStr, mAliases] of Object.entries(multiplierAliases)) {
		for (const mAlias of mAliases) {
			const mRegex = new RegExp(
				`^${escapeRegex(mAlias)}\\s+(?:a\\s+|per\\s+|por\\s+|pro\\s+)?(?<period>[\\p{L}]+)$`,
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

	// Try count + connector + period (e.g. "3 times a day", "2x/day", "100 / sec")
	for (const connector of recurrenceConnectors) {
		const recRegex = new RegExp(
			`^(?<count>\\d+|[\\p{L}]+(?:\\s*x)?)\\s*${escapeRegex(connector)}\\s*(?<period>[\\p{L}]+)$`,
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

	// 6. If only PRN / Conditional was found without explicit interval (e.g. "prn pain")
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
				message: `Unable to parse frequency or cadence schedule from '${rawText}'`,
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
			message: `Cadence type '${schedule.cadenceType}' is not permitted by policy`,
		});
	}

	if (schedule.eventAnchor && policy.allowedAnchors) {
		if (!policy.allowedAnchors.includes(schedule.eventAnchor)) {
			diagnostics.push({
				code: "invalid_event_anchor",
				message: `Event anchor '${schedule.eventAnchor}' is not allowed in this domain context`,
			});
		}
	}

	if (schedule.interval?.unit && policy.allowedUnits) {
		if (!policy.allowedUnits.includes(schedule.interval.unit)) {
			diagnostics.push({
				code: "invalid_time_unit",
				message: `Time unit '${schedule.interval.unit}' is not allowed in this domain context`,
			});
		}
	}

	if (schedule.recurrence?.period && policy.allowedUnits) {
		if (!policy.allowedUnits.includes(schedule.recurrence.period)) {
			diagnostics.push({
				code: "invalid_time_unit",
				message: `Time period '${schedule.recurrence.period}' is not allowed in this domain context`,
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
