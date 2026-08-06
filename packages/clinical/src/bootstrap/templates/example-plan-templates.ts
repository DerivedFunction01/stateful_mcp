import type { ClinicalProseTemplate } from "../../rendering/template-types";

export const EXAMPLE_PLAN_TEMPLATES: readonly ClinicalProseTemplate[] = [
	{
		templateId: "medication-order-root",
		templateName: "Medication Order Root",
		kind: "root",
		targetSchema: "Medication",
		section: "plan",
		slotPosition: "full_paragraph",
		templateText: "Medications: {medication_list}.",
		slots: {
			medication_list: {
				sourcePath: "medications",
				defaultDelegateTemplateId: "medication-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "Medication",
					slotKey: "medication_order.medications",
				},
			},
		},
		active: true,
	},
	{
		templateId: "medication-item",
		templateName: "Medication Item",
		kind: "component",
		targetSchema: "Medication",
		slotKey: "medication_item",
		slotPosition: "full_paragraph",
		templateText:
			"{medication_display}{dosage_display}{frequency_display}{route_display}{indication_display}.",
		slots: {
			medication_display: {
				sourcePath: "medication.display",
			},
			dosage_display: {
				sourcePath: "dosage",
				fallback: "",
				format: "number",
			},
			frequency_display: {
				sourcePath: "frequency",
				fallback: "",
			},
			route_display: {
				sourcePath: "route",
				fallback: "",
			},
			indication_display: {
				sourcePath: "targetIndication.display",
				fallback: "",
			},
		},
		active: true,
	},
	{
		templateId: "intervention-order-root",
		templateName: "Intervention Order Root",
		kind: "root",
		targetSchema: "InterventionOrder",
		section: "plan",
		slotPosition: "full_paragraph",
		templateText: "Interventions: {intervention_list}.",
		slots: {
			intervention_list: {
				sourcePath: "interventions",
				defaultDelegateTemplateId: "intervention-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "InterventionOrder",
					slotKey: "intervention_order.interventions",
				},
			},
		},
		active: true,
	},
	{
		templateId: "intervention-item",
		templateName: "Intervention Item",
		kind: "component",
		targetSchema: "InterventionOrder",
		slotKey: "intervention_item",
		slotPosition: "full_paragraph",
		templateText:
			"{procedure_display} ({priority}){location_display}{anesthesia_display}{scheduling_display}.",
		slots: {
			procedure_display: {
				sourcePath: "procedure.display",
			},
			priority: {
				sourcePath: "priority",
			},
			location_display: {
				sourcePath: "procedureLocation.display",
				fallback: "",
			},
			anesthesia_display: {
				sourcePath: "anesthesiaType",
				fallback: "",
			},
			scheduling_display: {
				sourcePath: "schedulingWindow",
				fallback: "",
			},
		},
		active: true,
	},
	{
		templateId: "investigation-order-root",
		templateName: "Investigation Order Root",
		kind: "root",
		targetSchema: "InvestigationOrder",
		section: "plan",
		slotPosition: "full_paragraph",
		templateText: "Investigations: {investigation_list}.",
		slots: {
			investigation_list: {
				sourcePath: "investigations",
				defaultDelegateTemplateId: "investigation-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "InvestigationOrder",
					slotKey: "investigation_order.investigations",
				},
			},
		},
		active: true,
	},
	{
		templateId: "investigation-item",
		templateName: "Investigation Item",
		kind: "component",
		targetSchema: "InvestigationOrder",
		slotKey: "investigation_item",
		slotPosition: "full_paragraph",
		templateText:
			"{procedure_display} ({priority}, {investigation_type}){specimen_display}{laterality_display}.",
		slots: {
			procedure_display: {
				sourcePath: "procedure.display",
			},
			priority: {
				sourcePath: "priority",
			},
			investigation_type: {
				sourcePath: "investigationType",
			},
			specimen_display: {
				sourcePath: "specimenType.display",
				fallback: "",
			},
			laterality_display: {
				sourcePath: "laterality",
				fallback: "",
			},
		},
		active: true,
	},
	{
		templateId: "referral-order-root",
		templateName: "Referral Order Root",
		kind: "root",
		targetSchema: "ReferralOrder",
		section: "plan",
		slotPosition: "full_paragraph",
		templateText: "Referrals: {referral_list}.",
		slots: {
			referral_list: {
				sourcePath: "referrals",
				defaultDelegateTemplateId: "referral-item",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				contract: {
					targetSchema: "ReferralOrder",
					slotKey: "referral_order.referrals",
				},
			},
		},
		active: true,
	},
	{
		templateId: "referral-item",
		templateName: "Referral Item",
		kind: "component",
		targetSchema: "ReferralOrder",
		slotKey: "referral_item",
		slotPosition: "full_paragraph",
		templateText:
			"{procedure_display} to {specialist_discipline} ({referral_urgency}){clinical_question_display}{routing_notes_display}.",
		slots: {
			procedure_display: {
				sourcePath: "procedure.display",
			},
			specialist_discipline: {
				sourcePath: "specialistDiscipline.display",
			},
			referral_urgency: {
				sourcePath: "referralUrgency",
			},
			clinical_question_display: {
				sourcePath: "clinicalQuestion",
				fallback: "",
			},
			routing_notes_display: {
				sourcePath: "routingNotes",
				fallback: "",
			},
		},
		active: true,
	},
	{
		templateId: "safety-netting-root",
		templateName: "Safety Netting Root",
		kind: "root",
		targetSchema: "SafetyNetting",
		section: "plan",
		slotPosition: "full_paragraph",
		templateText:
			"Safety netting: red flags {red_flag_list}. Return precautions: {return_precautions}. Follow-up: {follow_up_window}{follow_up_triggers_list}. Escalation: {escalation_path}.",
		slots: {
			red_flag_list: {
				sourcePath: "redFlagSymptoms",
				defaultDelegateTemplateId: "safety-netting-red-flag-item",
				listOptions: {
					delimiter: ", ",
					lastDelimiter: ", and ",
				},
				contract: {
					targetSchema: "SafetyNetting",
					slotKey: "safety_netting.redFlagSymptoms",
				},
			},
			return_precautions: {
				sourcePath: "returnPrecautions",
			},
			follow_up_window: {
				sourcePath: "followUpWindow",
			},
			follow_up_triggers_list: {
				sourcePath: "followUpTriggers",
				defaultDelegateTemplateId: "safety-netting-trigger-item",
				listOptions: {
					delimiter: ", ",
					lastDelimiter: ", and ",
				},
				contract: {
					targetSchema: "SafetyNetting",
					slotKey: "safety_netting.followUpTriggers",
				},
				fallback: "",
			},
			escalation_path: {
				sourcePath: "escalationPath",
				fallback: "not specified",
			},
		},
		active: true,
	},
	{
		templateId: "safety-netting-red-flag-item",
		templateName: "Safety Netting Red Flag Item",
		kind: "component",
		targetSchema: "SafetyNetting",
		slotKey: "red_flag_item",
		slotPosition: "full_paragraph",
		templateText: "{concept_display}",
		slots: {
			concept_display: {
				sourcePath: "display",
			},
		},
		active: true,
	},
	{
		templateId: "safety-netting-trigger-item",
		templateName: "Safety Netting Trigger Item",
		kind: "component",
		targetSchema: "SafetyNetting",
		slotKey: "trigger_item",
		slotPosition: "full_paragraph",
		templateText: "{concept_display}",
		slots: {
			concept_display: {
				sourcePath: "display",
			},
		},
		active: true,
	},
	{
		templateId: "military-plan-extension-root",
		templateName: "Military Plan Extension Root",
		kind: "root",
		targetSchema: "MilitaryPlanExtension",
		section: "plan",
		slotPosition: "full_paragraph",
		templateText:
			"Military disposition: {disposition}. Limitations: {limitations_display}.",
		slots: {
			disposition: {
				sourcePath: "disposition",
			},
			limitations_display: {
				sourcePath: "dutyLimitations",
				fallback: "none",
				defaultDelegateTemplateId: "military-duty-limitation-item",
			},
		},
		active: true,
	},
	{
		templateId: "military-duty-limitation-item",
		templateName: "Military Duty Limitation Item",
		kind: "component",
		targetSchema: "MilitaryPlanExtension",
		slotKey: "duty_limitation_item",
		slotPosition: "full_paragraph",
		templateText:
			"running={running}, cycling={cycling}, swimming={swimming}, max_lifting_lbs={max_lifting_lbs}, body_armor={body_armor}, weapon_handling={weapon_handling}, profile_duration_days={profile_duration_days}",
		slots: {
			running: {
				sourcePath: "running",
				fallback: "false",
			},
			cycling: {
				sourcePath: "cycling",
				fallback: "false",
			},
			swimming: {
				sourcePath: "swimming",
				fallback: "false",
			},
			max_lifting_lbs: {
				sourcePath: "max_lifting_lbs",
				fallback: "none",
			},
			body_armor: {
				sourcePath: "body_armor_or_helmet",
				fallback: "false",
			},
			weapon_handling: {
				sourcePath: "weapon_handling",
				fallback: "false",
			},
			profile_duration_days: {
				sourcePath: "profile_duration_days",
				fallback: "none",
			},
		},
		active: true,
	},
];
