import { buildNumericPatternString, parseNumericValue } from "../numeric";
import { escapeRegex } from "../regex";
import { flattenAndSortAliases } from "../token-matcher";
import { compileFormatRegex, FREQUENCY_TOKENS } from "../token-spec";
import { validateAndResolve } from "./grammar-validation";
import type { CadenceParseContext } from "./parse-context";
import type { CadenceSchedule, CadenceScheduleResolution } from "./types";

/**
 * 3. Match explicit configured templates if provided. Resolves interval,
 * recurrence, and event-anchor/relative-offset candidates from named token
 * groups. Returns the first resolved schedule envelope, or undefined.
 */
export function tryTemplates<
	TAnchor extends string = string,
	TUnit extends string = string,
>(
	ctx: CadenceParseContext<TAnchor, TUnit>,
): CadenceScheduleResolution<TAnchor, TUnit> | undefined {
	const {
		config,
		intervalPrefixes,
		timeUnitAliases,
		recurrenceConnectors,
		relativeOffsetConnectors,
		eventAnchorAliases,
		workingText,
		isConditional,
		conditionReason,
		rawText,
		diagnostics,
		policy,
		resolveTimeUnit,
		resolveMultiplier,
	} = ctx;

	if (!config.templates || config.templates.length === 0) return undefined;

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
										da.toLocaleLowerCase(config.locales as string) === dirLower,
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
	return undefined;
}
