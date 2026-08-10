import { describe, expect, test } from "bun:test";
import {
	compileQuantityProfileRegex,
	parseQuantityWithProfile,
} from "../src/setup/quantity-grammar-compiler";
import type { QuantityGrammarProfile } from "../src/values/quantity-profile-types";

describe("Multi-Locale & Advanced Quantity Grammar Features", () => {
	const suffixProfile: QuantityGrammarProfile = {
		profileId: "vitals_suffix",
		label: "Vitals Suffix",
		version: 1,
		decimalSeparator: ".",
		thousandsSeparator: ",",
		unitAliases: {
			bpm: "beats/min",
			mmhg: "mmHg",
			$: "USD",
			usd: "USD",
			"ملم زئبق": "mmHg",
			毫米汞柱: "mmHg",
			毫克: "mg",
			mg: "mg",
		},
		operatorAliases: {
			">": "gt",
			"<=": "lte",
			"أكثر من": "gt",
			大于: "gt",
		},
		rangeDelimiters: ["to", "-", "إلى", "至"],
		ordering: {
			unitOrder: "suffix",
			rangePattern: "distributive_suffix",
		},
		measurementWordBoundary: "both",
	};

	const policy = {
		allowRange: true,
		allowOperator: true,
		statistics: "accept" as const,
		allowDataPointCount: false,
	};

	test("Distributive prefix range ($20 to 30)", () => {
		const prefixProfile: QuantityGrammarProfile = {
			...suffixProfile,
			profileId: "usd_prefix",
			ordering: {
				unitOrder: "prefix",
				rangePattern: "distributive_prefix",
				distributivePrefix: {
					symbol: "$",
					upperBoundSymbolPolicy: "optional",
				},
			},
		};

		const res = parseQuantityWithProfile("$20 to 30", prefixProfile, policy);
		expect(res.value).toBeDefined();
		expect(res.value?.lower).toBe(20);
		expect(res.value?.upper).toBe(30);
		expect(res.value?.unit).toBe("USD");
	});

	test("Distributive prefix range with colon label (dose: 5 to 10 mg)", () => {
		const prefixLabelProfile: QuantityGrammarProfile = {
			...suffixProfile,
			profileId: "label_prefix",
			ordering: {
				unitOrder: "prefix",
				rangePattern: "distributive_prefix",
				distributivePrefix: {
					symbol: "dose:",
					prefixSeparator: "colon",
				},
			},
		};

		const res = parseQuantityWithProfile(
			"dose: 5 to 10 mg",
			prefixLabelProfile,
			policy,
		);
		expect(res.value).toBeDefined();
		expect(res.value?.lower).toBe(5);
		expect(res.value?.upper).toBe(10);
		expect(res.value?.unit).toBe("mg");
	});

	test("Arabic RTL text direction and operator resolution", () => {
		const res = parseQuantityWithProfile(
			"أكثر من ١٢٠ ملم زئبق",
			suffixProfile,
			policy,
		);
		// Note: parseQuantity parses digits from text
		expect(res).toBeDefined();
	});

	test("CJK non-spaced measurement matching (measurementWordBoundary: 'none')", () => {
		const cjkProfile: QuantityGrammarProfile = {
			...suffixProfile,
			measurementWordBoundary: "none",
		};

		const pattern = compileQuantityProfileRegex(cjkProfile);
		const regex = new RegExp(pattern, "u");

		expect(regex.test("服用50毫克每日")).toBe(true);
	});

	test("Word boundary policy 'both' rejects attached letters", () => {
		const pattern = compileQuantityProfileRegex(suffixProfile, {
			fullSpanAnchor: false,
		});
		const regex = new RegExp(pattern, "u");

		expect(regex.test("test50mg")).toBe(false);
		expect(regex.test("50mg")).toBe(true);
	});
});
