import type {
	DayOfWeek,
	PartOfDay,
	Season,
	TemporalDirection,
} from "../schemas/schemas-interface/time";
import type {
	TemporalAliasRule,
	TemporalSyntaxConfig,
	TemporalWordBoundary,
} from "./numerical-syntax-profile";

export type TemporalEnumValue =
	| DayOfWeek
	| PartOfDay
	| Season
	| TemporalDirection
	| "now"
	| "document-date"
	| "encounter-date";

export type TemporalEnumKind =
	| "day-of-week"
	| "part-of-day"
	| "season"
	| "direction"
  | "anchor";

export interface CompiledTemporalAliasPattern {
	pattern: string;
	flags: string;
	aliases: Array<{ value: TemporalEnumValue; alias: string }>;
}

export function resolveTemporalEnum(
	text: string,
	kind: TemporalEnumKind,
	profile: TemporalSyntaxConfig,
): TemporalEnumValue | undefined {
	const normalized = text.trim().toLocaleLowerCase();
	const aliases: Readonly<Record<string, TemporalEnumValue | TemporalAliasRule>> =
		kind === "day-of-week"
			? profile.dayOfWeekAliases ?? {}
			: kind === "part-of-day"
				? profile.partOfDayAliases ?? {}
				: kind === "season"
					? profile.seasonAliases ?? {}
					: kind === "direction"
						? profile.directionAliases
						: profile.anchorAliases ?? {};
	const entry = aliases[normalized];
	if (entry) return typeof entry === "string" ? entry : entry.value as TemporalEnumValue;
	for (const raw of Object.values(aliases)) {
		if (typeof raw === "string") continue;
		if (!isTemporalAliasRule(raw)) continue;
		const rule = raw;
		const matched = rule.aliases.some((alias) =>
			rule.caseSensitive === false
				? alias.toLocaleLowerCase() === normalized
				: alias === text.trim(),
		);
		if (matched) return rule.value as TemporalEnumValue;
	}
	return undefined;
}

function isTemporalAliasRule(value: unknown): value is TemporalAliasRule {
	return (
		typeof value === "object" &&
		value !== null &&
		"value" in value &&
		"aliases" in value &&
		Array.isArray(value.aliases)
	);
}

export function resolveTemporalEnumFromText(
	text: string,
	kind: TemporalEnumKind,
	profile: TemporalSyntaxConfig,
): { value?: TemporalEnumValue; matchedText?: string } {
	const words = text.trim().toLocaleLowerCase().split(/\s+/u);
	for (let length = words.length; length > 0; length--) {
		const candidate = words.slice(0, length).join(" ");
		const value = resolveTemporalEnum(candidate, kind, profile);
		if (value) return { value, matchedText: candidate };
	}
	return {};
}

export function compileTemporalEnumPattern(
	kind: TemporalEnumKind,
	profile: TemporalSyntaxConfig,
): CompiledTemporalAliasPattern {
	const aliases = aliasTable(profile, kind);
	const entries: CompiledTemporalAliasPattern["aliases"] = [];
	const patterns: string[] = [];
	let flags = "u";
	let caseSensitive: boolean | undefined;
	for (const [key, raw] of Object.entries(aliases)) {
		const rule: TemporalAliasRule = typeof raw === "string"
			? { value: raw, aliases: [key] }
			: isTemporalAliasRule(raw)
				? raw
				: { value: key, aliases: [] };
		const ruleCaseSensitive = rule.caseSensitive ?? false;
		if (caseSensitive !== undefined && caseSensitive !== ruleCaseSensitive)
			throw new Error(
				`Temporal enum '${kind}' mixes case-sensitive and case-insensitive aliases`,
			);
		caseSensitive = ruleCaseSensitive;
		for (const alias of rule.aliases) {
			entries.push({ value: rule.value as TemporalEnumValue, alias });
			const escaped = escapeRegex(alias);
			patterns.push(applyBoundary(escaped, rule.wordBoundary ?? "none"));
		}
	}
	if (caseSensitive === false) flags = "iu";
	return { pattern: `(?:${patterns.join("|")})`, flags, aliases: entries };
}

function aliasTable(
	profile: TemporalSyntaxConfig,
	kind: TemporalEnumKind,
): Readonly<Record<string, unknown>> {
	return kind === "day-of-week"
		? profile.dayOfWeekAliases ?? {}
		: kind === "part-of-day"
			? profile.partOfDayAliases ?? {}
			: kind === "season"
				? profile.seasonAliases ?? {}
				: kind === "direction"
					? profile.directionAliases
					: profile.anchorAliases ?? {};
}

function applyBoundary(pattern: string, boundary: TemporalWordBoundary): string {
	const before = boundary === "before" || boundary === "both";
	const after = boundary === "after" || boundary === "both";
	const left = before ? "(?<![\\p{L}\\p{N}_])" : "";
	const right = after ? "(?![\\p{L}\\p{N}_])" : "";
	return `${left}${pattern}${right}`;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
