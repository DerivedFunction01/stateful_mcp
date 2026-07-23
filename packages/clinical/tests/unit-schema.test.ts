import { describe, expect, test } from "bun:test";
import type {
	MassMeasurement,
	TemperatureMeasurement,
	PressureMeasurement,
} from "../src/schemas/measurement";
import { MeasurementHelper } from "../src/parser/helpers/measurement-helper";

describe("Strongly-Typed Measurement Units & parseAs Helper", () => {
	test("should parse MassMeasurement correctly using parseAs", () => {
		const parsed = MeasurementHelper.parseAs<MassMeasurement>("50 milligram", "mass");
		expect(parsed).not.toBeNull();
		expect(parsed!.unitAnchor).toBe("mass");
		expect(parsed!.magnitude).toBe(50);
		expect(parsed!.unit!.display).toBe("mg");
	});

	test("should parse TemperatureMeasurement correctly using parseAs", () => {
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>("37.5 Celsius", "temperature");
		expect(parsed).not.toBeNull();
		expect(parsed!.unitAnchor).toBe("temperature");
		expect(parsed!.magnitude).toBe(37.5);
		expect(parsed!.unit!.display).toBe("Celsius");
	});

	test("should return null when parsing mismatching unit anchor", () => {
		// 120 mmHg is pressure, not temperature
		const parsed = MeasurementHelper.parseAs<TemperatureMeasurement>("120 mmHg", "temperature");
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
