import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

export function createEnvironmentFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "context_type",
			targetField: "contextType",
			schemaDefaultField: "contextType",
			conceptDefaultPath: ["contextType"],
		},
		{
			sourceKey: "source_type",
			targetField: "sourceType",
			schemaDefaultField: "sourceType",
			conceptDefaultPath: ["sourceType"],
		},
		{
			sourceKey: "date_range",
			targetField: "dateRange",
			schemaDefaultField: "dateRange",
			conceptDefaultPath: ["dateRange"],
		},
		// GeopoliticalLocationContext
		{
			sourceKey: "country_code",
			targetField: "countryCode",
			schemaDefaultField: "countryCode",
			conceptDefaultPath: ["countryCode"],
		},
		{
			sourceKey: "subdivision_state_code",
			targetField: "subdivisionStateCode",
			schemaDefaultField: "subdivisionStateCode",
			conceptDefaultPath: ["subdivisionStateCode"],
		},
		{
			sourceKey: "postal_routing_code",
			targetField: "postalRoutingCode",
			schemaDefaultField: "postalRoutingCode",
			conceptDefaultPath: ["postalRoutingCode"],
		},
		{
			sourceKey: "facility_id",
			targetField: "facilityId",
			schemaDefaultField: "facilityId",
			conceptDefaultPath: ["facilityId"],
		},
		// SpatialCoordinateContext
		{
			sourceKey: "reference_frame",
			targetField: "referenceFrame",
			schemaDefaultField: "referenceFrame",
			conceptDefaultPath: ["referenceFrame"],
		},
		{
			sourceKey: "coordinate_alpha",
			targetField: "coordinateAlpha",
		},
		{
			sourceKey: "coordinate_beta",
			targetField: "coordinateBeta",
		},
		{
			sourceKey: "coordinate_gamma",
			targetField: "coordinateGamma",
		},
		{
			sourceKey: "uncertainty_radius",
			targetField: "uncertaintyRadius",
			conceptDefaultPath: ["uncertaintyRadius"],
		},
		// AmbientWeatherContext
		{
			sourceKey: "temperature",
			targetField: "temperature",
			conceptDefaultPath: ["temperature"],
		},
		{
			sourceKey: "relative_humidity_pct",
			targetField: "relativeHumidityPct",
		},
		{
			sourceKey: "barometric_pressure",
			targetField: "barometricPressure",
			conceptDefaultPath: ["barometricPressure"],
		},
		{
			sourceKey: "weather_type",
			targetField: "weatherType",
			conceptDefaultPath: ["weatherType"],
		},
		// CombatStatusContext
		{
			sourceKey: "engagement_level",
			targetField: "engagementLevel",
			conceptDefaultPath: ["engagementLevel"],
		},
		{
			sourceKey: "threat_zone",
			targetField: "threatZone",
		},
		{
			sourceKey: "description",
			targetField: "description",
		},
		// OccupationalActivityContext
		{
			sourceKey: "employment_regime",
			targetField: "employmentRegime",
			conceptDefaultPath: ["employmentRegime"],
		},
		{
			sourceKey: "ergonomic_modality",
			targetField: "ergonomicModality",
			conceptDefaultPath: ["ergonomicModality"],
		},
		{
			sourceKey: "continuous_shift_hours",
			targetField: "continuousShiftHours",
		},
		{
			sourceKey: "metabolic_rate_mets",
			targetField: "metabolicRateMets",
		},
		// StructuralTerrainContext (domain-agnostic keys)
		{
			sourceKey: "operational_domain",
			targetField: "operationalDomain",
			conceptDefaultPath: ["operationalDomain"],
		},
		{
			sourceKey: "terrain",
			targetField: "terrain",
			conceptDefaultPath: ["terrain"],
		},
		{
			sourceKey: "building_type",
			targetField: "buildingType",
			schemaDefaultField: "buildingType",
			conceptDefaultPath: ["buildingType"],
		},
		{
			sourceKey: "elevation",
			targetField: "elevation",
			conceptDefaultPath: ["elevation"],
		},
		{
			sourceKey: "submersion_depth",
			targetField: "submersionDepth",
			conceptDefaultPath: ["submersionDepth"],
		},
		{
			sourceKey: "orbital_altitude",
			targetField: "orbitalAltitude",
			conceptDefaultPath: ["orbitalAltitude"],
		},
		// VehicleContext
		{
			sourceKey: "vehicle_category",
			targetField: "vehicleCategory",
			conceptDefaultPath: ["vehicleCategory"],
		},
		{
			sourceKey: "transport_mode",
			targetField: "transportMode",
			schemaDefaultField: "transportMode",
			conceptDefaultPath: ["transportMode"],
		},
		{
			sourceKey: "control_modality",
			targetField: "controlModality",
			conceptDefaultPath: ["controlModality"],
		},
		{
			sourceKey: "usage",
			targetField: "usage",
			schemaDefaultField: "usage",
			conceptDefaultPath: ["usage"],
		},
		{
			sourceKey: "is_armored",
			targetField: "isArmored",
			valueMap: { true: true, false: false },
		},
	];
}

export const environmentRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	_profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const registry = createEnvironmentFieldRegistry(attributeRules || []);
	const extractedData = FieldResolverEngine.transform(
		registry,
		token,
		conceptDefaults,
		targetSchema,
		_profile,
	);

	if (unmatched && unmatched.length > 0) {
		if (!conceptFields?.contextType && !extractedData.contextType) {
			extractedData.contextType = unmatched[0];
		}
	}

	return extractedData;
};

export const environmentConfig: SchemaParserConfig = {
	schema: "EnvironmentContextObject",
	targetSchema: "EnvironmentContextObject",
	preparsedContextKeys: [],
};

// ── Tests ─────────────────────────────────────────────────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const environmentRegistryTests: FieldRegistryTestBlock = {
	schema: "EnvironmentContextObject",
	router: environmentRouter,
	cases: [
		{
			description: "contextType: from slot directly",
			input: {
				slots: {
					context_type: {
						conceptId: "ENV::weather",
						display: "Weather",
					},
				},
			},
			matchKeys: ["contextType"],
			expected: {
				contextType: {
					conceptId: "ENV::weather",
					display: "Weather",
				},
			},
		},
		{
			description: "unmatched: first concept becomes contextType fallback",
			input: {
				unmatched: [{ conceptId: "ENV::weather", display: "Weather" }],
			},
			matchKeys: ["contextType"],
			expected: {
				contextType: {
					conceptId: "ENV::weather",
					display: "Weather",
				},
			},
		},
		{
			description: "countryCode: from slot directly",
			input: {
				slots: { country_code: "US" },
			},
			matchKeys: ["countryCode"],
			expected: { countryCode: "US" },
		},
	],
};
