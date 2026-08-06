import type { ClinicalProseTemplate } from "../../rendering/template-types";

export const EXAMPLE_INJURY_TEMPLATES: readonly ClinicalProseTemplate[] = [
	{
		templateId: "mech-injury-root-full",
		templateName: "Mechanical Injury Full Paragraph",
		kind: "root",
		targetSchema: "mechanical_injury",
		targetConceptId: "mechanical_injury_001",
		section: "objective",
		slotPosition: "full_paragraph",
		templateText: "Mechanical injury: {injury_description}.",
		slots: {
			injury_description: {
				sourcePath: "energyTransferMechanism",
				conditionalDelegates: [
					{
						delegateTemplateId: "mech-injury-component-blast",
						conditions: {
							pipeline: [
								{
									op: "eq",
									args: [
										{ $path: ["energyTransferMechanism"] },
										{ $literal: "blast_overpressure" },
									],
								},
							],
						},
					},
				],
				defaultDelegateTemplateId: "mech-injury-component-description",
			},
		},
		active: true,
	},
	{
		templateId: "mech-injury-component-description",
		templateName: "Mechanical Injury Generic Description",
		kind: "component",
		targetSchema: "mechanical_injury",
		targetConceptId: "generic_injury_001",
		slotKey: "description",
		slotPosition: "full_paragraph",
		templateText: "{mechanism} mechanism.",
		slots: {
			mechanism: {
				sourcePath: "energyTransferMechanism",
			},
		},
		active: true,
	},
	{
		templateId: "mech-injury-component-blast",
		templateName: "Mechanical Injury Blast Description",
		kind: "component",
		targetSchema: "mechanical_injury",
		targetConceptId: "blast_injury_001",
		slotKey: "description",
		slotPosition: "full_paragraph",
		templateText:
			"Blast overpressure: {blast_wave_type} wave, enclosed space: {enclosed_space}.",
		slots: {
			blast_wave_type: {
				sourcePath: "blastProfile.blastWaveType",
			},
			enclosed_space: {
				sourcePath: "blastProfile.enclosedSpace",
			},
		},
		active: true,
	},
	{
		templateId: "mech-injury-component-anatomy",
		templateName: "Mechanical Injury Anatomy Location",
		kind: "component",
		targetSchema: "mechanical_injury",
		targetConceptId: "anatomy_001",
		slotKey: "anatomy_location",
		slotPosition: "full_paragraph",
		templateText: "{location_display}",
		slots: {
			location_display: {
				sourcePath: "display",
			},
		},
		active: true,
	},
	{
		templateId: "prot-equip-root-full",
		templateName: "Protective Equipment Full Paragraph",
		kind: "root",
		targetSchema: "protective_equipment",
		targetConceptId: "protective_equipment_001",
		section: "objective",
		slotPosition: "full_paragraph",
		templateText:
			"Protective equipment status: {equipment_status}. Verified gear: {gear_list}.",
		slots: {
			equipment_status: {
				sourcePath: "equipmentStatus",
			},
			gear_list: {
				sourcePath: "verifiedDeployedGear",
				listOptions: {
					delimiter: "; ",
					lastDelimiter: "; and ",
				},
				defaultDelegateTemplateId: "prot-equip-component-gear-item",
			},
		},
		active: true,
	},
	{
		templateId: "prot-equip-component-gear-item",
		templateName: "Protective Equipment Gear Item",
		kind: "component",
		targetSchema: "protective_equipment",
		targetConceptId: "gear_item_001",
		slotKey: "gear_item",
		slotPosition: "full_paragraph",
		templateText: "{gear_category} ({item_status})",
		slots: {
			gear_category: {
				sourcePath: "gearCategory",
			},
			item_status: {
				sourcePath: "status",
			},
		},
		active: true,
	},
];
