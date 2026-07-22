import type {
	ClinicalDateRange,
	ClinicalSourceType,
	CodeableConcept,
	ProductIdentifier,
	SingleMeasurement,
} from "./shared";

// =====================================================================
// 1. HARD COMPILER ENUMS BOUNDED BY PHYSICS & STANDARDS
// =====================================================================

export type OperationalDomain = "land" | "water" | "air" | "space";

export type CoordinateDatum =
	| "WGS84"
	| "NAD83"
	| "ETRS89"
	| "GRS80"
	| "MGRS"
	| "ED50"
	| "ICRS"
	| "MARS_IAU2000";

export type WeatherCondition =
	| "clear_sunny"
	| "partly_cloudy"
	| "fog_mist_haze"
	| "precipitation"
	| "heavy_rain_flooding"
	| "extreme_thermal" // Combines heatwave/cold snap
	| "snow_blizzard"
	| "thunderstorm_lightning"
	| "atmospheric_plume"; // Combines sandstorm/wildfire smoke

export type CombatEngagementLevel =
	| "peaceful"
	| "low_tension"
	| "contested"
	| "active_combat"
	| "evacuation";

export type EmploymentRegime =
	| "civilian_industrial"
	| "military_operational"
	| "first_responder"
	| "service_animal";

export type ErgonomicModality =
	| "sedentary"
	| "manual_lifting"
	| "heavy_machinery"
	| "tactical_patrol"
	| "flight"
	| "diving";

export type TerrestrialTerrain =
	| "forest"
	| "desert"
	| "mountainous"
	| "tundra"
	| "grassland"
	| "wetland"
	| "cave"
	| "urban"
	| "agricultural";
export type AquaticTerrain =
	| "ocean"
	| "freshwater"
	| "coastal"
	| "submerged_reef";
export type AtmosphericTerrain =
	| "troposphere"
	| "stratosphere"
	| "mesosphere_ionosphere";
export type CelestialSpaceTerrain =
	| "low_earth_orbit"
	| "lunar_surface"
	| "martian_surface"
	| "deep_space";

export type VehicleChassisCategory =
	| "car"
	| "bus"
	| "truck"
	| "motorcycle"
	| "bicycle"
	| "scooter"
	| "wheelchair"
	| "train"
	| "industrial_tractor"
	| "winged_aircraft"
	| "rotary_helicopter"
	| "unmanned_drone"
	| "spacecraft"
	| "surface_vessel"
	| "submersible_submarine"
	| "armored_tactical";

// =====================================================================
// 2. CONTEXT OBJECT INTERFACES
// =====================================================================

export interface BaseEnvironmentContext {
	id: string;
	soapSection: "subjective" | "objective";
	contextType:
		| "geopolitical"
		| "coordinates"
		| "weather"
		| "combat_status"
		| "occupational_activity"
		| "structural_terrain"
		| "vehicle";
	sourceType?: ClinicalSourceType;
	dateRange?: ClinicalDateRange;
}

export interface GeopoliticalLocationContext extends BaseEnvironmentContext {
	contextType: "geopolitical";
	countryCode: string; // Enforces standard ISO 3166-1 Alpha-2
	subdivisionStateCode?: string; // ISO 3166-2 regional token (e.g., 'US-NY')
	postalRoutingCode?: string; // Alphanumeric national mail routing descriptor
	facilityId?: string; // Internal system facility ID string mapping
}

export interface SpatialCoordinateContext extends BaseEnvironmentContext {
	contextType: "coordinates";
	referenceFrame: CoordinateDatum; // Bound directly to your standard datum map
	coordinateAlpha: number; // Latitude / Right Ascension
	coordinateBeta: number; // Longitude / Declination
	coordinateGamma?: number; // Terrestrial Altitude / Deep Space Radial vector
	uncertaintyRadius?: SingleMeasurement;
}

export interface AmbientWeatherContext extends BaseEnvironmentContext {
	contextType: "weather";
	temperature?: SingleMeasurement;
	relativeHumidityPct?: number;
	barometricPressure?: SingleMeasurement;
	airQualityIndexAqi?: number;
	particulateMatter25?: number;
	weatherType: WeatherCondition;
}

export interface CombatStatusContext extends BaseEnvironmentContext {
	contextType: "combat_status";
	engagementLevel: CombatEngagementLevel;
	threatZone?: string;
	description?: string;
}

export interface OccupationalActivityContext extends BaseEnvironmentContext {
	contextType: "occupational_activity";
	employmentRegime: EmploymentRegime;
	ergonomicModality: ErgonomicModality;
	continuousShiftHours?: number;
	metabolicRateMets?: number;
}

// ────────────────────────────────────────────────================─────
// STRUCTURAL TERRAIN DISCRIMINATED UNIONS (Physical Domain Switching)
// ─────────────────────────────────────────────────────────────────────

interface BaseTerrainContext extends BaseEnvironmentContext {
	contextType: "structural_terrain";
	operationalDomain: OperationalDomain;
}

export interface LandTerrainContext extends BaseTerrainContext {
	operationalDomain: "land";
	terrain: TerrestrialTerrain;
	buildingType?:
		| "residential"
		| "office"
		| "school"
		| "industrial"
		| "medical"
		| "military"
		| "fortified"
		| "none";
	elevation?: SingleMeasurement;
}

export interface WaterTerrainContext extends BaseTerrainContext {
	operationalDomain: "water";
	terrain: AquaticTerrain;
	submersionDepth?: SingleMeasurement;
}

export interface AirTerrainContext extends BaseTerrainContext {
	operationalDomain: "air";
	terrain: AtmosphericTerrain;
	elevation?: SingleMeasurement;
}

export interface SpaceTerrainContext extends BaseTerrainContext {
	operationalDomain: "space";
	terrain: CelestialSpaceTerrain;
	orbitalAltitude?: SingleMeasurement;
}

export type StructuralTerrainContext =
	| LandTerrainContext
	| WaterTerrainContext
	| AirTerrainContext
	| SpaceTerrainContext;

// ─────────────────────────────────────────────────────────────────────
// VEHICLE CONTEXT SPECIFICATION
// ─────────────────────────────────────────────────────────────────────

export interface VehicleContext extends BaseEnvironmentContext {
	contextType: "vehicle";
	vehicleCategory: VehicleChassisCategory;
	transportMode: "operator" | "passenger" | "pedestrian";
	controlModality:
		| "human_occupied"
		| "remotely_operated"
		| "autonomous"
		| "semi_autonomous";
	usage: "private" | "commercial" | "government" | "combat";
	isArmored: boolean;
	details?: ProductIdentifier; // Reuses shared builder tracking primitives
}

// =====================================================================
// 3. EXPORTED COHERENT MATRIX TYPES
// =====================================================================

export type EnvironmentContextObject =
	| GeopoliticalLocationContext
	| SpatialCoordinateContext
	| AmbientWeatherContext
	| CombatStatusContext
	| OccupationalActivityContext
	| StructuralTerrainContext
	| VehicleContext;
