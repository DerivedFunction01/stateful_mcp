import type { BaseAgent, CodeableConcept } from "./shared";
import type { TemporalBoundary } from "./time";
export type AdministrativeGender =
	| "male"
	| "female"
	| "undetermined"
	| "not_applicable";

export type SubjectLifecycleStatus =
	| "active"
	| "deceased"
	| "inactive_archived";

export interface LegalName {
	givenNames?: string[];
	primaryOrSurname: string; // The baseline index key
	prefixOrTitle?: string;
}
export interface HumanSubjectAttributes {
	race?: CodeableConcept; // Unified CDC/OMB or global standard concepts
	ethnicity?: CodeableConcept; // Unified standard concepts
}
export interface NonHumanSubjectAttributes {
	species?: CodeableConcept; // Primary organism taxonomy standard (e.g., Plant or Insect ID)
	breedOrCultivar?: CodeableConcept;
}
export interface PlantSubjectAttributes extends NonHumanSubjectAttributes {
	propagationMethod:
		| "seed_sexual"
		| "vegetative_clone"
		| "tissue_culture"
		| "grafting"
		| "unknown";
	geneticModificationStatus:
		| "wild_type"
		| "selectively_bred"
		| "gmo"
		| "crispr_edited";
	cultivationEnvironment:
		| "open_field"
		| "greenhouse"
		| "hydroponic"
		| "aeroponic"
		| "wild";
}

// Discriminator payload pattern to isolate primary species attributes
export type SubjectBiologicalAttributes =
	| ({ organismType: "human" } & HumanSubjectAttributes)
	| ({ organismType: "animal" } & NonHumanSubjectAttributes)
	| ({ organismType: "plant" } & PlantSubjectAttributes);

export interface PatientProfile {
	/**
	 * Primary Identification Keys
	 */
	id: string; // The deterministic system-wide tracking ID / hash
	mrn: string; // Medical Record Number (Internal Facility Index)

	/**
	 * core Identity Metrics
	 */
	name: LegalName;
	administrativeGender: AdministrativeGender;
	status: SubjectLifecycleStatus;

	/**
	 * Bounded Origination Matrix
	 * Reuses your TemporalBoundary to capture precise or estimated birth/germination windows
	 */
	originationDate: TemporalBoundary;
	isOriginationEstimated: boolean;

	/**
	 * Immutable Biological Attributes
	 * Uses a type-safe union to switch fields seamlessly between human, animal, and plant profiles
	 */
	biologicalProfile: BaseAgent & SubjectBiologicalAttributes;

	/**
	 * Clinical Safety Lanes
	 */
	allergies?: CodeableConcept[]; // Explicit clinical allergy concept nodes
}

export interface PatientLearningBucket {
	patientId: string;
	organismType: "human" | "animal" | "plant" | string;
	gender?: AdministrativeGender;
	ageBucket: string;
	speciesBucket?: string;
	subBucket: number;
	bucketKey: string;
	weights: {
		exact: number;
		biology: number;
		specific: number;
		global: number;
	};
}

function getYearBucket(years: number): string {
	if (years < 1) return "0";
	if (years < 5) return "1-4";
	if (years < 12) return "5-11";
	if (years < 18) return "12-17";
	if (years < 30) return "18-29";
	if (years < 40) return "30-39";
	if (years < 50) return "40-49";
	if (years < 60) return "50-59";
	if (years < 70) return "60-69";
	if (years < 80) return "70-79";
	return "80+";
}

function stableHash(text: string): number {
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		hash = (hash * 31 + text.charCodeAt(i)) | 0;
	}
	return Math.abs(hash);
}

function normalizeWeights(
	weights: Record<"exact" | "biology" | "specific" | "global", number>,
	maxWeight = 0.8,
): PatientLearningBucket["weights"] {
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
	if (total <= 0) {
		return {
			exact: 0.25,
			biology: 0.25,
			specific: 0.25,
			global: 0.25,
		};
	}

	const normalized = Object.fromEntries(
		Object.entries(weights).map(([key, value]) => [key, value / total]),
	) as PatientLearningBucket["weights"];

	const cappedEntries = Object.entries(normalized).map(([key, value]) => [
		key,
		Math.min(value, maxWeight),
	]);
	let cappedTotal = cappedEntries.reduce(
		(sum, [, value]) => sum + (value as number),
		0,
	);

	if (cappedTotal <= 0) {
		return {
			exact: 0.25,
			biology: 0.25,
			specific: 0.25,
			global: 0.25,
		};
	}

	const adjusted = Object.fromEntries(
		cappedEntries.map(([key, value]) => [key, (value as number) / cappedTotal]),
	) as PatientLearningBucket["weights"];

	const maxEntry = Object.entries(adjusted).reduce(
		(best, entry) => (entry[1] > best[1] ? entry : best),
		["exact", adjusted.exact] as [string, number],
	);
	if (maxEntry[1] > maxWeight + 1e-9) {
		return normalizeWeights(
			{
				exact: adjusted.exact,
				biology: adjusted.biology,
				specific: adjusted.specific,
				global: adjusted.global,
			},
			maxWeight,
		);
	}

	cappedTotal = Object.values(adjusted).reduce((sum, value) => sum + value, 0);
	if (Math.abs(cappedTotal - 1) > 1e-9) {
		const scale = 1 / cappedTotal;
		return {
			exact: adjusted.exact * scale,
			biology: adjusted.biology * scale,
			specific: adjusted.specific * scale,
			global: adjusted.global * scale,
		};
	}

	return adjusted;
}

export function buildPatientLearningBucket(
	patient: PatientProfile,
	subBuckets = 4,
	maxTierWeight = 0.8,
	now = new Date(),
): PatientLearningBucket {
	const organismType = patient.biologicalProfile.organismType;
	const years = Math.max(
		0,
		Math.floor(
			(now.getTime() -
				Date.parse(patient.originationDate.assertedTimestampUtc)) /
				31_557_600_000,
		),
	);
	const ageBucket = getYearBucket(years);
	const species =
		"species" in patient.biologicalProfile &&
		patient.biologicalProfile.species?.display
			? patient.biologicalProfile.species.display
			: undefined;
	const gender =
		organismType === "human" ? patient.administrativeGender : undefined;
	const speciesBucket =
		organismType === "human" ? undefined : species || organismType;
	const basis = [
		patient.id,
		organismType,
		gender || "",
		speciesBucket || "",
		ageBucket,
	].join("|");
	const bucketCount = Math.max(1, subBuckets);
	const subBucket = stableHash(basis) % bucketCount;
	const bucketKey = [
		patient.id,
		organismType,
		gender || "",
		speciesBucket || "",
		ageBucket,
		String(subBucket),
	].join("|");
	const weights = normalizeWeights(
		{
			exact: 0.4,
			biology: 0.3,
			specific: 0.2,
			global: 0.1,
		},
		maxTierWeight,
	);
	return {
		patientId: patient.id,
		organismType,
		gender,
		ageBucket,
		speciesBucket,
		subBucket,
		bucketKey,
		weights,
	};
}
