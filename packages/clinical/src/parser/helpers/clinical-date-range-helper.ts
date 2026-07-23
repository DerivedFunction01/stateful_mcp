import type {
	ClinicalDateRange,
	DayOfWeek,
	TemporalBoundary,
	TimeInterval,
	TimePrecisionLevel,
} from "../../schemas/time";
import { DEFAULT_ATTRIBUTE_RULES } from "../../store/defaults";
import type {
	AttributeParserRule,
	ParserDictionaryRule,
} from "../../store/interfaces";
import { getCompiledRegex } from "../_compiled-regex";
import {
	buildMonthNameMap,
	compileDateRegex,
} from "../utils/date-regex-generator";
import {
	NamedGroupContractError,
	validateNamedGroups,
} from "../utils/named-group-validator";
import { FrequencyHelper } from "./frequency-helper";
import { TimeHelper } from "./measurement-helper";

export interface ClinicalDateRangeToken {
	anchorText: string;
	relativeEstimate?: ClinicalDateRange["relativeEstimate"];
	repeat?: TimeInterval["repeat"];
	// Boundaries
	startText?: string;
	startPrecision?: TimePrecisionLevel;
	endText?: string;
	endPrecision?: TimePrecisionLevel;
	// Calendar dates
	startCalendarDate?: Date;
	endCalendarDate?: Date;
	calendarPrecision?: TimePrecisionLevel;
	// Exclusions
	baseText?: string;
	baseRepeat?: TimeInterval["repeat"];
	baseStartCalendarDate?: Date;
	baseEndCalendarDate?: Date;
	exclusionText?: string;
	exclusionRepeat?: TimeInterval["repeat"];
	exclusionStartCalendarDate?: Date;
	exclusionEndCalendarDate?: Date;
	listCalendarDates?: Date[];
	exclusionListCalendarDates?: Date[];
}

interface RepeatMatchResult {
	repeat: TimeInterval["repeat"];
	matchedText: string;
}

interface RelativeEstimateMatchResult {
	estimate: ClinicalDateRange["relativeEstimate"];
	matchedText: string;
}

