import { describe, expect, test } from "bun:test";
import { normalizeProfile } from "../src/init/bootstrap/normalizers/profile";
import { records } from "../src/init/seed/modules/profile";

describe("quantity display bootstrap recovery", () => {
	test("starter profile includes unit display defaults", () => {
		const display = (records[0]!.payload as any).quantityDisplay;
		expect(display.units.mg.short).toBe("mg");
		expect(display.units.day.short).toBe("d");
	});

	test("normalization supplies defaults when omitted", () => {
		const profile = normalizeProfile({
			recordId: "p",
			profileId: "p",
			kind: "profile",
			payload: {},
		} as any);
		expect(profile!.quantityDisplay!.units!.mg!.short).toBe("mg");
	});
});
