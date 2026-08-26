import { parseNumericValue } from "../numeric";
import { getCompiledRegex } from "../regex";
import {
	extractPostfixAlias,
	extractPrefixAlias,
	flattenAndSortAliases,
} from "../token-matcher";
import type {
	RelativeDirection,
	RelativeTemporalConfig,
	RelativeTemporalSlot,
	TemporalModifierKind,
} from "./types";

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses free text into a structured RelativeTemporalSlot using discrete pattern variants
 * (shorthand definitions/dictionary, modifier + target, prefix offset, postfix offset, part-of-day/calendar window).
 * Does NOT inject hardcoded English assumptions.
 */
export function evaluateRelativeTemporalGrammar(
	input: string,
	config: RelativeTemporalConfig = {},
): RelativeTemporalSlot | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;

	// Variant 1a: Direct RelativeTemporalDefinition matching
	if (config.relativeDefinitions) {
		const lower = trimmed.toLocaleLowerCase(config.locales as string);
		for (const def of config.relativeDefinitions) {
			for (const alias of def.aliases) {
				if (alias.toLocaleLowerCase(config.locales as string) === lower) {
					return {
						direction: def.direction,
						amount: def.amount,
						unit: def.unit,
						...(def.specificQualifier
							? { specificQualifier: def.specificQualifier }
							: {}),
					};
				}
			}
		}
	}

	// Variant 1b: Key-based relativeSlots & relativeTemporalAliases dictionary match
	if (config.relativeTemporalAliases) {
		const sorted = flattenAndSortAliases(config.relativeTemporalAliases, true);
		const lower = trimmed.toLocaleLowerCase(config.locales as string);
		for (const { key, alias } of sorted) {
			if (alias.toLocaleLowerCase(config.locales as string) === lower) {
				if (config.relativeSlots && config.relativeSlots[key]) {
					return config.relativeSlots[key];
				}
				// Support self-describing structured key conventions: e.g. "past_1_day", "future_2_week", "current_0_day"
				if (
					key.startsWith("past_") ||
					key.startsWith("future_") ||
					key.startsWith("current_")
				) {
					const parts = key.split("_");
					const dir = parts[0] as RelativeDirection;
					const amt = Number(parts[1]) || 0;
					const u = (parts[2] as RelativeTemporalSlot["unit"]) || "day";
					return { direction: dir, amount: amt, unit: u };
				}
				return {
					direction: "current",
					amount: 0,
					unit: "day",
					specificQualifier: key,
				};
			}
		}
	}

	// Variant 1c: Temporal Modifier + Target Entity (e.g. "last December", "next Friday", "this month", "上个月", "下周五")
	if (config.temporalModifiers) {
		const sortedModifiers = flattenAndSortAliases(
			config.temporalModifiers,
			true,
		);
		const modMatch = extractPrefixAlias(
			trimmed,
			sortedModifiers,
			config.locales,
		);
		if (modMatch) {
			const modKind = modMatch.key as TemporalModifierKind;
			const dir: RelativeDirection =
				modKind === "previous"
					? "past"
					: modKind === "next"
						? "future"
						: "current";
			const rest = modMatch.remainderText.trim();

			if (rest) {
				// 1. Check Month Aliases
				if (config.monthAliases) {
					const sortedMonths = flattenAndSortAliases(config.monthAliases, true);
					const mMatch = extractPrefixAlias(rest, sortedMonths, config.locales);
					if (mMatch && !mMatch.remainderText) {
						return {
							direction: dir,
							amount: 1,
							unit: "month",
							specificQualifier: mMatch.key,
						};
					}
				}

				// 2. Check Weekday Aliases
				if (config.weekdayAliases) {
					const sortedWeekdays = flattenAndSortAliases(
						config.weekdayAliases,
						true,
					);
					const wMatch = extractPrefixAlias(
						rest,
						sortedWeekdays,
						config.locales,
					);
					if (wMatch && !wMatch.remainderText) {
						return {
							direction: dir,
							amount: 1,
							unit: "day",
							specificQualifier: `weekday_${wMatch.key}`,
						};
					}
				}

				// 3. Check Unit Aliases (e.g. "week", "month", "year", "quarter", "season", "day")
				if (config.unitAliases) {
					const sortedUnits = flattenAndSortAliases(config.unitAliases, true);
					const uMatch = extractPrefixAlias(rest, sortedUnits, config.locales);
					if (uMatch && !uMatch.remainderText) {
						return {
							direction: dir,
							amount: 1,
							unit: uMatch.key as RelativeTemporalSlot["unit"],
						};
					}
				}

				// 4. Check Calendar Season / Quarter Aliases
				if (config.calendarConfig?.seasonAliases) {
					const sortedSeasons = flattenAndSortAliases(
						config.calendarConfig.seasonAliases,
						true,
					);
					const sMatch = extractPrefixAlias(
						rest,
						sortedSeasons,
						config.locales,
					);
					if (sMatch && !sMatch.remainderText) {
						return {
							direction: dir,
							amount: 1,
							unit: "season",
							specificQualifier: sMatch.key,
						};
					}
				}
				if (config.calendarConfig?.quarterAliases) {
					const sortedQuarters = flattenAndSortAliases(
						config.calendarConfig.quarterAliases,
						true,
					);
					const qMatch = extractPrefixAlias(
						rest,
						sortedQuarters,
						config.locales,
					);
					if (qMatch && !qMatch.remainderText) {
						return {
							direction: dir,
							amount: 1,
							unit: "quarter",
							specificQualifier: qMatch.key,
						};
					}
				}
			}
		}
	}

	// Variant 2: Prefix Offset (e.g. "il y a 2 heures", "in 3 days", "vor 2 Stunden", "dans 15 minutes")
	if (config.directionPrefixes) {
		const sortedDirs = flattenAndSortAliases(config.directionPrefixes, true);
		const dirMatch = extractPrefixAlias(trimmed, sortedDirs, config.locales);
		if (dirMatch) {
			const dir = dirMatch.key as RelativeDirection;
			const rest = dirMatch.remainderText;
			if (config.unitAliases) {
				const sortedUnits = flattenAndSortAliases(config.unitAliases, true);
				const unitMatch = extractPostfixAlias(
					rest,
					sortedUnits,
					config.locales,
				);
				if (unitMatch) {
					const numRes = parseNumericValue(unitMatch.remainderText, {
						...config.numericConfig,
					});
					if (numRes.parsed) {
						return {
							direction: dir,
							amount: numRes.parsed.value,
							unit: unitMatch.key as RelativeTemporalSlot["unit"],
						};
					}
				}
			}
		}
	}

	// Variant 3: Postfix Offset (e.g. "2 hours ago", "3 days from now", "2 часа назад", "3天后", "2 heures plus tard")
	if (config.directionPostfixes) {
		const sortedDirs = flattenAndSortAliases(config.directionPostfixes, true);
		const dirMatch = extractPostfixAlias(trimmed, sortedDirs, config.locales);
		if (dirMatch) {
			const dir = dirMatch.key as RelativeDirection;
			const rest = dirMatch.remainderText;
			if (config.unitAliases) {
				const sortedUnits = flattenAndSortAliases(config.unitAliases, true);
				const unitMatch = extractPostfixAlias(
					rest,
					sortedUnits,
					config.locales,
				);
				if (unitMatch) {
					const numRes = parseNumericValue(unitMatch.remainderText, {
						...config.numericConfig,
					});
					if (numRes.parsed) {
						return {
							direction: dir,
							amount: numRes.parsed.value,
							unit: unitMatch.key as RelativeTemporalSlot["unit"],
						};
					}
				}
			}
		}
	}

	// Variant 4: Calendar / Season / Quarter Window Match (e.g. "summer in 2026", "Q2 2026", "2020s")
	if (config.calendarConfig) {
		// Seasons
		if (config.calendarConfig.seasonAliases) {
			const sortedSeasons = flattenAndSortAliases(
				config.calendarConfig.seasonAliases,
				true,
			);
			for (const { key, alias } of sortedSeasons) {
				const regex = getCompiledRegex(
					`^${escapeRegex(alias)}(?:\\s*(?:in\\s+)?(?<year>\\d{4}))?$`,
					"iu",
				);
				const m = trimmed.match(regex);
				if (m) {
					const refYear = m.groups?.year ? Number(m.groups.year) : undefined;
					return {
						direction: "current",
						amount: 0,
						unit: "season",
						specificQualifier: key,
						...(refYear ? { referenceYear: refYear } : {}),
					};
				}
			}
		}
		// Quarters
		if (config.calendarConfig.quarterAliases) {
			const sortedQuarters = flattenAndSortAliases(
				config.calendarConfig.quarterAliases,
				true,
			);
			for (const { key, alias } of sortedQuarters) {
				const regex = getCompiledRegex(
					`^${escapeRegex(alias)}(?:\\s*(?:in\\s+)?(?<year>\\d{4}))?$`,
					"iu",
				);
				const m = trimmed.match(regex);
				if (m) {
					const refYear = m.groups?.year ? Number(m.groups.year) : undefined;
					return {
						direction: "current",
						amount: 0,
						unit: "quarter",
						specificQualifier: key,
						...(refYear ? { referenceYear: refYear } : {}),
					};
				}
			}
		}
	}

	// Variant 5: Part of Day Match (e.g. "morning", "evening", "matin", "soir")
	if (config.partOfDayConfig?.aliases) {
		const sortedParts = flattenAndSortAliases(
			config.partOfDayConfig.aliases,
			true,
		);
		for (const { key, alias } of sortedParts) {
			if (
				alias.toLocaleLowerCase(config.locales as string) ===
				trimmed.toLocaleLowerCase(config.locales as string)
			) {
				return {
					direction: "current",
					amount: 0,
					unit: "day",
					specificQualifier: key,
				};
			}
		}
	}

	return undefined;
}
