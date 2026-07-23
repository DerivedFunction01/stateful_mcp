import type { CodeableConcept } from "./shared";

export type TerrestrialUnitAnchor =
  | "length"
  | "mass"
  | "time"
  | "temperature"
  | "velocity"
  | "acceleration"
  | "volume"
  | "area"
  | "force"
  | "pressure"
  | "energy";

export type PhysiologicalUnitAnchor =
  | "concentration"
  | "mass_concentration"
  | "substance_concentration"
  | "mass_fraction"
  | "fraction"
  | "osmolality"
  | "osmolarity"
  | "catalytic_activity"
  | "number"
  | "arbitrary";

export type EngineeringUnitAnchor =
  | "dynamic_viscosity"
  | "power"
  | "power_level"
  | "pressure_level"
  | "electric_current"
  | "electric_potential"
  | "magnetic_flux_density";

export type MeasurementUnitAnchor = TerrestrialUnitAnchor | PhysiologicalUnitAnchor | EngineeringUnitAnchor;

/**
 * Root of the measurement hierarchy.
 * Carries the raw numeric value plus optional operator, approximation flag,
 * and data-point count.  Used directly by the parser (which does not yet know
 * the physical dimension) and as the base for every typed sub-interface.
 */
export interface SingleMeasurement {
	magnitude: number;
	unit?: CodeableConcept;
	num_data_points?: number;
	operator?: "eq" | "gt" | "gte" | "lt" | "lte";
	is_approximate?: boolean;
}

/**
 * Extends SingleMeasurement by locking in a physical-dimension anchor.
 * Every domain-specific measurement sub-interface extends this.
 */
export interface BoundedMeasurement extends SingleMeasurement {
  unitAnchor: MeasurementUnitAnchor;
}

export interface TemperatureMeasurement extends BoundedMeasurement {
  unitAnchor: "temperature";
}

export interface PressureMeasurement extends BoundedMeasurement {
  unitAnchor: "pressure";
}

export interface CountMeasurement extends BoundedMeasurement {
  unitAnchor: "number";
}

export interface DistanceMeasurement extends BoundedMeasurement {
  unitAnchor: "length";
}

export interface MassMeasurement extends BoundedMeasurement {
  unitAnchor: "mass";
}

export interface MassConcentrationMeasurement extends BoundedMeasurement {
  unitAnchor: "mass_concentration";
}

/** Covers all pharmaceutical dosage forms: solid mass (mg, g) or liquid concentration (mg/mL). */
export type DosageMeasurement = MassMeasurement | MassConcentrationMeasurement;

/** Dimensionless score or ratio produced by an algorithmic evaluation. */
export interface ScoreMeasurement extends BoundedMeasurement {
  unitAnchor: "arbitrary";
}

/**
 * Type guard: narrows a SingleMeasurement to BoundedMeasurement when a
 * physical-dimension anchor was resolved during parsing.
 */
export function isBoundedMeasurement(m: SingleMeasurement): m is BoundedMeasurement {
	return "unitAnchor" in m && (m as BoundedMeasurement).unitAnchor !== undefined;
}
