import type { CodeableConcept } from "./shared";

export interface PatientContext {
  mrn: string;
  name: string;
  dob: string;
  gender: string;
  race?: string;
  ethnicity?: string;
  allergies: CodeableConcept[];
}