export class ClinicalDateRangeTokenizer {
	static tokenize(
		text: string,
		attributeRules: AttributeParserRule[] = [],
		evaluatorRules: ParserDictionaryRule[] = [],
	): ClinicalDateRangeToken | null {
		const cleaned = text.trim();
		if (!cleaned) return null;

		const token: ClinicalDateRangeToken = { anchorText: cleaned };
		let workingText = cleaned;

		const rangeMatch = ClinicalDateRangeTokenizer.parseNamedDateRange(
			workingText,
			attributeRules,
		);
		if (rangeMatch) {
			token.startCalendarDate = rangeMatch.startDate;
			token.endCalendarDate = rangeMatch.endDate;
			token.calendarPrecision = rangeMatch.precision;
			token.startText = rangeMatch.startText;
			token.endText = rangeMatch.endText;
			workingText = rangeMatch.remainingText;
		}

		const listMatch = ClinicalDateRangeTokenizer.parseNamedDateList(
			workingText,
			attributeRules,
		);
		if (listMatch) {
			token.listCalendarDates = listMatch.dates;
			token.calendarPrecision = listMatch.precision;
			workingText = listMatch.remainingText;
		}

		// 1. Parse Exclusions first
		const exclusion = ClinicalDateRangeTokenizer.parseExclusion(
			workingText,
			attributeRules,
		);
		if (exclusion) {
			token.baseText = exclusion.baseText;
			token.exclusionText = exclusion.exclusionText;
			const baseCalendar = ClinicalDateRangeTokenizer.parseCalendarBoundary(
				exclusion.baseText,
				attributeRules,
			);
			if (baseCalendar) {
				token.baseStartCalendarDate = baseCalendar.startDate;
				token.baseEndCalendarDate = baseCalendar.endDate;
				token.calendarPrecision = baseCalendar.precision;
			}
			const exclusionCalendar =
				ClinicalDateRangeTokenizer.parseCalendarBoundary(
					exclusion.exclusionText,
					attributeRules,
				);
			if (exclusionCalendar) {
				token.exclusionStartCalendarDate = exclusionCalendar.startDate;
				token.exclusionEndCalendarDate = exclusionCalendar.endDate;
				token.calendarPrecision = exclusionCalendar.precision;
			}
			const exclusionRange = ClinicalDateRangeTokenizer.parseNamedDateRange(
				exclusion.exclusionText,
				attributeRules,
			);
			if (exclusionRange) {
				token.exclusionStartCalendarDate = exclusionRange.startDate;
				token.exclusionEndCalendarDate = exclusionRange.endDate;
				token.calendarPrecision = exclusionRange.precision;
			}
			const exclusionList = ClinicalDateRangeTokenizer.parseNamedDateList(
				exclusion.exclusionText,
				attributeRules,
			);
			if (exclusionList) {
				token.exclusionListCalendarDates = exclusionList.dates;
				token.calendarPrecision = exclusionList.precision;
			}
			token.baseRepeat =
				ClinicalDateRangeTokenizer.parseRepeat(
					exclusion.baseText,
					attributeRules,
					evaluatorRules,
				) ?? undefined;
			token.exclusionRepeat =
				ClinicalDateRangeTokenizer.parseRepeat(
					exclusion.exclusionText,
					attributeRules,
					evaluatorRules,
				) ?? undefined;
			workingText = exclusion.baseText;
		}

		// 2. Parse and strip Cadence
		const repeatMatch = ClinicalDateRangeTokenizer.findRepeatMatch(
			workingText,
			attributeRules,
			evaluatorRules,
		);
		if (repeatMatch) {
			token.repeat = repeatMatch.repeat;
			workingText = workingText.replace(repeatMatch.matchedText, "").trim();
		}

		// 3. Parse Calendar Dates
		const calendar = ClinicalDateRangeTokenizer.parseCalendarBoundary(
			workingText,
			attributeRules,
		);
		if (calendar) {
			token.startCalendarDate = calendar.startDate;
			token.endCalendarDate = calendar.endDate;
			token.calendarPrecision = calendar.precision;
			if (calendar.startText) token.startText = calendar.startText;
			if (calendar.endText) token.endText = calendar.endText;
			workingText = workingText.replace(calendar.startText || "", "").trim();
			if (calendar.endText) {
				workingText = workingText.replace(calendar.endText, "").trim();
			}
		}

		// 4. Parse and strip Relative Estimate
		const relativeMatch = ClinicalDateRangeTokenizer.findRelativeEstimateMatch(
			workingText,
			attributeRules,
		);
		if (relativeMatch) {
			token.relativeEstimate = relativeMatch.estimate;
			workingText = workingText.replace(relativeMatch.matchedText, "").trim();
		}

		// 5. Parse Boundaries
		const boundaries = ClinicalDateRangeTokenizer.parseBoundaries(
			workingText,
			attributeRules,
		);
		if (boundaries) {
			token.startText = boundaries.startText;
			token.endText = boundaries.endText;
			token.startPrecision = ClinicalDateRangeTokenizer.resolvePrecision(
				boundaries.startText,
				attributeRules,
			);
			token.endPrecision = ClinicalDateRangeTokenizer.resolvePrecision(
				boundaries.endText,
				attributeRules,
			);
		}

		const hasContent =
			token.relativeEstimate ||
			token.repeat ||
			token.startPrecision ||
			token.endPrecision ||
			token.startCalendarDate ||
			token.endCalendarDate ||
			token.baseRepeat ||
			token.exclusionRepeat ||
			token.baseStartCalendarDate ||
			token.baseEndCalendarDate ||
			token.exclusionStartCalendarDate ||
			token.exclusionEndCalendarDate ||
			(token.listCalendarDates && token.listCalendarDates.length > 0) ||
			(token.exclusionListCalendarDates &&
				token.exclusionListCalendarDates.length > 0);

		return hasContent ? token : null;
	}

	private static parseCalendarBoundary(
		text: string,
		attributeRules: AttributeParserRule[] = [],
	): {
		startText?: string;
		endText?: string;
		startDate?: Date;
		endDate?: Date;
		precision?: TimePrecisionLevel;
	} | null {
		const calendarRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"calendar_date",
			attributeRules,
		);
		if (calendarRules.length === 0) return null;

