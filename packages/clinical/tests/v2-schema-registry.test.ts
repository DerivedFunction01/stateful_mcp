import { describe, expect, it } from "bun:test";
import { CLINICAL_SOURCE_TYPES } from "../src/schemas/shared";
import { defineSchema } from "../src/v2/schemas/schema-factory";
import { validateSchemaDefaults } from "../src/v2/schemas/schema-defaults";
import { validateTargetPath } from "../src/v2/schemas/schema-path-validator";
import { SchemaRegistry, fingerprintSchema } from "../src/v2/schemas/schema-registry";
import { observationSchema } from "../src/v2/schemas/definitions";

const observation = defineSchema({
	schema: "Observation",
	version: 1,
	status: "published",
	fields: {
		concept: {
			path: "concept",
			valueKind: "concept",
			cardinality: "one",
			required: true,
			conceptResolution: { required: true, allowedNamespaces: ["SNOMED"] },
		},
		sourceType: {
			path: "sourceType",
			valueKind: "enum",
			cardinality: "one",
			required: true,
			enumValues: CLINICAL_SOURCE_TYPES,
		},
		"anatomyLocations[].anatomy": {
			path: "anatomyLocations[].anatomy",
			valueKind: "concept",
			cardinality: "one",
			required: true,
		},
		severity: {
			path: "severity",
			valueKind: "composite",
			cardinality: "one",
			required: true,
		},
	},
});

describe("V2 schema registry", () => {
	it("registers published versions and resolves the newest published version", () => {
		const registry = new SchemaRegistry();
		const registered = registry.register(observation);

		expect(registry.get("Observation")).toEqual(registered);
		expect(registry.get("Observation", 1)?.fingerprint.algorithm).toBe(
			"v2-schema-fingerprint-v1",
		);
		expect(registry.getField("Observation", "sourceType")?.enumValues).toEqual(
			CLINICAL_SOURCE_TYPES,
		);
	});

	it("describes observation duration as an ordered measurement collection", () => {
		const registry = new SchemaRegistry();
		registry.register(observationSchema);
		const duration = registry.getField("Observation", "duration");

		expect(duration).toMatchObject({
			valueKind: "measurement",
			cardinality: "many",
		});
		expect(duration?.measurement?.dimension).toBe("time");
		expect(duration?.measurement?.operators).toContain("gte");
		expect(duration?.measurement?.statisticalTypes).toContain("mean");
	});

	it("keeps fingerprints deterministic despite object key order", () => {
		const reordered = defineSchema({
			...observation,
			fields: {
				severity: observation.fields.severity,
				concept: observation.fields.concept,
				sourceType: observation.fields.sourceType,
				"anatomyLocations[].anatomy": observation.fields["anatomyLocations[].anatomy"]!,
			},
		});

		expect(fingerprintSchema(observation)).toEqual(fingerprintSchema(reordered));
	});

	it("validates indexed paths against wildcard schema paths", () => {
		const registry = new SchemaRegistry();
		registry.register(observation);

		expect(validateTargetPath(registry, "Observation", "anatomyLocations[0].anatomy")).toMatchObject({
			valid: true,
			path: "anatomyLocations[].anatomy",
		});
		expect(validateTargetPath(registry, "Observation", "unknown").code).toBe(
			"path_not_found",
		);
	});

	it("validates typed defaults against field metadata", () => {
		const registry = new SchemaRegistry();
		registry.register(observation);

		expect(validateSchemaDefaults(registry, {
			schema: "Observation",
			values: [{
				path: "sourceType",
				value: { kind: "enum", value: "patient_reported" },
			}],
		})).toEqual([]);
		expect(validateSchemaDefaults(registry, {
			schema: "Observation",
			values: [{
				path: "sourceType",
				value: { kind: "scalar", scalarType: "string", value: "patient_reported" },
			}],
		})[0]?.message).toContain("incompatible");
	});
});
