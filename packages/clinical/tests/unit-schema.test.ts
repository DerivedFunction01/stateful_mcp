import { describe, expect, test } from "bun:test";
import type {
	MassMeasurement,
	TemperatureMeasurement,
	PressureMeasurement,
} from "../src/schemas/measurement";
import { MeasurementHelper, QuantityTokenizer } from "../src/parser/helpers/measurement-helper";
import { DEFAULT_ATTRIBUTE_RULES } from "../src/store/defaults";

describe("Strongly-Typed Measurement Units & parseAs Helper", () => {
	test("should parse MassMeasurement correctly using parseAs", () => {
		const token = QuantityTokenizer.tokenize("50 milligram", [], DEFAULT_ATTRIBUTE_RULES);
		const parsed = MeasurementHelper.parseAs<MassMeasurement>(token!, "mass", DEFAULT_ATTRIBUTE_RULES);
		expect(parsed).not.toBeNull();
		expect(parsed!.unitAnchor).toBe("mass");
		expect(parsed!.magnitude).toBe(50);
		expect(parsed!.unit!.display).toBe("mg");
	});

	test("should parse TemperatureMeasurement correctly using parseAs", () => {
		const token = QuantityTokenizer.tokenize("37.5 Celsius", [], DEFAULT_ATTRIBUTE_RULES);
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>(token!, "temperature", DEFAULT_ATTRIBUTE_RULES);
		expect(parsed).not.toBeNull();
		expect(parsed!.unitAnchor).toBe("temperature");
		expect(parsed!.magnitude).toBe(37.5);
		expect(parsed!.unit!.display).toBe("Celsius");
	});

	test("should return null when parsing mismatching unit anchor", () => {
		// 120 mmHg is pressure, not temperature
		const token = QuantityTokenizer.tokenize("120 mmHg", [], DEFAULT_ATTRIBUTE_RULES);
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>(token!, "temperature", DEFAULT_ATTRIBUTE_RULES);
		expect(parsed).toBeNull();
	});

	test("should typecheck unit assignments correctly", () => {
		// Valid compile-time types (testing that we can declare these types compile-time cleanly)
		const mass: MassMeasurement = {
			magnitude: 10,
			unitAnchor: "mass",
			unit: { display: "kg" }
		};
		expect(mass.unit!.display).toBe("kg");

		const temp: TemperatureMeasurement = {
			magnitude: 37,
			unitAnchor: "temperature",
			unit: { display: "Celsius" }
		};
		expect(temp.unit!.display).toBe("Celsius");
	});
});
