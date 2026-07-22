import type {
  ClinicalDateRange,
  ClinicalSourceType,
  CodeableConcept,
  SingleMeasurement,
} from "./shared";

export interface MechanicalInjuryObject {
  id: string;
  soapSection: "subjective" | "objective";
  energyTransferMechanism:
    | "blunt_impact"
    | "penetrating_projectile"
    | "penetrating_sharp"
    | "blast_overpressure"
    | "crush_compression"
    | "avulsion_shearing"
    | "barotrauma"
    | "thermal_burn";
  anatomyLocations?: CodeableConcept[];
  ballisticProfile?: {
    firearmOrOrdnance?: CodeableConcept;
    caliber?: CodeableConcept;
    projectileType?: string;
    estimatedStandoffDistance?: SingleMeasurement;
    armorPenetrationStatus?:
      | "defeated_by_armor"
      | "penetrated_armor"
      | "unprotected";
  };
  blastProfile?: {
    blastWaveType:
      | "primary_overpressure"
      | "secondary_shrapnel"
      | "tertiary_impact"
      | "quaternary_burn_chemical";
    detonationStandoffDistance?: SingleMeasurement;
    enclosedSpace?: boolean;
  };
  fallProfile?: {
    fallHeight: SingleMeasurement;
    impactSurface?: string;
    freefall?: boolean;
  };
}

export interface ProtectiveItem {
  id: string;
  itemType: CodeableConcept;
  status: "active" | "inactive" | "damaged" | "destroyed";
}

export interface ProtectiveEquipmentObject {
  id: string;
  soapSection: "subjective" | "objective";
  equipmentStatus:
    | "fully_deployed"
    | "partially_deployed"
    | "not_deployed"
    | "deployed_but_malfunctioned"
    | "unknown";
  verifiedDeployedGear: ProtectiveItem[];
  sourceType?: ClinicalSourceType;
  dateRange?: ClinicalDateRange;
}
