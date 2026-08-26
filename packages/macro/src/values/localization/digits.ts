import type { DigitNormalizationPolicy } from "../../contracts/extension-config";

const UNICODE_DIGIT_ZERO_BASES: readonly number[] = [
	0x0030, // ASCII 0..9
	0x0660, // Arabic-Indic
	0x06f0, // Eastern Arabic-Indic / Persian
	0x07c0, // NKo
	0x0966, // Devanagari
	0x09e6, // Bengali
	0x0a66, // Gurmukhi
	0x0ae6, // Gujarati
	0x0b66, // Oriya
	0x0be6, // Tamil
	0x0c66, // Telugu
	0x0ce6, // Kannada
	0x0d66, // Malayalam
	0x0de6, // Sinhala
	0x0e50, // Thai
	0x0ed0, // Lao
	0x0f20, // Tibetan
	0x1040, // Myanmar
	0x1090, // Myanmar Shan
	0x17e0, // Khmer
	0x1810, // Mongolian
	0x1946, // Limbu
	0x19d0, // New Tai Lue
	0x1a80, // Tai Tham Hora
	0x1a90, // Tai Tham Tham
	0x1b50, // Balinese
	0x1bb0, // Sundanese
	0x1c40, // Lepcha
	0x1c50, // Ol Chiki
	0xa620, // Vai
	0xa8d0, // Saurashtra
	0xa900, // Kayah Li
	0xa9d0, // Javanese
	0xaa50, // Cham
	0xabf0, // Meetei Mayek
	0xff10, // Fullwidth
	0x104a0, // Osmanya
	0x10d30, // Hanifi Rohingya
	0x11066, // Brahmi
	0x110f0, // Sora Sompeng
	0x11136, // Chakma
	0x111d0, // Sharada
	0x112e0, // Khudawadi
	0x11450, // Newa
	0x114d0, // Tirhuta
	0x11650, // Modi
	0x116c0, // Takri
	0x11730, // Ahom
	0x118e0, // Warang Citi
	0x11c50, // Bhaiksuki
	0x11d50, // Masaram Gondi
	0x11da0, // Gunjala Gondi
	0x16a60, // Mro
	0x16b50, // Pahawh Hmong
	0x1d7ce, // Math bold 0
	0x1d7d8, // Math double-struck 0
	0x1d7e2, // Math sans-serif 0
	0x1d7ec, // Math sans-serif bold 0
	0x1d7f6, // Math monospace 0
];

function findDigitBase(cp: number): number | undefined {
	let low = 0;
	let high = UNICODE_DIGIT_ZERO_BASES.length - 1;
	while (low <= high) {
		const mid = (low + high) >>> 1;
		const base = UNICODE_DIGIT_ZERO_BASES[mid]!;
		if (cp >= base && cp <= base + 9) {
			return base;
		}
		if (cp < base) {
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}
	return undefined;
}

/**
 * Automatically normalizes any Unicode decimal digit across all 60+ world numeral scripts
 * (Arabic-Indic, Persian, Devanagari, Bengali, Thai, Khmer, Tibetan, Ethiopic, Fullwidth, etc.) to ASCII '0'..'9'.
 */
export function normalizeUnicodeDigits(
	input: string,
	policy: DigitNormalizationPolicy = "auto",
	customMap?: Readonly<Record<string, string>>,
): string {
	if (policy === "ascii-only") return input;

	if (policy === "custom" && customMap) {
		let result = input;
		for (const [from, to] of Object.entries(customMap)) {
			result = result.replaceAll(from, to);
		}
		return result;
	}

	// Auto: Normalize NFKC compatibility forms and map all \p{Nd} decimal digits to ASCII '0'..'9'
	return input.normalize("NFKC").replace(/\p{Nd}/gu, (char) => {
		const cp = char.codePointAt(0);
		if (cp === undefined) return char;
		const base = findDigitBase(cp);
		return base !== undefined ? String(cp - base) : char;
	});
}