		for (const rule of calendarRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = compileDateRegex(pattern);
				const match = regex.exec(text);
				if (!match || !match.groups) continue;

				const date = ClinicalDateRangeTokenizer.resolveCalendarDate(
					match.groups,
					rule,
				);
				if (!date) continue;

				const precision = ClinicalDateRangeTokenizer.inferCalendarPrecision(
					rule.calendarTokens || [],
				);
				const matchedText = match[0];

				if (rule.calendarTokens?.includes("MM_name") && text.includes(",")) {
					const parts = text.split(",");
					if (parts.length >= 2) {
						const startText = parts[0] + ",";
						const endText = parts[1]!;
						const startMatch = regex.exec(startText);
						const startDate = startMatch
							? ClinicalDateRangeTokenizer.resolveCalendarDate(
									startMatch.groups || {},
									rule,
								)
							: date;
						const endMatch = regex.exec(endText);
						const endDate = endMatch
							? ClinicalDateRangeTokenizer.resolveCalendarDate(
									endMatch.groups || {},
									rule,
								)
							: undefined;
						if (startDate || endDate) {
							return {
								startText: startMatch ? startMatch[0] : matchedText,
								endText: endMatch ? endMatch[0] : undefined,
								startDate: startDate || date,
								endDate,
								precision,
							};
						}
					}
				}

				return {
					startText: matchedText,
					startDate: date,
					precision,
				};
			}
		}

		return null;
	}

	private static resolveCalendarDate(
		groups: Record<string, string | undefined>,
		rule: AttributeParserRule,
	): Date | undefined {
		try {
			validateNamedGroups(groups, rule.namedGroupContract);
		} catch (e) {
			if (e instanceof NamedGroupContractError) {
				return undefined;
			}
			throw e;
		}

		let year = groups.yyyy ? Number(groups.yyyy) : undefined;
		const yy = groups.yy ? Number(groups.yy) : undefined;
		let month = groups.mm ? Number(groups.mm) : undefined;
		const day = groups.dd ? Number(groups.dd) : undefined;
		const hh = groups.hh ? Number(groups.hh) : undefined;
		const min = groups.min ? Number(groups.min) : undefined;
		const ss = groups.ss ? Number(groups.ss) : undefined;
		const ampm = groups.ampm;

		if (year === undefined && yy !== undefined) {
			year = yy < 70 ? 2000 + yy : 1900 + yy;
		}

		if (groups.mm_name) {
			const monthNames = rule.monthNames || [];
			const monthMap = buildMonthNameMap(monthNames);
			const mapped = monthMap[groups.mm_name.toLowerCase()];
			if (mapped === undefined) return undefined;
			month = mapped;
		}

		if (year === undefined || month === undefined || day === undefined) {
			return undefined;
		}

		if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

		const date = new Date(Date.UTC(year, month - 1, day));
		if (
			date.getUTCFullYear() !== year ||
			date.getUTCMonth() !== month - 1 ||
			date.getUTCDate() !== day
		) {
			return undefined;
		}

		if (hh !== undefined) {
			let hours = hh;
			if (ampm) {
				const lower = ampm.toLowerCase();
				if (lower === "pm" && hours < 12) hours += 12;
				if (lower === "am" && hours === 12) hours = 0;
			}
			date.setUTCHours(hours, min ?? 0, ss ?? 0, 0);
		}

		return date;
	}

	private static inferCalendarPrecision(
		tokens: AttributeParserRule["calendarTokens"] = [],
	): TimePrecisionLevel {
		if (tokens.includes("SS")) return "second";
		if (tokens.includes("min")) return "minute";
		if (tokens.includes("HH") || tokens.includes("ampm")) return "hour";
		if (tokens.includes("DD")) return "day";
		if (tokens.includes("MM") || tokens.includes("MM_name")) return "month";
		if (tokens.includes("YYYY") || tokens.includes("YY")) return "year";
		return "day";
	}

	private static findRepeatMatch(
		text: string,
		attributeRules: AttributeParserRule[],
		evaluatorRules: ParserDictionaryRule[],
	): RepeatMatchResult | null {
		for (const rule of evaluatorRules) {
			if (rule.targetField === "frequency_details") {
				for (const pattern of rule.regexPatterns) {
					const regex = getCompiledRegex(pattern, "i");
					const match = regex.exec(text);
					if (match && match.groups) {
						const rawMult = match.groups.multiplier;
						const rawUnit = match.groups.unit;
						if (rawUnit) {
							let resolvedUnit: TimePrecisionLevel | undefined;
							for (const attrRule of attributeRules) {
								if (attrRule.targetField === "time_unit") {
									for (const pat of attrRule.regexPatterns) {
										const hasNamedGroups = /\(\?<[^>]+>/.test(pat);
										const testStr = hasNamedGroups ? `0 ${rawUnit}` : rawUnit;
										if (getCompiledRegex(pat, "i").test(testStr)) {
											resolvedUnit = attrRule.targetValue as TimePrecisionLevel;
											break;
										}
									}
								}
								if (resolvedUnit) break;
							}
							if (resolvedUnit) {
								const times = rawMult ? parseFloat(rawMult) : 1;
								if (
									FrequencyHelper.isHighFrequencyDayConversion(
										rule.ruleId,
										resolvedUnit,
										times,
									)
								) {
									return {
										repeat: {
											multiplier: Math.round(24 / times),
											level: "hour",
										},
										matchedText: match[0],
									};
								} else if (rule.ruleId === "freq_times") {
									return {
										repeat: { multiplier: times, level: resolvedUnit },
										matchedText: match[0],
									};
								} else {
									return {
										repeat: { multiplier: times, level: resolvedUnit },
										matchedText: match[0],
									};
								}
							}
						}
					}
				}
			}
		}

		const dailyRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"time_repeat_daily",
			attributeRules,
		);
		for (const rule of dailyRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(text);
				if (match) {
					return {
						repeat: { multiplier: 1, level: "day" },
						matchedText: match[0],
					};
				}
			}
		}

		const shorthandRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"frequency_shorthand",
			attributeRules,
		);
		for (const rule of shorthandRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(text);
				if (match) {
					let multiplier = 1;
					let level: TimePrecisionLevel = "day";
					const resolved = FrequencyHelper.resolveShorthandInterval(
						rule.targetValue,
					);
					if (resolved) {
						multiplier = resolved.multiplier;
						level = resolved.level;
					}
					return {
						repeat: { multiplier, level },
						matchedText: match[0],
					};
				}
			}
		}

		return null;
	}

	private static findRelativeEstimateMatch(
		text: string,
		attributeRules: AttributeParserRule[],
	): RelativeEstimateMatchResult | null {
		const magnitudeMatch = text.match(/(?<magnitude>\d+(?:\.\d+)?)/);
		if (!magnitudeMatch?.groups?.magnitude) return null;
		const magnitude = Number.parseFloat(magnitudeMatch.groups.magnitude);

		// Strip relative markers so they don't trigger lookahead checks
		let textWithoutMarkers = text;
		const markerRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"time_relative_marker",
			attributeRules,
		);
		for (const rule of markerRules) {
			for (const pattern of rule.regexPatterns) {
				textWithoutMarkers = textWithoutMarkers
					.replace(getCompiledRegex(pattern, "gi"), "")
					.trim();
			}
		}

		const unitRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"time_unit",
			attributeRules,
		);
		const resolvedUnit = ClinicalDateRangeTokenizer.resolveUnitFromRules(
			textWithoutMarkers,
			unitRules,
		);
		if (!resolvedUnit) return null;

		let direction: "retrospective" | "prospective" | undefined;
		let matchedMarkerText = "";
		for (const rule of markerRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(text);
				if (match) {
					direction = rule.targetValue as "retrospective" | "prospective";
					matchedMarkerText = match[0];
					break;
				}
			}
			if (direction) break;
		}

		if (direction) {
			const unitRule = unitRules.find((r) => r.targetValue === resolvedUnit);
			if (unitRule) {
				for (const pattern of unitRule.regexPatterns) {
					let cleanPattern = pattern.replace(/\(\?!.*?\)/g, "");
					const unitGroupMatch = cleanPattern.match(/\(\?<unit>([^)]+)\)/);
					if (unitGroupMatch) {
						cleanPattern = `\\b${unitGroupMatch[1]}\\b`;
					}
					const prospectivePattern = `(?:${matchedMarkerText})\\s*\\d+(?:\\.\\d+)?\\s*(?:${cleanPattern})`;
					const retrospectivePattern = `\\d+(?:\\.\\d+)?\\s*(?:${cleanPattern})\\s*(?:${matchedMarkerText})`;
					const match = getCompiledRegex(
						`${prospectivePattern}|${retrospectivePattern}`,
						"i",
					).exec(text);
					if (match) {
						return {
							estimate: {
								direction,
								firstValue: magnitude,
								precisionUnit: resolvedUnit,
							},
							matchedText: match[0],
						};
					}
				}
			}
		}

		return null;
	}

	private static parseBoundaries(
		text: string,
		attributeRules: AttributeParserRule[] = [],
	): { startText: string; endText: string } | null {
		const markerRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"time_boundary_marker",
			attributeRules,
		);
		for (const rule of markerRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(text);
				if (match?.index !== undefined) {
					const startText = text.slice(0, match.index).trim();
					const endText = text.slice(match.index + match[0].length).trim();
					if (startText && endText) {
						return { startText, endText };
					}
				}
			}
		}
		return null;
	}

	private static parseNamedDateRange(
		text: string,
		attributeRules: AttributeParserRule[] = [],
	): {
		startText: string;
		endText: string;
		startDate?: Date;
		endDate?: Date;
		precision?: TimePrecisionLevel;
		remainingText: string;
	} | null {
		const rangeRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"calendar_date_range",
			attributeRules,
		);
		for (const rule of rangeRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "gi");
				const match = regex.exec(text);
				if (!match?.groups) continue;
				try {
					validateNamedGroups(match.groups, rule.namedGroupContract);
				} catch (e) {
					if (e instanceof NamedGroupContractError) continue;
					throw e;
				}
				const dates = ClinicalDateRangeTokenizer.extractCalendarDatesFromText(
					match[0],
					attributeRules,
				);
				const startDate = dates[0];
				const endDate = dates[1];
				if (!startDate || !endDate) continue;
				return {
					startText: match.groups.start || dates[0]?.toISOString() || match[0],
					endText: match.groups.end || dates[1]?.toISOString() || match[0],
					startDate,
					endDate,
					precision: "day",
					remainingText: text.replace(match[0], "").trim(),
				};
			}
		}
		return null;
	}

	private static parseNamedDateList(
		text: string,
		attributeRules: AttributeParserRule[] = [],
	): {
		dates: Date[];
		precision?: TimePrecisionLevel;
		remainingText: string;
	} | null {
		const listRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"calendar_date_list",
			attributeRules,
		);
		for (const rule of listRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "gi");
				const match = regex.exec(text);
				if (!match?.groups) continue;
				try {
					validateNamedGroups(match.groups, rule.namedGroupContract);
				} catch (e) {
					if (e instanceof NamedGroupContractError) continue;
					throw e;
				}
				const listText = match.groups.dates || match.groups.list;
				if (!listText) continue;
				const dates = ClinicalDateRangeTokenizer.extractCalendarDatesFromText(
					listText,
					attributeRules,
				);
				if (dates.length === 0) continue;
				return {
					dates,
					precision: "day",
					remainingText: text.replace(match[0], "").trim(),
				};
			}
		}
		return null;
	}

	private static extractCalendarDatesFromText(
		text: string,
		attributeRules: AttributeParserRule[] = [],
	): Date[] {
		const calendarRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"calendar_date",
			attributeRules,
		);
		const dates: Date[] = [];
		for (const rule of calendarRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = compileDateRegex(pattern);
				for (
					let match = regex.exec(text);
					match !== null;
					match = regex.exec(text)
				) {
					if (!match.groups) continue;
					const date = ClinicalDateRangeTokenizer.resolveCalendarDate(
						match.groups,
						rule,
					);
					if (date) dates.push(date);
					if (match.index === regex.lastIndex) regex.lastIndex++;
				}
			}
		}
		return dates;
	}

	private static parseExclusion(
		text: string,
		attributeRules: AttributeParserRule[] = [],
	): { baseText: string; exclusionText: string } | null {
		const markerRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"time_exclusion_marker",
			attributeRules,
		);
		for (const rule of markerRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const match = regex.exec(text);
				if (match?.index !== undefined) {
					const baseText = text.slice(0, match.index).trim();
					const exclusionText = text
						.slice(match.index + match[0].length)
						.trim();
					if (baseText && exclusionText) {
						return { baseText, exclusionText };
					}
				}
			}
		}
		return null;
	}

	private static parseRepeat(
		text: string,
		attributeRules: AttributeParserRule[],
		evaluatorRules: ParserDictionaryRule[],
	): TimeInterval["repeat"] | null {
		const frequency = FrequencyHelper.parse(
			text,
			attributeRules,
			evaluatorRules,
		);
		if (frequency?.interval) {
			return {
				multiplier: frequency.interval.multiplier,
				level: frequency.interval.unit as TimePrecisionLevel,
			};
		}

		const dailyRules = ClinicalDateRangeTokenizer.getAttributeRulesByTarget(
			"time_repeat_daily",
			attributeRules,
		);
		for (const rule of dailyRules) {
			for (const pattern of rule.regexPatterns) {
				if (getCompiledRegex(pattern, "i").test(text)) {
					return { multiplier: 1, level: "day" };
				}
			}
		}

		// Fallback to resolving precision directly (e.g. "Sundays" -> level: "sunday")
		const precision = ClinicalDateRangeTokenizer.resolvePrecision(
			text,
			attributeRules,
		);
		if (precision) {
			return { multiplier: 1, level: precision };
		}

		return null;
	}

	private static resolvePrecision(
		text: string,
		attributeRules: AttributeParserRule[],
	): TimePrecisionLevel | undefined {
		const normalized = text.trim().toLowerCase();
		const timeUnitRules = attributeRules.filter(
			(rule) => rule.targetField === "time_unit",
		);
		for (const rule of timeUnitRules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				const hasNamedGroups = /\(\?<[^>]+>/.test(pattern);
				const testStr = hasNamedGroups ? `0 ${normalized}` : normalized;
				if (regex.test(testStr)) {
					return rule.targetValue as TimePrecisionLevel;
				}
			}
		}
		return undefined;
	}

	private static getAttributeRulesByTarget(
		targetField: string,
		attributeRules: AttributeParserRule[] = [],
	): AttributeParserRule[] {
		const rules =
			attributeRules.length > 0 ? attributeRules : DEFAULT_ATTRIBUTE_RULES;
		return rules.filter(
			(rule: AttributeParserRule) => rule.targetField === targetField,
		);
	}

	private static resolveUnitFromRules(
		text: string,
		rules: AttributeParserRule[],
	): TimePrecisionLevel | null {
		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const regex = getCompiledRegex(pattern, "i");
				if (regex.test(text)) {
					return rule.targetValue as TimePrecisionLevel;
				}
			}
		}
		return null;
	}
}

