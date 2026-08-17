/**
 * Dynamic timezone generator and resolver utilities.
 * 100% derived from ECMAScript Intl runtime without manual static lists.
 */

export interface GenerateTimeZoneMapOptions {
	/** If true, returns an empty map for users starting from scratch. */
	readonly blank?: boolean;
}

/**
 * Pure dynamic timezone short code map generator.
 * Zero hardcoded keys — derived dynamically from Intl.supportedValuesOf("timeZone").
 */
export function generateTimeZoneCodeMap(
	options: GenerateTimeZoneMapOptions = {},
): Record<string, string> {
	if (options.blank) {
		return {};
	}

	const map: Record<string, string> = {};
	const supportedZones = Intl.supportedValuesOf("timeZone");

	// Test dates across both hemispheres/seasons (January and July) to capture
	// both Standard (e.g. PST, EST) and Daylight Savings (e.g. PDT, EDT) short codes
	const testDates = [
		new Date("2026-01-15T12:00:00Z"),
		new Date("2026-07-15T12:00:00Z"),
	];

	for (const timeZone of supportedZones) {
		for (const date of testDates) {
			try {
				const formatter = new Intl.DateTimeFormat("en-US", {
					timeZone,
					timeZoneName: "short",
				});

				const parts = formatter.formatToParts(date);
				const code = parts
					.find((p) => p.type === "timeZoneName")
					?.value?.trim();

				// Keep clean 2-4 letter uppercase short codes
				if (code && /^[A-Z]{2,4}$/u.test(code)) {
					if (!map[code]) {
						map[code] = timeZone;
					}
				}
			} catch {
				// Ignore non-formattable zones
			}
		}
	}

	return map;
}

/**
 * Checks if a string is a valid IANA timezone supported by the runtime.
 */
export function isValidTimeZone(timeZone: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolves a timezone string (short code, IANA identifier, or empty) to a canonical IANA timezone.
 */
export function resolveTimeZone(
	input?: string,
	codeMap?: Record<string, string>,
): string {
	const trimmed = input?.trim();
	if (!trimmed) {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	}

	// 1. Check codeMap override if provided
	if (codeMap && codeMap[trimmed]) {
		return codeMap[trimmed]!;
	}

	// 2. Check upper-case lookup in codeMap
	const upper = trimmed.toUpperCase();
	if (codeMap && codeMap[upper]) {
		return codeMap[upper]!;
	}

	// 3. Direct IANA validation
	if (isValidTimeZone(trimmed)) {
		return trimmed;
	}

	// 4. Fallback to host system timezone
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Resolves the ISO offset (e.g. "+00:00", "-04:00", "+09:00") for a given IANA timezone at a reference date.
 */
export function getTimeZoneIsoOffset(
	timeZone: string,
	date: Date = new Date(),
): string {
	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			timeZoneName: "longOffset",
		});

		const parts = formatter.formatToParts(date);
		const tzPart = parts.find((p) => p.type === "timeZoneName")?.value;

		if (!tzPart || tzPart === "GMT" || tzPart === "UTC") {
			return "+00:00";
		}

		return tzPart.replace("GMT", "");
	} catch {
		return "+00:00";
	}
}
