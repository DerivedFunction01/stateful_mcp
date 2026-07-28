import type {
	AttributeParserRule,
	FieldMappingRule,
	SchemaParserConfig,
} from "../../store/interfaces";
import { FieldResolverEngine } from "../field-resolver-engine";

function createLabPanelResultFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "panel_name",
			targetField: "panelName",
			conceptDefaultPath: ["panelName"],
		},
		{
			sourceKey: "specimen_type",
			targetField: "specimenType",
			conceptDefaultPath: ["specimenType"],
		},
		{
			sourceKey: "date_range",
			targetField: "collectionTime",
			schemaDefaultField: "dateRange",
			conceptDefaultPath: ["dateRange"],
		},
		{
			sourceKey: "anchorText",
			targetField: "rawTerm",
		},
	];
}

function createDeviceDiagnosticObjectFieldRegistry(
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	return [
		{
			sourceKey: "modality",
			targetField: "modality",
			conceptDefaultPath: ["modality"],
		},
		{
			sourceKey: "interpretation",
			targetField: "interpretation",
		},
		{
			sourceKey: "date_range",
			targetField: "dateRange",
			schemaDefaultField: "dateRange",
			conceptDefaultPath: ["dateRange"],
		},
		{
			sourceKey: "anchorText",
			targetField: "rawTerm",
		},
	];
}

export function createDiagnosticFieldRegistry(
	schema: string,
	_attributeRules: AttributeParserRule[] = [],
): FieldMappingRule[] {
	switch (schema) {
		case "LabPanelResult":
			return createLabPanelResultFieldRegistry(_attributeRules);
		case "DeviceDiagnosticObject":
			return createDeviceDiagnosticObjectFieldRegistry(_attributeRules);
		default:
			return [];
	}
}

export const diagnosticRouter = (
	token: Record<string, any>,
	conceptDefaults: Record<string, any> | null,
	targetSchema: string,
	_profile: any,
	attributeRules?: AttributeParserRule[],
	conceptFields?: Record<string, any>,
	unmatched?: any[],
) => {
	const registry = createDiagnosticFieldRegistry(
		targetSchema,
		attributeRules || [],
	);
	const extractedData = FieldResolverEngine.transform(
		registry,
		token,
		conceptDefaults,
		targetSchema,
		_profile,
	);

	if (unmatched && unmatched.length > 0) {
		switch (targetSchema) {
			case "LabPanelResult":
				if (
					!conceptFields?.panelName &&
					!extractedData.panelName &&
					unmatched.length > 0
				) {
					extractedData.panelName = unmatched[0];
				}
				break;
			case "DeviceDiagnosticObject":
				if (
					!conceptFields?.modality &&
					!extractedData.modality &&
					unmatched.length > 0
				) {
					extractedData.modality = unmatched[0];
				}
				break;
		}
	}

	return extractedData;
};

export const labPanelResultConfig: SchemaParserConfig = {
	schema: "LabPanelResult",
	targetSchema: "LabPanelResult",
	preparsedContextKeys: [],
};

export const deviceDiagnosticObjectConfig: SchemaParserConfig = {
	schema: "DeviceDiagnosticObject",
	targetSchema: "DeviceDiagnosticObject",
	preparsedContextKeys: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

import type { FieldRegistryTestBlock } from "./test-types";

export const labPanelResultRegistryTests: FieldRegistryTestBlock = {
	schema: "LabPanelResult",
	router: diagnosticRouter,
	cases: [
		{
			description: "panelName: first unmatched becomes panelName",
			input: {
				unmatched: [
					{ conceptId: "LOINC::24320-4", display: "Basic Metabolic Panel" },
				],
			},
			matchKeys: ["panelName"],
			expected: {
				panelName: {
					conceptId: "LOINC::24320-4",
					display: "Basic Metabolic Panel",
				},
			},
		},
		{
			description: "specimenType: from slot directly",
			input: {
				slots: {
					specimen_type: {
						conceptId: "SNOMED::119303003",
						display: "Venous blood",
					},
				},
			},
			matchKeys: ["specimenType"],
			expected: {
				specimenType: {
					conceptId: "SNOMED::119303003",
					display: "Venous blood",
				},
			},
		},
	],
};

export const deviceDiagnosticObjectRegistryTests: FieldRegistryTestBlock = {
	schema: "DeviceDiagnosticObject",
	router: diagnosticRouter,
	cases: [
		{
			description: "modality: first unmatched becomes modality",
			input: {
				unmatched: [{ conceptId: "LOINC::18724-0", display: "CT Abdomen" }],
			},
			matchKeys: ["modality"],
			expected: {
				modality: {
					conceptId: "LOINC::18724-0",
					display: "CT Abdomen",
				},
			},
		},
		{
			description: "interpretation: from slot directly",
			input: {
				slots: { interpretation: "No acute findings" },
			},
			matchKeys: ["interpretation"],
			expected: { interpretation: "No acute findings" },
		},
	],
};
