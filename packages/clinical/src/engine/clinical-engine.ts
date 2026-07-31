import type {
	DictionaryStore,
	EvaluatorStore,
	EventStore,
	ObjectStore,
} from "@stateful-mcp/core";
import { CdslParser } from "../parser/cdsl-parser";
import { TimeHelper } from "../parser/helpers/measurement-helper";
import type { ParsedItem } from "../parser/schema-parsers";
import { ProseRenderer } from "../renderer/prose-renderer";
import type { SoapNote } from "../schemas/document";
import {
	buildPatientLearningBucket,
	type PatientProfile,
} from "../schemas/patient";
import type {
	CalibrationStore,
	ConceptFieldStore,
	ParserProfileStore,
	ParserSyntaxProfile,
	SignedSoapNoteRecord,
	SignedSoapNoteStore,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import type {
	AutocompleteTransitionStore,
	ParsedCellHistoryStore,
	ParsedCellRecord,
	ParsedCellStore,
} from "../store/learning/interfaces";
import {
	MAX_ORDERED_TOKENS,
	type OrderedLearningHistoryKey,
	type OrderedLearningStore,
	type OrderedLearningToken,
	scoreRecency,
} from "../store/learning/interfaces";
import { OrderedLearningRanker } from "../store/learning/ordered_learning/ordered-learning-ranking";
import type { OrderedLearningRankedCandidate } from "../store/learning/ordered_learning/ordered-learning-ranking-types";
import { getTransformForSchema } from "../store/learning/parsed_cell/parsed-cell-record-transform";
import type { ClinicalProseTemplateStore } from "../store/reference/prose-templates/interfaces";

// ── Order-Aware Projection ───────────────────────────────────────────────────

export interface OrderAwareProjection {
	storeId: string;
	rankedCandidate: OrderedLearningRankedCandidate | null;
}

/**
 * Builds an ordered token sequence from any parsed item.
 * Produces tokens for tag, concept, and each scalar field in extractedData.
 */
export function buildOrderedTokens(
	item: ParsedItem,
	startIndex: number = 0,
): OrderedLearningToken[] {
	const tokens: OrderedLearningToken[] = [];
	let idx = startIndex;

	// tag
	tokens.push({ kind: "tag", key: item.tag, index: idx++ });

	// concept
	if (item.concept[0]?.conceptId) {
		tokens.push({
			kind: "concept",
			key: item.concept[0].conceptId,
			value: item.concept[0].display,
			index: idx++,
		});
	}

	// all scalar fields present in extractedData
	const extracted = item.extractedData ?? {};
	for (const key of Object.keys(extracted)) {
		const val = extracted[key];
		if (val !== undefined && val !== null && typeof val !== "object") {
			tokens.push({
				kind: "field",
				key,
				value: String(val),
				index: idx++,
			});
		}
	}

	return tokens.slice(0, MAX_ORDERED_TOKENS);
}

// ── Helper functions for dynamic schema mapping ─────────────────────────────────

function createEmptyShapeFromTemplate(templateObj: any): any {
	if (templateObj === null || templateObj === undefined) return undefined;
	if (Array.isArray(templateObj)) return [];
	if (typeof templateObj === "object") {
		const empty: any = {};
		for (const key of Object.keys(templateObj)) {
			const val = templateObj[key];
			if (typeof val === "object" && val !== null) {
				empty[key] = createEmptyShapeFromTemplate(val);
			} else {
				empty[key] = undefined;
			}
		}
		return empty;
	}
	return undefined;
}

function fillDefaults(obj: any, defaults: any): any {
	if (obj === null || obj === undefined) return defaults;
	if (typeof obj !== "object" || Array.isArray(obj)) return obj;
	const result = { ...obj };
	for (const key of Object.keys(defaults)) {
		if (result[key] === undefined || result[key] === null) {
			result[key] = defaults[key];
		} else if (
			typeof result[key] === "object" &&
			typeof defaults[key] === "object" &&
			defaults[key] !== null
		) {
			result[key] = fillDefaults(result[key], defaults[key]);
		}
	}
	return result;
}

const SOAP_ROUTING_CONFIGS: Record<
	string,
	{
		idPrefix: string;
		getPath: (item: ParsedItem) => string[];
		mapFields: (item: ParsedItem) => Record<string, any>;
		defaultFallbacks?: Record<string, any>;
		isCollection?: boolean;
	}
> = {
	vitalsmeasurementevent: {
		idPrefix: "vit",
		getPath: () => ["objective", "vitalSigns"],
		mapFields: (item) => {
			const concept = item.concept[0];
			const vitItem = item;
			return {
				vitalType: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: vitItem.rawText ?? "",
				measurement: {
					magnitude: Number(vitItem.extractedData?.measurement?.magnitude || 0),
					unit: {
						display: vitItem.extractedData?.measurement?.unit?.display || "",
					},
				},
			};
		},
	},
	observationevent: {
		idPrefix: "obs",
		getPath: (item) =>
			item.extractedData?.certainty === "refuted"
				? ["subjective", "historyOfPresentIllness", "events"]
				: ["objective", "clinicalObservations"],
		defaultFallbacks: {
			severity: { score: 0, maxScore: 0, normalizedScore: 0 },
			duration: { magnitude: 1 },
			trajectory: "stable",
		},
		mapFields: (item) => {
			const concept = item.concept[0];
			const isNegated = item.extractedData?.certainty === "refuted";
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
				sourceType: isNegated ? "patient_reported" : "clinician_observed",
			};
		},
	},
	medicationorderobject: {
		idPrefix: "med",
		getPath: () => ["plan", "prescriptions"],
		mapFields: (item) => {
			const concept = item.concept[0];
			const medItem = item;
			return {
				medication: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				route: medItem.extractedData?.route,
				frequency: medItem.extractedData?.frequency,
			};
		},
	},
	primarydiagnosisentry: {
		idPrefix: "dx",
		getPath: () => ["assessment", "primaryDiagnosis"],
		isCollection: false,
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	differentialdiagnosisentry: {
		idPrefix: "diff",
		getPath: () => ["assessment", "differentialDiagnoses"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	algorithmicevaluationobject: {
		idPrefix: "alg",
		getPath: () => ["assessment", "algorithmicEvaluations"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	allergyentry: {
		idPrefix: "all",
		getPath: () => ["subjective", "patientHistories", "allergies"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	socialhistoryentry: {
		idPrefix: "soc",
		getPath: () => ["subjective", "patientHistories", "socialHistory"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	reportedmedicationentry: {
		idPrefix: "histmed",
		getPath: () => ["subjective", "patientHistories", "currentMedications"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				medication: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	exposureevent: {
		idPrefix: "exp",
		getPath: () => ["subjective", "exposures"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				agent: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	mechanicalinjuryobject: {
		idPrefix: "inj",
		getPath: () => ["subjective", "injuries"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	environmentcontextobject: {
		idPrefix: "env",
		getPath: (item) => {
			const type = String(item.extractedData?.contextType || "").toLowerCase();
			return type === "workplace" || type === "travel"
				? ["subjective", "environments"]
				: ["objective", "environments"];
		},
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	protectiveequipmentobject: {
		idPrefix: "ppe",
		getPath: () => ["subjective", "protectiveEquipment"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	physicalexamobject: {
		idPrefix: "pe",
		getPath: () => ["objective", "physicalExamination"],
		mapFields: (item) => ({ rawTerm: item.tag }),
	},
	labpanelresult: {
		idPrefix: "lab",
		getPath: () => ["objective", "labResults"],
		mapFields: (item) => ({ rawTerm: item.tag }),
	},
	devicediagnosticobject: {
		idPrefix: "img",
		getPath: () => ["objective", "imagingResults"],
		mapFields: (item) => ({ rawTerm: item.tag }),
	},
	investigationorderobject: {
		idPrefix: "inv",
		getPath: () => ["plan", "investigations"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	referralorderobject: {
		idPrefix: "ref",
		getPath: () => ["plan", "referrals"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	interventionorderobject: {
		idPrefix: "int",
		getPath: () => ["plan", "interventions"],
		mapFields: (item) => {
			const concept = item.concept[0];
			return {
				concept: concept
					? { conceptId: concept.conceptId, display: concept.display }
					: undefined,
				rawTerm: item.tag,
			};
		},
	},
	safetynettingplan: {
		idPrefix: "safe",
		getPath: () => ["plan", "safetyNetting"],
		isCollection: false,
		mapFields: (item) => ({ rawTerm: item.tag }),
	},
	militaryplanextension: {
		idPrefix: "mil",
		getPath: () => ["plan", "militaryPlan"],
		isCollection: false,
		mapFields: (item) => ({ rawTerm: item.tag }),
	},
};

// ── Engine ───────────────────────────────────────────────────────────────────

import type { EpistemicWorkspace } from "../schemas/epistemic";
import type { CodeableConcept } from "../schemas/shared";
import type { WorkspaceStore } from "./workspace-store";

export interface ClinicalEngineConfig {
	objectStore: ObjectStore;
	eventStore: EventStore;
	dictionaryStore: DictionaryStore;
	signedNoteStore: SignedSoapNoteStore;
	workspaceStore?: WorkspaceStore;
	calibrationStore?: CalibrationStore;
	parsedCellStore?: ParsedCellStore;
	stopWordStore?: StopWordStore;
	profile?: ParserSyntaxProfile;
	profileStore?: ParserProfileStore;
	orderAwareStore?: OrderedLearningStore;
	autocompleteTransitionStore?: AutocompleteTransitionStore;
	conceptFieldStore?: ConceptFieldStore;
	evaluatorStore?: EvaluatorStore;
	proseTemplateStore?: ClinicalProseTemplateStore;
}

export class ClinicalEngine {
	private parser: CdslParser;
	private objectStore: ObjectStore;
	private eventStore: EventStore;
	private signedNoteStore: SignedSoapNoteStore;
	private workspaceStore?: WorkspaceStore;
	private calibrationStore?: CalibrationStore;
	private parsedCellStore?: ParsedCellStore;
	private orderAwareStore?: OrderedLearningStore;
	private autocompleteTransitionStore?: AutocompleteTransitionStore;
	private conceptFieldStore?: ConceptFieldStore;
	private evaluatorStore?: EvaluatorStore;
	private proseTemplateStore?: ClinicalProseTemplateStore;

	constructor(config: ClinicalEngineConfig) {
		this.objectStore = config.objectStore;
		this.eventStore = config.eventStore;
		this.signedNoteStore = config.signedNoteStore;
		this.workspaceStore = config.workspaceStore;
		this.calibrationStore = config.calibrationStore;
		this.parsedCellStore = config.parsedCellStore;
		this.orderAwareStore = config.orderAwareStore;
		this.autocompleteTransitionStore = config.autocompleteTransitionStore;
		this.conceptFieldStore = config.conceptFieldStore;
		this.evaluatorStore = config.evaluatorStore;
		this.proseTemplateStore = config.proseTemplateStore;

		const dictionaryStore = config.dictionaryStore;
		const stopWordStore = config.stopWordStore;
		const profile = config.profile;
		const profileStore = config.profileStore;

		if (profile) {
			this.parser = new CdslParser({
				dictionaryStore,
				profile,
				conceptFieldStore: this.conceptFieldStore,
				stopWordStore,
			});
		} else if (profileStore) {
			// Defer initialization — lazy init on first use
			this.parser = null as unknown as CdslParser;
		} else {
			// Fallback: create with no profile — callers must use create() factory
			this.parser = new CdslParser({
				dictionaryStore,
				profile: {} as ParserSyntaxProfile,
				conceptFieldStore: this.conceptFieldStore,
				stopWordStore,
			});
		}
	}

	/**
	 * Creates a ClinicalEngine with a parser profile resolved from a store.
	 */
	static async create(
		config: ClinicalEngineConfig & { profileId?: string },
	): Promise<ClinicalEngine> {
		const profileStore = config.profileStore;
		if (!profileStore) {
			throw new Error("ClinicalEngine.create requires a profileStore.");
		}
		const profileId = config.profileId ?? "default";
		const profile = await profileStore.get(profileId);
		if (!profile) {
			throw new Error(
				`ClinicalEngine.create: parser profile "${profileId}" not found.`,
			);
		}
		const engine = new ClinicalEngine({
			...config,
			profile,
		});
		return engine;
	}

	/**
	 * Registers a Patient Profile and starts a new Encounter SOAP Note session.
	 */
	async initEncounter(
		sessionId: string,
		patient: PatientProfile,
		context?: StopWordContext,
		alias?: string,
	): Promise<string> {
		const effectiveAlias = alias ?? sessionId;
		// Define the base SOAP note schema rules
		const schema = {
			type: "object",
			properties: {
				id: { type: "string" },
				title: { type: "string" },
				createdAt: { type: "object" },
				updatedAt: { type: "object" },
				status: { type: "string", enum: ["draft", "signed"] },
				signedBy: { type: "string" },
				patient: { type: "object" },
				subjective: { type: "object" },
				objective: { type: "object" },
				assessment: { type: "object" },
				plan: { type: "object" },
			},
			required: ["id", "status", "patient"],
		};

		// Register template schema in ObjectStore if not already registered
		const storeAny = this.objectStore as any;
		if (
			!storeAny.hasSchema?.("SoapNote") &&
			!storeAny.schemas?.has("SoapNote")
		) {
			try {
				this.objectStore.registerSchema("SoapNote", schema);
			} catch (_) {
				// Fallback in case schema is registered under the hood
			}
		}

		const noteId = `note_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const now = TimeHelper.getCurrentTimestamp();
		const note: SoapNote = {
			id: noteId,
			title: `Encounter Note - ${patient.name.primaryOrSurname}`,
			createdAt: now,
			updatedAt: now,
			status: "draft",
			patient,
			subjective: {
				presentingComplaint: {
					id: `pc_${noteId.slice(0, 8)}`,
					concept: { display: "" },
					rawTerm: "",
					sourceType: "patient_reported",
					severity: { score: 0, maxScore: 0, normalizedScore: 0 },
					duration: { magnitude: 0 },
					trajectory: "unknown",
				},
				historyOfPresentIllness: { events: [] },
				patientHistories: {
					pastMedicalHistory: [],
					currentMedications: [],
					allergies: [],
				},
				exposures: [],
				injuries: [],
			},
			objective: { vitalSigns: [], physicalExamination: [] },
			assessment: { differentialDiagnoses: [] },
			plan: {
				prescriptions: [],
				investigations: [],
				referrals: [],
				interventions: [],
			},
			cells: [],
		};

		// Create in Object Store
		await this.objectStore.init("SoapNote", sessionId, effectiveAlias, note);

		// Initialize EventStore session tip at the same alias
		try {
			const eventStoreAny = this.eventStore as any;
			if (
				eventStoreAny.schemas &&
				!eventStoreAny.schemas.has("clinical_events")
			) {
				eventStoreAny.schemas.set("clinical_events", { type: "object" });
			}
			await this.eventStore.init(
				"clinical_events",
				sessionId,
				effectiveAlias,
				[],
			);
		} catch (_) {
			// Fail-safe if already initialized in event store
		}

		await this.eventStore.append(
			sessionId,
			effectiveAlias,
			{
				id: noteId,
				targetSchema: "encounter_initialized",
				noteId,
				title: note.title,
				patient,
				createdAt: now,
				status: "draft",
				cells: [],
			},
			effectiveAlias,
		);

		return noteId;
	}

	/**
	 * Parses CDSL clinical dictation and dynamically compiles it into the active SOAP note.
	 */
	async processCdsl(
		sessionId: string,
		dictation: string,
		alias?: string,
	): Promise<SoapNote> {
		const effectiveAlias = alias ?? sessionId;
		const activeObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		if (!activeObj) {
			throw new Error("No active encounter note session found.");
		}

		if (activeObj.data.status === "signed") {
			throw new Error("Cannot modify a signed SOAP note.");
		}

		const note = activeObj.data as SoapNote;
		const patientBucket = buildPatientLearningBucket(note.patient);
		const historyStore = this.parsedCellStore as
			| ParsedCellHistoryStore
			| undefined;

		const parsedItems = historyStore
			? await this.parser.parseWithHistory(
					dictation,
					{
						personnelId: "system",
						patientContext: patientBucket,
					},
					historyStore,
				)
			: await this.parser.parse(dictation, {
					personnelId: "system",
					patientContext: patientBucket,
				});

		let currentObjId = effectiveAlias;

		for (const item of parsedItems) {
			if (this.parsedCellStore) {
				const cellId = `cell_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
				const now = new Date().toISOString();
				const parsedCell: ParsedCellRecord = {
					shared: {
						cellId,
						sessionId,
						patientId: patientBucket.patientId,
						patientOrganismType: patientBucket.organismType,
						patientGender: patientBucket.gender,
						patientAgeBucket: patientBucket.ageBucket,
						patientSpeciesBucket: patientBucket.speciesBucket,
						patientSubBucket: patientBucket.subBucket,
						patientBucketKey: patientBucket.bucketKey,
						patientTierWeights: patientBucket.weights,
						personnelId: "system",
						tag: item.tag,
						targetSchema: item.targetSchema,
						rawText: item.rawText,
						anchorText: item.tag,
						parserVersion: "phase2",
						contractVersion: "v1",
						sourceKind: "direct_contract",
						outcome: "accepted",
						acceptedAt: now,
						createdAt: now,
						updatedAt: now,
					},
					parsedItem: item,
					learningMetadata: {
						history: {
							priorAcceptCount: 1,
							priorCorrectionCount: 0,
							lastAcceptedAt: now,
							recencyScore: scoreRecency(now),
						},
						flags: {
							contractValid: true,
							stalePreference: false,
							reviewRequired: false,
						},
						candidateTokens: [],
					},
				};
				await this.parsedCellStore.putRecord(parsedCell);

				// Persist ordered tokens to the order-aware store
				if (this.orderAwareStore) {
					const orderedTokens = buildOrderedTokens(item);
					await this.orderAwareStore.putRecord({
						shared: {
							cellId,
							soapNoteId: note.id,
							tag: item.tag,
							targetSchema: item.targetSchema,
							rawText: item.rawText,
							patientId: patientBucket.patientId,
							patientOrganismType: patientBucket.organismType,
							patientGender: patientBucket.gender,
							patientAgeBucket: patientBucket.ageBucket,
							patientSpeciesBucket: patientBucket.speciesBucket,
							patientSubBucket: patientBucket.subBucket,
							patientBucketKey: patientBucket.bucketKey,
							personnelId: "system",
							acceptedAt: now,
						},
						parsedItem: item,
						orderedTokens,
					});
				}
			}
			// Log calibration if concept is not found
			if (!item.concept[0]?.conceptId && this.calibrationStore) {
				await this.calibrationStore.logException({
					personnelId: "system",
					rawTerm: item.tag,
					contextSnippet: item.rawText,
				});
			}

			// Route items to their respective SOAP Note properties using targetSchema names dynamically
			const schemaClean = item.targetSchema.toLowerCase();
			const routing = SOAP_ROUTING_CONFIGS[schemaClean];
			if (routing) {
				const transform = getTransformForSchema(item.targetSchema);
				const fallbackDefaults = routing.defaultFallbacks || {};
				const parsedData = item.extractedData || {};
				const mappedFields = routing.mapFields(item);

				let mergedData: any;
				if (transform) {
					const cleanShape = createEmptyShapeFromTemplate(
						transform.template().extractedData,
					);
					mergedData = {
						id: `${routing.idPrefix}_${crypto.randomUUID().slice(0, 8)}`,
						...fillDefaults({ ...cleanShape, ...parsedData }, fallbackDefaults),
						...mappedFields,
					};
				} else {
					mergedData = {
						id: `${routing.idPrefix}_${crypto.randomUUID().slice(0, 8)}`,
						...parsedData,
						...mappedFields,
					};
				}

				// Append event to EventStore under the session tip
				const eventData = {
					targetSchema: item.targetSchema,
					...mergedData,
				};
				const newCommitId = await this.eventStore.append(
					sessionId,
					effectiveAlias,
					eventData,
					effectiveAlias,
				);

				// Reconcile/project the updated EventStore tip back to the SOAP ObjectStore read-model
				await this.reconcileEventStateToObjectStore(newCommitId, sessionId);
			}
		}

		const updatedAt = TimeHelper.getCurrentTimestamp();
		currentObjId = await this.objectStore.set(
			currentObjId,
			["updatedAt"],
			updatedAt,
			sessionId,
		);

		const updatedObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		return updatedObj!.data as SoapNote;
	}

	/**
	 * Computes the order-aware ranking projection for a given observation parse.
	 * Returns null if no order-aware store is configured or history is empty.
	 */
	async getOrderAwareProjection(
		key: OrderedLearningHistoryKey,
		candidateTokens: OrderedLearningToken[],
		storeId: string = "default",
	): Promise<OrderAwareProjection | null> {
		if (!this.orderAwareStore) return null;

		const ranker = new OrderedLearningRanker();
		const rankedCandidate = await ranker.rankCandidate(
			this.orderAwareStore,
			{ key, candidateTokens },
			{ adapterId: storeId },
		);

		return {
			storeId,
			rankedCandidate,
		};
	}

	/**
	 * Digitally signs the SOAP Note, archiving it to long-term storage and locking it.
	 */
	async signEncounter(
		sessionId: string,
		signedBy: string,
		alias?: string,
	): Promise<SignedSoapNoteRecord> {
		const effectiveAlias = alias ?? sessionId;
		const activeObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		if (!activeObj) {
			throw new Error("No active encounter note session found.");
		}

		if (activeObj.data.status === "signed") {
			throw new Error("Note is already signed.");
		}

		// Run EvaluatorStore validation rules if configured
		if (this.evaluatorStore) {
			const note = activeObj.data as SoapNote;
			const projectedState = this.projectSoapNoteToEventRecords(note);

			const rules = await this.evaluatorStore.getRules("soap_note");
			for (const rule of rules) {
				const result = await rule.evaluate(projectedState, [], sessionId);
				if (!result.valid) {
					throw new Error(
						`Encounter signing rejected by clinical safety rule "${rule.ruleId}": ${result.errors.join("; ")}`,
					);
				}
			}
		}

		let currentObjId = effectiveAlias;
		currentObjId = await this.objectStore.set(
			currentObjId,
			["status"],
			"signed",
			sessionId,
		);
		currentObjId = await this.objectStore.set(
			currentObjId,
			["signedBy"],
			signedBy,
			sessionId,
		);
		const updatedAt = TimeHelper.getCurrentTimestamp();
		currentObjId = await this.objectStore.set(
			currentObjId,
			["updatedAt"],
			updatedAt,
			sessionId,
		);

		const signedObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		const note = signedObj!.data as SoapNote;

		const eventRecords = await this.eventStore.project(
			effectiveAlias,
			sessionId,
		);

		const workspaceEvents: Array<Record<string, unknown>> = [];
		if (this.workspaceStore) {
			const workspaces = await this.workspaceStore.list(sessionId, note.id);
			for (const ws of workspaces) {
				const wsEvents = await this.eventStore.project(ws.id, sessionId);
				workspaceEvents.push(...wsEvents);
			}
		}

		const record: SignedSoapNoteRecord = {
			noteId: note.id,
			sessionId,
			patientId: note.patient.id,
			documentVersion: 1,
			soapNoteJson: note,
			events: eventRecords,
			workspaceEvents,
			signedBy,
			createdAt: new Date().toISOString(),
		};

		// Archive to SignedSoapNoteStore
		await this.signedNoteStore.archive(record);
		return record;
	}

	/**
	 * Renders a SOAP note's narrative fields using prose templates.
	 * Returns the rendered note without persisting to the store.
	 * Rendering is a computed view — the structured note in the store is unchanged.
	 */
	async renderNote(
		sessionId: string,
		alias?: string,
	): Promise<SoapNote | null> {
		const effectiveAlias = alias ?? sessionId;
		const activeObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		if (!activeObj) return null;

		const note = activeObj.data as SoapNote;

		if (this.proseTemplateStore) {
			const templates = await this.proseTemplateStore.list();
			return ProseRenderer.render(note, templates);
		}

		return ProseRenderer.render(note, []);
	}

	private projectSoapNoteToEventRecords(note: SoapNote): any[] {
		const projectedState: any[] = [];

		for (const [configKey, config] of Object.entries(SOAP_ROUTING_CONFIGS)) {
			const path = config.getPath({} as any);
			let val: any = note;
			for (const segment of path) {
				val = val?.[segment];
			}

			if (!val) continue;

			if (config.isCollection !== false && Array.isArray(val)) {
				for (const item of val) {
					projectedState.push({
						event_id:
							item.id ||
							`${config.idPrefix}_${Math.random().toString(36).slice(2, 10)}`,
						targetSchema: configKey,
						...item,
					});
				}
			} else if (typeof val === "object") {
				projectedState.push({
					event_id:
						val.id ||
						`${config.idPrefix}_${Math.random().toString(36).slice(2, 10)}`,
					targetSchema: configKey,
					...val,
				});
			}
		}

		return projectedState;
	}

	private projectEventRecordsToSoapNote(
		records: any[],
		baseNote: SoapNote,
	): SoapNote {
		const note: SoapNote = structuredClone(baseNote);

		// Dynamically clear all target paths from baseNote to avoid duplicates
		for (const config of Object.values(SOAP_ROUTING_CONFIGS)) {
			const path = config.getPath({} as any) as string[];
			let current: any = note;
			for (let i = 0; i < path.length - 1; i++) {
				const key = path[i]!;
				if (current && typeof current === "object") {
					if (!current[key]) current[key] = {};
					current = current[key];
				}
			}
			if (current && typeof current === "object") {
				const finalKey = path[path.length - 1]!;
				current[finalKey] = config.isCollection !== false ? [] : undefined;
			}
		}

		for (const record of records) {
			const schemaKey = (record.targetSchema || "").toLowerCase();
			const config = SOAP_ROUTING_CONFIGS[schemaKey];
			if (!config) continue;

			const path = config.getPath({} as any) as string[];

			const cleanData = { ...record };
			delete cleanData.event_id;
			delete cleanData.targetSchema;

			if (config.isCollection !== false) {
				let current: any = note;
				for (let i = 0; i < path.length - 1; i++) {
					const key = path[i]!;
					if (!current[key]) {
						current[key] = {};
					}
					current = current[key];
				}
				const arrayKey = path[path.length - 1]!;
				if (!Array.isArray(current[arrayKey])) {
					current[arrayKey] = [];
				}
				current[arrayKey].push({
					id: record.event_id,
					...cleanData,
				});
			} else {
				let current: any = note;
				for (let i = 0; i < path.length - 1; i++) {
					const key = path[i]!;
					if (!current[key]) {
						current[key] = {};
					}
					current = current[key];
				}
				const finalKey = path[path.length - 1]!;
				current[finalKey] = {
					id: record.event_id,
					...cleanData,
				};
			}
		}

		return note;
	}

	async reconcileEventStateToObjectStore(
		commitId: string,
		sessionId: string,
		alias?: string,
	): Promise<string> {
		const effectiveAlias = alias ?? sessionId;
		const activeObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		if (!activeObj) {
			throw new Error("No active encounter note session found.");
		}

		const records = await this.eventStore.project(commitId, sessionId);
		const updatedNote = this.projectEventRecordsToSoapNote(
			records,
			activeObj.data as SoapNote,
		);
		await this.objectStore.set(effectiveAlias, [], updatedNote, sessionId);
		return commitId;
	}

	async initAssessmentWorkspace(
		sessionId: string,
		soapNoteId: string,
		candidateConcepts: CodeableConcept[],
		alias?: string,
	): Promise<string> {
		if (!this.workspaceStore) {
			throw new Error(
				"workspaceStore is not configured in ClinicalEngineConfig",
			);
		}
		return this.workspaceStore.init(
			sessionId,
			soapNoteId,
			candidateConcepts,
			alias,
		);
	}

	async processWorkspaceDictation(
		sessionId: string,
		workspaceId: string,
		branchId: string,
		dictation: string,
		alias?: string,
	): Promise<EpistemicWorkspace> {
		if (!this.workspaceStore) {
			throw new Error("workspaceStore is not configured");
		}
		return this.workspaceStore.process(
			sessionId,
			workspaceId,
			branchId,
			dictation,
			alias,
		);
	}

	async completeAssessmentWorkspace(
		sessionId: string,
		workspaceId: string,
		winningBranchId: string,
		alias?: string,
	): Promise<SoapNote> {
		if (!this.workspaceStore) {
			throw new Error("workspaceStore is not configured");
		}
		const effectiveAlias = alias ?? sessionId;
		const tipCommitId = await this.workspaceStore.complete(
			sessionId,
			workspaceId,
			winningBranchId,
			alias,
		);
		await this.reconcileEventStateToObjectStore(tipCommitId, sessionId);
		const updatedObj = await this.objectStore.getObject(
			effectiveAlias,
			sessionId,
		);
		return updatedObj!.data as SoapNote;
	}
}
