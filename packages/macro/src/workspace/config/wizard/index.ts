/**
 * Renderer-neutral value-authoring wizard model (Phase 3).
 *
 * The public surface is intentionally small: the store factory plus the pure
 * helpers renderers need to project state. Transport is injected via
 * {@link WizardAuthoringPort}; no React/DOM/timer dependency exists here.
 */

export type {
	NumberWordScaleDraft,
	NumericOptionKey,
	ProvenanceInputs,
	StableIdEntriesInput,
	StableIdEntryView,
	WizardDateTimeFormatDto,
	WizardEntryValue,
} from "./collections";
export {
	appendEntry,
	cloneProfile,
	computeEffectiveSnapshot,
	deriveProvenance,
	foldParentChain,
	getCollectionEntries,
	getEntryById,
	getTombstones,
	isAuthoredGraphEmpty,
	listStableIdEntries,
	patchValuesDomain,
	removeEntry,
	replaceEntry,
	resetToInherited,
	setEntryEnabled,
	setEntryPriority,
	setNumberWordAtom,
	setNumberWordScales,
	setNumericOption,
	toggleNumericForm,
	updateEntry,
} from "./collections";
export type { DiagnosticFieldBinding } from "./diagnostics";
export {
	bindDiagnosticToField,
	projectFieldDiagnostics,
	stepDiagnosticCount,
} from "./diagnostics";
export type {
	ValueAuthoringWizardStore,
	WizardModelOptions,
} from "./model";
export { createValueAuthoringWizard } from "./model";
export type {
	FixtureScriptHooks,
	FixtureWizardPortSpec,
	RecordedWizardCall,
	WizardAuthoringPort,
	WizardAuthoringPreviewOptions,
	WizardPortOp,
} from "./port";
export { createDeferred, createFixtureAuthoringPort } from "./port";
export type { ScheduledCall, ScheduleFn } from "./scheduler";
export {
	DEFAULT_WIZARD_DEBOUNCE_MS,
	Debouncer,
	immediateSchedule,
	timeoutSchedule,
	VersionedRequestTracker,
} from "./scheduler";
export * from "./state";
export type { StepGuardDecision } from "./steps";
export {
	evaluateStepGuards,
	GUARD_CODES,
	guardReasonKey,
	hasMalformedSyntaxFailure,
} from "./steps";
export type {
	CombinatorIssue,
	CombinatorIssueCode,
	CombinatorNodeView,
} from "./steps/combinators";
export {
	isRecipeReferenceGraphResolvable,
	listCombinatorNodes,
	setRecipePriority,
} from "./steps/combinators";
export type { NumericLexiconView } from "./steps/numerics";
export {
	canonicalNumericForms,
	editNumberWordAtom,
	editNumberWordScales,
	editNumericForm,
	editNumericOption,
	projectNumericLexicon,
} from "./steps/numerics";
export {
	canRunSandboxPreview,
	normalizeSampleRows,
	projectSampleResult,
	SANDBOX_REJECT_CODE,
	SANDBOX_REJECT_REASON_KEY,
} from "./steps/sandbox";
export type {
	NewLocalProfileInput,
	ScopeProfileView,
} from "./steps/scope-profile";
export {
	buildNewLocalProfile,
	projectScopeProfileStep,
} from "./steps/scope-profile";
export type { TemplateFormatRow } from "./steps/templates";
export {
	analyzeDateTimeSource,
	createDateTimeFormat,
	editDateTimeFormatSource,
	listOrderedFormatIds,
	projectTemplateRows,
	removeDateTimeFormat,
	setDateTimeFormatEnabled,
	setDateTimeFormatPriority,
} from "./steps/templates";
