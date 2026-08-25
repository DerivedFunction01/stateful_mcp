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
	"errors.duplicateArgument":
		"Argument '{argumentName}' was provided more than once",
	"errors.missingRequiredArgument":
		"Required argument '{argumentName}' is missing",
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
	"errors.payloadPathDuplicate":
		"Payload path '{path}' was written more than once",
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
	"errors.resourceSeedNamespaceCodeRequired": "Namespace code is required",
	"errors.resourceSeedConceptIdRequired": "Concept ID is required",
	"errors.resourceSeedRelationRequired":
		"Relation ID and both concept endpoints are required",
	"errors.resourceSeedExpressionRequired":
		"Expression ID and term are required",

	// ----------------------------------------------------------------------
	// Value grammar diagnostics (quantity, currency, frequency, rates, numeric,
	// compound, statistics, date-time, template compiler)
	// ----------------------------------------------------------------------
	"errors.quantityEmpty": "Quantity expression is empty",
	"errors.quantityOperatorNotAllowed":
		"Operator '{operator}' is not permitted for this quantity",
	"errors.quantityRangeNotAllowed":
		"Range expressions are not permitted for this quantity",
	"errors.quantityChainedStepsNotAllowed":
		"Chained step sequences are not permitted for this quantity",
	"errors.quantityHeterogeneousUnitsNotAllowed":
		"Heterogeneous units are not permitted in range",
	"errors.quantityIncompatibleRangeDimensions":
		"Cannot form range between dimension '{dimension1}' ({unit1}) and '{dimension2}' ({unit2})",
	"errors.quantityDescendingRangeNotAllowed":
		"Descending or tapering range is not permitted",
	"errors.quantityParseFailed": "Could not parse quantity from '{text}'",
	"errors.quantityUnitNotAllowed":
		"Unit '{unit}' is not in the permitted unit list",
	"errors.quantityDimensionNotAllowed":
		"Physical dimension '{dimension}' for unit '{unit}' is not permitted",
	"errors.quantityNamespaceDisallowed":
		"Concept namespace '{namespace}' for unit '{unit}' is not permitted by consumer policy",

	"errors.currencyEmpty": "Currency text is empty",
	"errors.currencyNotAllowed": "Currency '{currency}' is not allowed",
	"errors.currencyNegativeNotAllowed":
		"Negative currency amounts are not allowed",
	"errors.currencyParseFailed": "Unable to parse currency '{rawText}'",

	"errors.frequencyEmpty": "Frequency text is empty",
	"errors.frequencyConditionalNotAllowed":
		"Conditional / PRN schedules are not permitted by policy",
	"errors.frequencyUnrecognized":
		"Unable to parse frequency or cadence schedule from '{rawText}'",
	"errors.frequencyCadenceTypeNotAllowed":
		"Cadence type '{cadenceType}' is not permitted by policy",
	"errors.frequencyEventAnchorNotAllowed":
		"Event anchor '{eventAnchor}' is not allowed in this domain context",
	"errors.frequencyTimeUnitNotAllowed":
		"Time unit '{unit}' is not allowed in this domain context",

	"errors.rateEmpty": "Rate expression is empty",
	"errors.rateOperatorNotAllowed":
		"Operator '{operator}' is not permitted for this rate",
	"errors.rateMissingDelimiters":
		"Expression '{rawText}' does not contain rate division delimiters",
	"errors.rateTooManyDenominators":
		"Rate has {count} denominators, maximum allowed is {max}",
	"errors.rateNumeratorEmpty": "Rate numerator is empty",
	"errors.rateNumeratorInvalid":
		"Unable to parse rate numerator '{segment}' as quantity or currency",
	"errors.rateDenominatorEmpty": "Rate denominator segment {index} is empty",

	"errors.numericEmpty": "Numeric text is empty",
	"errors.numericNegativeNotAllowed": "Negative numbers are not allowed",
	"errors.numericFractionsNotAllowed": "Fractions are not allowed",
	"errors.numericMixedFractionsNotAllowed": "Mixed fractions are not allowed",
	"errors.numericDivisionByZero": "Fraction denominator cannot be zero",
	"errors.numericInvalid": "Unable to parse '{rawText}' as a valid number",
	"errors.numericBoundsExceeded":
		"Value {value} is outside permitted bounds [{min}, {max}]",

	"errors.compoundEmpty": "Input is empty",
	"errors.compoundNoSegments": "No unit segments found in '{rawText}'",
	"errors.compoundUnknownUnit": "Unknown unit '{unit}' in segment '{segment}'",
	"errors.compoundUnregisteredUnit":
		"Unit '{unit}' is not registered in conversion registry",
	"errors.compoundDimensionMismatch":
		"Conflicting dimensions in chain: expected dimension '{expected}' but received '{received}' for unit '{unit}'",
	"errors.compoundConversionFailed":
		"Unable to convert unit '{unit}' to canonical value",
	"errors.compoundEmptyChain": "Failed to resolve chain dimensions",
	"errors.compoundDimensionNotAllowed":
		"Dimension '{dimension}' is not allowed",

	"errors.statisticsRejected":
		"Statistical qualifier '{qualifier}' is not permitted for this field",
	"errors.statisticsPointEstimateRejected":
		"Statistical metric '{qualifier}' ({role}) cannot be assigned to a point estimate slot",
	"errors.statisticsExpectedDispersion":
		"Slot requires a dispersion or error metric, but received '{qualifier}' ({role})",
	"errors.statisticsExpectedInterval":
		"Slot requires a statistical interval (CI/IQR), but received '{qualifier}'",
	"errors.statisticsQualifierTypeNotAllowed":
		"Statistical qualifier type '{type}' is not in the allowed list",
	"errors.statisticsQualifierRoleNotAllowed":
		"Statistical role '{role}' is not permitted for this field",

	"errors.dateTimeDuplicateId":
		"Date/time format ID '{id}' must be unique and match its map key",
	"errors.dateTimeFieldMismatch":
		"Format '{id}' declares fields not present in its tokens",
	"errors.dateTimeMissingReference": "Parser references unknown format '{id}'",
	"errors.dateTimeKindMismatch": "Format '{id}' is {kind}, not {expected}",

	"errors.templateInvalidRegex":
		"Invalid embedded regex in template at position {position}",
	"errors.templateCompileFailed":
		"Failed to compile template regex '{pattern}'",
};
