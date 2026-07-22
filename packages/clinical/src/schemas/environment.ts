import type {
  ClinicalDateRange,
  ClinicalSourceType,
  CodeableConcept,
  ProductIdentifier,
  SingleMeasurement,
} from "./shared";

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
  countryCode: string;
  subdivisionStateCode?: string;
  postalRoutingCode?: string;
  facilityId?: string;
}

export interface SpatialCoordinateContext extends BaseEnvironmentContext {
  contextType: "coordinates";
  referenceFrame?: string;
  coordinateAlpha: number;
  coordinateBeta: number;
  coordinateGamma?: number;
  uncertaintyRadius?: SingleMeasurement;
}

export interface AmbientWeatherContext extends BaseEnvironmentContext {
  contextType: "weather";
  temperature?: SingleMeasurement;
  relativeHumidityPct?: number;
  barometricPressure?: SingleMeasurement;
  airQualityIndexAqi?: number;
  particulateMatter25?: number;
  weatherType:
    | "clear_sunny"
    | "partly_cloudy"
    | "fog_mist_haze"
    | "rain"
    | "heavy_rain_flooding"
    | "freezing_rain_ice"
    | "heatwave"
    | "extreme_cold_snap"
    | "snow"
    | "blizzard_heavy_snow"
    | "thunderstorm_lightning"
    | "wildfire_smoke_plume"
    | "sandstorm_dust_storm"
    | "other";
}

export interface CombatStatusContext extends BaseEnvironmentContext {
  contextType: "combat_status";
  engagementLevel:
    | "peaceful_non_combat"
    | "low_tension"
    | "contested"
    | "active_combat"
    | "evacuation_in_progress";
  threatZone?: string;
  description?: string;
}

export interface OccupationalActivityContext extends BaseEnvironmentContext {
  contextType: "occupational_activity";
  employmentRegime:
    | "civilian_industrial"
    | "military_operational"
    | "first_responder_tactical"
    | "service_animal";
  ergonomicModality:
    | "sedentary_desk"
    | "manual_lifting"
    | "heavy_machinery"
    | "dismounted_patrol"
    | "aerial_flight"
    | "maritime_diving";
  continuousShiftHours?: number;
  metabolicRateMets?: number;
}

export type OperationalDomain = "land" | "water" | "air" | "space";

export interface StructuralTerrainContext extends BaseEnvironmentContext {
  contextType: "structural_terrain";
  operationalDomain: OperationalDomain;
  buildingType?:
    | "residential"
    | "office"
    | "industrial"
    | "medical_facility"
    | "military_facility"
    | "fortified_facility"
    | "none";
  terrainType?: CodeableConcept;
  terrainTypeCategory?:
    | "forest"
    | "desert"
    | "mountainous"
    | "tundra"
    | "grassland"
    | "wetland"
    | "cave"
    | "urban"
    | "agricultural"
    | "ocean"
    | "freshwater"
    | "coastal"
    | "submerged_reef"
    | "troposphere_low_altitude"
    | "high_altitude_air"
    | "stratosphere"
    | "low_earth_orbit"
    | "lunar_surface"
    | "martian_surface"
    | "deep_space_barycentric";
  elevation?: SingleMeasurement;
  submersionDepth?: SingleMeasurement;
  orbitalAltitude?: SingleMeasurement;
}

export interface VehicleContext extends BaseEnvironmentContext {
  contextType: "vehicle";
  vehicleType?: CodeableConcept;
  vehicleTypeCategory?:
    | "car"
    | "pickup_truck"
    | "truck"
    | "bus"
    | "motorcycle"
    | "bicycle"
    | "scooter"
    | "wheelchair"
    | "forklift"
    | "tractor"
    | "plane_winged_aircraft"
    | "helicopter_rotarycraft"
    | "drone"
    | "spacecraft"
    | "surface_boat"
    | "submarine"
    | "tracked_combat_vehicle"
    | "wheeled_tactical_vehicle"
    | "heavy_industrial_machinery"
    | "exoskeleton"
    | "other";
  transportMode: "operator" | "passenger" | "bystander_pedestrian";
  modality?:
    | "human_occupied"
    | "remotely_operated"
    | "autonomous"
    | "semi_autonomous";
  usage?: "private" | "commercial" | "government" | "combat";
  isArmored?: boolean;
  details?: ProductIdentifier;
}

export type EnvironmentContextObject =
  | GeopoliticalLocationContext
  | SpatialCoordinateContext
  | AmbientWeatherContext
  | CombatStatusContext
  | OccupationalActivityContext
  | StructuralTerrainContext
  | VehicleContext;

export const COORDINATE_DATUM = {
  WGS84: "WGS-84",
  NAD83: "NAD-83",
  ETRS89: "ETRS-89",
  GRS80: "GRS-80",
  MGRS: "MGRS",
  ED50: "ED-50",
} as const;

export type CoordinateDatum =
  (typeof COORDINATE_DATUM)[keyof typeof COORDINATE_DATUM];

export const WEATHER_TYPE_LABELS: Record<
  AmbientWeatherContext["weatherType"],
  string
> = {
  clear_sunny: "Clear / Sunny",
  partly_cloudy: "Partly Cloudy",
  fog_mist_haze: "Fog / Mist / Haze",
  rain: "Rain",
  heavy_rain_flooding: "Heavy Rain / Flooding",
  freezing_rain_ice: "Freezing Rain / Ice",
  heatwave: "Heatwave",
  extreme_cold_snap: "Extreme Cold Snap",
  snow: "Snow",
  blizzard_heavy_snow: "Blizzard / Heavy Snow",
  thunderstorm_lightning: "Thunderstorm / Lightning",
  wildfire_smoke_plume: "Wildfire Smoke Plume",
  sandstorm_dust_storm: "Sandstorm / Dust Storm",
  other: "Other",
};
