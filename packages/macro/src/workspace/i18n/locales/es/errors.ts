export const ES_ERRORS: Record<string, string> = {
	"errors.commandOperationRequired": "Se requiere una operación de comando",
	"errors.keymapProfileRequired":
		"Se requiere un identificador de perfil de combinaciones",
	"errors.bindingContextRequired": "Se requieren una combinación y un contexto",
	"errors.unsupportedCommandOperation":
		"La operación de comando no es compatible",
	"errors.canonicalCommandRequired":
		"Se requiere un identificador de comando canónico",
	"errors.editorLineNotExecutable":
		"La línea del editor seleccionada no es válida ni ejecutable",
	"errors.editorRangeInvalid": "El rango del editor seleccionado no es válido",
	"errors.ambiguousMacro":
		"Macro ambigua '{triggerName}' proporcionada por múltiples extensiones",
	"errors.macroNotFound": "Macro '{macroName}' no encontrada",
	"errors.invalidBloodPressure":
		"Formato de presión arterial no válido: se esperaba 'sistólica/diastólica'",
	"errors.conceptUnverified":
		"El término '{term}' coincidió con la ontología local con {confidence}% de confianza",
	"errors.noMatchingBackend":
		"El backend de expresión '{backendId}' no está disponible",
	"errors.normalizationFailed":
		"No se pudo normalizar el valor del argumento '{argumentName}'",
	"errors.executorFailed": "La ejecución de la macro falló",
	"errors.rendererFailed": "El renderizador '{rendererId}' falló",
	"errors.listenerFailed": "El listener '{listenerId}' falló",
	"errors.parseListenerDiagnostic": "El listener de análisis reportó un diagnóstico",
	"errors.staleLock":
		"El bloqueo aceptado '{lockId}' está desactualizado y fue descartado",
	"errors.invalidAcceptance":
		"No existe un candidato activo para '{argumentId}' ocurrencia {occurrence}",
	"errors.unstableCandidate":
		"El candidato para '{argumentId}' es visible pero no aceptado en la vista previa en vivo",
	"errors.historyCursorInvalid": "El rango de reproducción no es válido",
	"errors.notAMacroLine": "La entrada no es una línea de macro",
	"errors.unterminatedQuote": "Comilla sin cerrar",
	"errors.unterminatedGroup": "Valor de grupo sin cerrar",
	"errors.unknownArgument": "Argumento desconocido '{argumentName}'",
	"errors.duplicateArgument":
		"El argumento '{argumentName}' se proporcionó más de una vez",
	"errors.missingRequiredArgument":
		"Falta el argumento requerido '{argumentName}'",
	"errors.crossResourceCandidateRejectedExtension":
		"Instantánea de candidato de la extensión '{ownerExtensionId}' rechazada para el resolvedor '{resolverId}' propiedad de '{backendOwnerExtensionId}'",
	"errors.crossResourceCandidateRejectedResource":
		"Instantánea de candidato del recurso '{resourceId}' rechazada para el resolvedor '{resolverId}'",
	"errors.staleSnapshot":
		"La versión '{snapshotVersion}' de la instantánea de candidato está desactualizada para el resolvedor '{resolverId}' (actual: '{currentVersion}')",
	"errors.crossResourceCandidateRejectedCandidate":
		"Candidato '{candidateId}' de la extensión '{ownerExtensionId}' rechazado para el resolvedor '{resolverId}'",
	"errors.backendMissing":
		"El backend de expresión '{resolverId}' no está disponible",
	"errors.invalidPattern":
		"Patrón no válido para el argumento '{argumentName}'",
	"errors.invalidPayloadPath": "Ruta de carga útil no válida '{path}'",
	"errors.payloadPathConflict":
		"La ruta de carga útil '{path}' entra en conflicto con un valor existente",
	"errors.payloadPathDuplicate":
		"La ruta de carga útil '{path}' se escribió más de una vez",
	"errors.resourceOwnershipConflict":
		"No se puede reemplazar un {recordType} '{recordId}' existente propiedad de otro recurso",
	"errors.resourceRelationEndpointMissing":
		"La relación '{relationId}' hace referencia a un extremo de concepto faltante",
	"errors.resourceRelationsUnsupported":
		"El almacén de conceptos seleccionado no puede persistir relaciones",
	"errors.resourceRelationTypeUnsupported":
		"Tipo de relación no admitido '{relationshipType}'",
	"errors.resourceExpressionRegexInvalid":
		"La expresión '{expressionId}' tiene una expresión regular no válida: {detail}",
	"errors.resourceExpressionConceptMissing":
		"La expresión '{expressionId}' hace referencia al concepto faltante '{conceptId}'",
	"errors.resourceSeedNamespaceCodeRequired":
		"Se requiere el código del espacio de nombres",
	"errors.resourceSeedConceptIdRequired": "Se requiere el ID del concepto",
	"errors.resourceSeedRelationRequired":
		"Se requieren el ID de la relación y ambos extremos del concepto",
	"errors.resourceSeedExpressionRequired":
		"Se requieren el ID de la expresión y el término",
};
