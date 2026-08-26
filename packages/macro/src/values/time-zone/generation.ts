/**
 * Dynamic timezone generator and resolver utilities.
 * 100% derived from ECMAScript Intl runtime without manual static lists.
 */

export interface GenerateTimeZoneMapOptions {
	/** If true, returns an empty map for users starting from scratch. */
	readonly blank?: boolean;
}

let cachedDefaultCodeMap: Record<string, string> | undefined;

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

	if (cachedDefaultCodeMap) {
		return { ...cachedDefaultCodeMap };
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

	cachedDefaultCodeMap = Object.freeze({ ...map });
	return { ...cachedDefaultCodeMap };
}
