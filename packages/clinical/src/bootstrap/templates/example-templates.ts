import type { ClinicalProseTemplate } from "../../rendering/template-types";
import { exampleAssessmentTemplates } from "./example-assessment-templates";
import { EXAMPLE_CORE_TEMPLATES } from "./example-core-templates";
import { exampleDiagnosticTemplates } from "./example-diagnostic-templates";
import { EXAMPLE_INJURY_TEMPLATES } from "./example-injury-templates";
import { EXAMPLE_PLAN_TEMPLATES } from "./example-plan-templates";

export const EXAMPLE_PROSE_TEMPLATES: readonly ClinicalProseTemplate[] = [
	...EXAMPLE_CORE_TEMPLATES,
	...exampleAssessmentTemplates,
	...exampleDiagnosticTemplates,
	...EXAMPLE_PLAN_TEMPLATES,
	...EXAMPLE_INJURY_TEMPLATES,
];
