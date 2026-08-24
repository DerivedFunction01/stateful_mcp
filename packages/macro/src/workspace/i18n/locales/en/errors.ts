export const EN_ERRORS: Record<string, string> = {
	"errors.commandOperationRequired": "A command operation is required",
	"errors.keymapProfileRequired": "A keymap profile ID is required",
	"errors.bindingContextRequired": "A chord and binding context are required",
	"errors.unsupportedCommandOperation": "The command operation is unsupported",
	"errors.canonicalCommandRequired": "A canonical command ID is required",
	"errors.editorLineNotExecutable":
		"The selected editor line is not valid or executable",
	"errors.editorRangeInvalid": "The selected editor range is invalid",
	"errors.ambiguousMacro":
		"Ambiguous macro '{triggerName}' provided by multiple extensions",
	"errors.macroNotFound": "Macro '{macroName}' not found",
	"errors.invalidBloodPressure":
		"Invalid blood pressure format: expected 'systolic/diastolic'",
	"errors.conceptUnverified":
		"Term '{term}' matched local ontology with {confidence}% confidence",
	"errors.noMatchingBackend":
		"Expression backend '{backendId}' is not available",
	"errors.normalizationFailed":
		"The value for argument '{argumentName}' could not be normalized",
	"errors.executorFailed": "Macro execution failed",
	"errors.rendererFailed": "Renderer '{rendererId}' failed",
	"errors.listenerFailed": "Listener '{listenerId}' failed",
	"errors.parseListenerDiagnostic": "Parse listener reported a diagnostic",
	"errors.staleLock": "Accepted lock '{lockId}' is stale and was discarded",
	"errors.invalidAcceptance":
		"No live candidate exists for '{argumentId}' occurrence {occurrence}",
	"errors.unstableCandidate":
		"Candidate for '{argumentId}' is visible but not accepted during live preview",
	"errors.historyCursorInvalid": "Replay range is invalid",
	"errors.notAMacroLine": "Input is not a macro line",
	"errors.unterminatedQuote": "Unterminated quote",
	"errors.unterminatedGroup": "Unterminated grouped value",
	"errors.unknownArgument": "Unknown argument '{argumentName}'",
	"errors.duplicateArgument": "Argument '{argumentName}' was provided more than once",
	"errors.missingRequiredArgument": "Required argument '{argumentName}' is missing",
	"errors.crossResourceCandidateRejectedExtension":
		"Candidate snapshot from extension '{ownerExtensionId}' rejected for resolver '{resolverId}' owned by '{backendOwnerExtensionId}'",
	"errors.crossResourceCandidateRejectedResource":
		"Candidate snapshot from resource '{resourceId}' rejected for resolver '{resolverId}'",
	"errors.staleSnapshot":
		"Candidate snapshot version '{snapshotVersion}' is stale for resolver '{resolverId}' (current: '{currentVersion}')",
	"errors.crossResourceCandidateRejectedCandidate":
		"Candidate '{candidateId}' from extension '{ownerExtensionId}' rejected for resolver '{resolverId}'",
	"errors.backendMissing": "Expression backend '{resolverId}' is not available",
	"errors.invalidPattern": "Invalid pattern for argument '{argumentName}'",
	"errors.invalidPayloadPath": "Invalid payload path '{path}'",
	"errors.payloadPathConflict":
		"Payload path '{path}' conflicts with an existing value",
	"errors.payloadPathDuplicate": "Payload path '{path}' was written more than once",
	"errors.resourceOwnershipConflict":
		"Cannot replace an existing {recordType} '{recordId}' owned by another resource",
	"errors.resourceRelationEndpointMissing":
		"Relation '{relationId}' references a missing concept endpoint",
	"errors.resourceRelationsUnsupported":
		"The selected concept store cannot persist relations",
	"errors.resourceRelationTypeUnsupported":
		"Unsupported relationship type '{relationshipType}'",
	"errors.resourceExpressionRegexInvalid":
		"Expression '{expressionId}' has an invalid regex: {detail}",
	"errors.resourceExpressionConceptMissing":
		"Expression '{expressionId}' references missing concept '{conceptId}'",
	"errors.resourceSeedNamespaceCodeRequired":
		"Namespace code is required",
	"errors.resourceSeedConceptIdRequired": "Concept ID is required",
	"errors.resourceSeedRelationRequired":
		"Relation ID and both concept endpoints are required",
	"errors.resourceSeedExpressionRequired":
		"Expression ID and term are required",
};
