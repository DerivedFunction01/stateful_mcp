import { describe, expect, it } from "bun:test";
import { type ValueType, type MeasurementOperator, type SingleMeasurement, VALUE_TYPES, MEASUREMENT_OPERATORS, MASS_CONCENTRATION_UNITS, type TimeMeasurement, TIME_PRECISION_LEVELS, type ObservationEvent, OBSERVATION_TRAJECTORIES } from "../src";


describe("redesigned measurement contracts", () => {
	it("exposes statistical types and operators as runtime metadata", () => {
		const statistic: ValueType = "mean";
		const operator: MeasurementOperator = "gte";
		const measurement: SingleMeasurement = {
			magnitude: 120,
			unit: "mmHg",
			value_type: statistic,
			operator,
		};

		expect(VALUE_TYPES).toContain(measurement.value_type);
		expect(MEASUREMENT_OPERATORS).toContain(measurement.operator);
		expect(measurement.unit).toBe("mmHg");
	});

	it("keeps runtime mass-concentration units aligned with the derived type", () => {
		expect(MASS_CONCENTRATION_UNITS).toHaveLength(24);
		expect(MASS_CONCENTRATION_UNITS).toContain("g/uL");
		expect(MASS_CONCENTRATION_UNITS).toContain("pg/mL");
	});

	it("models time measurement as a primitive-unit measurement", () => {
		const duration: TimeMeasurement = {
			magnitude: 2,
			unitAnchor: "time",
			unit: "hour",
		};
		expect(duration.unitAnchor).toBe("time");
		expect(TIME_PRECISION_LEVELS).toContain(duration.unit);
	});
});

describe("redesigned observation contract", () => {
	it("uses an ordered duration collection and runtime trajectory values", () => {
		const observation: ObservationEvent = {
			id: "obs-1",
			concept: { display: "Chest pain" },
			rawTerm: "chest pain",
			sourceType: "patient_reported",
			severity: { score: 4, maxScore: 10, normalizedScore: 0.4 },
			duration: [
				{ magnitude: 2, unitAnchor: "time", unit: "hour" },
				{ magnitude: 1, unitAnchor: "time", unit: "day" },
			],
			trajectory: "stable",
		};

		expect(observation.duration).toHaveLength(2);
		expect(OBSERVATION_TRAJECTORIES).toContain(observation.trajectory);
	});
});
