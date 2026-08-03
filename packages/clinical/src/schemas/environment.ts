import type {
	DistanceMeasurement,
	PressureMeasurement,
	TemperatureMeasurement,
} from "./measurement";
import type {
	ClinicalSourceType,
	ProductIdentifier,
} from "./shared";
import type { ClinicalDateRange } from "./time";

// =====================================================================
// 1. HARD COMPILER ENUMS BOUNDED BY PHYSICS & STANDARDS
// =====================================================================

export const OPERATIONAL_DOMAINS = [
	"land",
	"water",
	"air",
	"space",
] as const;

export type OperationalDomain = (typeof OPERATIONAL_DOMAINS)[number];

export const COORDINATE_DATUMS = [
	"WGS84",
	"NAD83",
	"ETRS89",
	"GRS80",
	"MGRS",
	"ED50",
	"ICRS",
	"MARS_IAU2000",
] as const;

export type CoordinateDatum = (typeof COORDINATE_DATUMS)[number];

export const WEATHER_CONDITIONS = [
	"clear_sunny",
	"partly_cloudy",
	"fog_mist_haze",
	"precipitation",
	"heavy_rain_flooding",
	"extreme_thermal",
	"snow_blizzard",
	"thunderstorm_lightning",
	"atmospheric_plume",
] as const;

export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export const COMBAT_ENGAGEMENT_LEVELS = [
	"peaceful",
	"low_tension",
	"contested",
	"active_combat",
	"evacuation",
] as const;

export type CombatEngagementLevel =
	(typeof COMBAT_ENGAGEMENT_LEVELS)[number];

export const EMPLOYMENT_REGIMES = [
	"civilian_industrial",
	"military_operational",
	"first_responder",
	"service_animal",
] as const;

export type EmploymentRegime = (typeof EMPLOYMENT_REGIMES)[number];

export const ERGONOMIC_MODALITIES = [
	"sedentary",
	"manual_lifting",
	"heavy_machinery",
	"tactical_patrol",
	"flight",
	"diving",
] as const;

export type ErgonomicModality = (typeof ERGONOMIC_MODALITIES)[number];

export const TERRESTRIAL_TERRAINS = [
	"forest",
	"desert",
	"mountainous",
	"tundra",
	"grassland",
	"wetland",
	"cave",
	"urban",
	"agricultural",
] as const;

export type TerrestrialTerrain = (typeof TERRESTRIAL_TERRAINS)[number];

export const AQUATIC_TERRAINS = [
	"ocean",
	"freshwater",
	"coastal",
	"submerged_reef",
] as const;

export type AquaticTerrain = (typeof AQUATIC_TERRAINS)[number];

export const ATMOSPHERIC_TERRAINS = [
	"troposphere",
	"stratosphere",
	"mesosphere_ionosphere",
] as const;

export type AtmosphericTerrain = (typeof ATMOSPHERIC_TERRAINS)[number];

export const CELESTIAL_SPACE_TERRAINS = [
	"low_earth_orbit",
	"lunar_surface",
	"martian_surface",
	"deep_space",
] as const;

export type CelestialSpaceTerrain =
	(typeof CELESTIAL_SPACE_TERRAINS)[number];

export const VEHICLE_CHASSIS_CATEGORIES = [
	"car",
	"bus",
	"truck",
	"motorcycle",
	"bicycle",
	"scooter",
	"wheelchair",
	"train",
	"industrial_tractor",
	"winged_aircraft",
	"rotary_helicopter",
	"unmanned_drone",
	"spacecraft",
	"surface_vessel",
	"submersible_submarine",
	"armored_tactical",
] as const;

export type VehicleChassisCategory =
	(typeof VEHICLE_CHASSIS_CATEGORIES)[number];

// =====================================================================
// 2. CONTEXT OBJECT INTERFACES
// =====================================================================

export const CONTEXT_TYPES = [
	"geopolitical",
	"coordinates",
	"weather",
	"combat_status",
	"occupational_activity",
	"structural_terrain",
	"vehicle",
] as const;

export type ContextType = (typeof CONTEXT_TYPES)[number];

export interface BaseEnvironmentContext {
	id: string;
	soapSection: "subjective" | "objective";
	contextType: ContextType;
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
	uncertaintyRadius?: DistanceMeasurement;
}

export interface AmbientWeatherContext extends BaseEnvironmentContext {
	contextType: "weather";
	temperature?: TemperatureMeasurement;
	relativeHumidityPct?: number;
	barometricPressure?: PressureMeasurement;
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

export const BUILDING_TYPES = [
	"residential",
	"office",
	"school",
	"industrial",
	"medical",
	"military",
	"fortified",
	"none",
] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

export interface LandTerrainContext extends BaseTerrainContext {
	operationalDomain: "land";
	terrain: TerrestrialTerrain;
	buildingType?: BuildingType;
	elevation?: DistanceMeasurement;
}

export interface WaterTerrainContext extends BaseTerrainContext {
	operationalDomain: "water";
	terrain: AquaticTerrain;
	submersionDepth?: DistanceMeasurement;
}

export interface AirTerrainContext extends BaseTerrainContext {
	operationalDomain: "air";
	terrain: AtmosphericTerrain;
	elevation?: DistanceMeasurement;
}

export interface SpaceTerrainContext extends BaseTerrainContext {
	operationalDomain: "space";
	terrain: CelestialSpaceTerrain;
	orbitalAltitude?: DistanceMeasurement;
}

export type StructuralTerrainContext =
	| LandTerrainContext
	| WaterTerrainContext
	| AirTerrainContext
	| SpaceTerrainContext;

// ─────────────────────────────────────────────────────────────────────
// VEHICLE CONTEXT SPECIFICATION
// ─────────────────────────────────────────────────────────────────────

export const TRANSPORT_MODES = [
	"operator",
	"passenger",
	"pedestrian",
] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const CONTROL_MODALITIES = [
	"human_occupied",
	"remotely_operated",
	"autonomous",
	"semi_autonomous",
] as const;

export type ControlModality = (typeof CONTROL_MODALITIES)[number];

export const VEHICLE_USAGES = [
	"private",
	"commercial",
	"government",
	"combat",
] as const;

export type VehicleUsage = (typeof VEHICLE_USAGES)[number];

export interface VehicleContext extends BaseEnvironmentContext {
	contextType: "vehicle";
	vehicleCategory: VehicleChassisCategory;
	transportMode: TransportMode;
	controlModality: ControlModality;
	usage: VehicleUsage;
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