export class ClinicalDateRangeHelper {
	static build(
		token: ClinicalDateRangeToken,
		seedTime?: Date | string | number,
	): ClinicalDateRange | null {
		const base: ClinicalDateRange = {};

		const toIso = (
			d: Date,
			precision: TimePrecisionLevel,
		): TemporalBoundary => ({
			assertedTimestampUtc: d.toISOString().replace(/\.\d+Z$/, "Z"),
			precisionLevel: precision,
		});

		if (token.startCalendarDate || token.endCalendarDate) {
			base.time = {};
			if (token.startCalendarDate) {
				base.time.startDatetime = toIso(
					token.startCalendarDate,
					token.calendarPrecision ?? "day",
				);
			}
			if (token.endCalendarDate) {
				base.time.endDatetime = toIso(
					token.endCalendarDate,
					token.calendarPrecision ?? "day",
				);
			}
		}

		if (token.relativeEstimate) {
			base.relativeEstimate = token.relativeEstimate;
		}

		// Resolve start boundaries
		let startBoundary: TemporalBoundary | undefined;
		if (token.startPrecision && token.startText) {
			const now = TimeHelper.getCurrentTimestamp(
				token.startPrecision,
				seedTime,
			);
			startBoundary = {
				assertedTimestampUtc: ClinicalDateRangeHelper.shiftToBoundary(
					now.assertedTimestampUtc,
					token.startPrecision,
					false,
				),
				precisionLevel: token.startPrecision,
			};
		}

		// Resolve end boundaries
		let endBoundary: TemporalBoundary | undefined;
		if (token.endPrecision && token.endText) {
			const now = TimeHelper.getCurrentTimestamp(token.endPrecision, seedTime);
			endBoundary = {
				assertedTimestampUtc: ClinicalDateRangeHelper.shiftToBoundary(
					now.assertedTimestampUtc,
					token.endPrecision,
					true,
				),
				precisionLevel: token.endPrecision,
			};
		}

		if (startBoundary || endBoundary || token.repeat) {
			base.time = {};
			if (startBoundary) base.time.startDatetime = startBoundary;
			if (endBoundary) base.time.endDatetime = endBoundary;
			if (token.repeat) base.time.repeat = token.repeat;
		}

		if (token.baseRepeat) {
			base.includedDatetimes = [
				{
					time: { repeat: token.baseRepeat },
					description: token.baseText,
				},
			];
		}
		if (token.baseStartCalendarDate || token.baseEndCalendarDate) {
			base.includedDatetimes = [
				{
					time: {
						...(token.baseStartCalendarDate
							? {
									startDatetime: toIso(
										token.baseStartCalendarDate,
										token.calendarPrecision ?? "day",
									),
								}
							: {}),
						...(token.baseEndCalendarDate
							? {
									endDatetime: toIso(
										token.baseEndCalendarDate,
										token.calendarPrecision ?? "day",
									),
								}
							: {}),
					},
					description: token.baseText,
				},
			];
		}
		if (token.listCalendarDates && token.listCalendarDates.length > 0) {
			base.includedDatetimes = token.listCalendarDates.map((date) => ({
				time: {
					startDatetime: toIso(date, token.calendarPrecision ?? "day"),
				},
			}));
		}

		if (token.exclusionRepeat) {
			base.excludedDatetimes = [
				{
					time: { repeat: token.exclusionRepeat },
					description: token.exclusionText,
				},
			];
		}
		if (token.exclusionStartCalendarDate || token.exclusionEndCalendarDate) {
			base.excludedDatetimes = [
				{
					time: {
						...(token.exclusionStartCalendarDate
							? {
									startDatetime: toIso(
										token.exclusionStartCalendarDate,
										token.calendarPrecision ?? "day",
									),
								}
							: {}),
						...(token.exclusionEndCalendarDate
							? {
									endDatetime: toIso(
										token.exclusionEndCalendarDate,
										token.calendarPrecision ?? "day",
									),
								}
							: {}),
					},
					description: token.exclusionText,
				},
			];
		}
		if (
			token.exclusionListCalendarDates &&
			token.exclusionListCalendarDates.length > 0
		) {
			base.excludedDatetimes = token.exclusionListCalendarDates.map((date) => ({
				time: {
					startDatetime: toIso(date, token.calendarPrecision ?? "day"),
				},
			}));
		}

		return Object.keys(base).length > 0 ? base : null;
	}

	private static shiftToBoundary(
		assertedTimestampUtc: string,
		precisionLevel: TimePrecisionLevel,
		isEndBoundary: boolean,
	): string {
		const date = new Date(assertedTimestampUtc);
		const weekdayOffsets: Record<DayOfWeek, number> = {
			monday: 1,
			tuesday: 2,
			wednesday: 3,
			thursday: 4,
			friday: 5,
			saturday: 6,
			sunday: 0,
		};

		// 100% Zero-bias precision based week shifting
		if (precisionLevel in weekdayOffsets) {
			const offset = weekdayOffsets[precisionLevel as DayOfWeek];
			const currentDay = date.getUTCDay();
			const delta = (offset - currentDay + 7) % 7;
			date.setUTCDate(date.getUTCDate() + delta);
		}

		const hours = isEndBoundary ? 23 : 0;
		const minutes = isEndBoundary ? 59 : 0;
		const seconds = isEndBoundary ? 59 : 0;
		date.setUTCHours(hours, minutes, seconds, 0);
		// Strip milliseconds to match target test expectations exactly
		return date.toISOString().replace(/\.\d+Z$/, "Z");
	}
}
