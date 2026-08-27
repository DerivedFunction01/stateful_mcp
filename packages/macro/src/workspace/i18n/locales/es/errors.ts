export const ES_ERRORS: Record<string, string> = {
	"errors.transportFailed": "No se pudo contactar con el host.",
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
	"errors.parseListenerDiagnostic":
		"El listener de análisis reportó un diagnóstico",
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
	"artifact.unavailable": "El artefacto no está disponible o ha caducado.",
	"artifact.unauthorized":
		"Este artefacto no está disponible para la sesión actual.",
	"artifact.notSaveable": "Este artefacto no se puede guardar en el proyecto.",
	"artifact.materializationUnavailable":
		"La materialización del artefacto del proyecto no está disponible.",
	"resource.notExposed": "El recurso no está expuesto por el proyecto.",
	"resource.actionUnsupported": "Esta acción de recurso no está disponible.",
	"resource.kindUnsupported":
		"Este tipo de recurso no se puede abrir en el editor.",
	"resource.notFound": "No se encontró el recurso guardado.",

	// ----------------------------------------------------------------------
	// Diagnósticos de gramática de valores (quantity, currency, frequency,
	// rates, numeric, compound, statistics, date-time, template compiler)
	// ----------------------------------------------------------------------
	"errors.quantityEmpty": "La expresión de cantidad está vacía",
	"errors.quantityOperatorNotAllowed":
		"El operador '{operator}' no está permitido para esta cantidad",
	"errors.quantityRangeNotAllowed":
		"Las expresiones de rango no están permitidas para esta cantidad",
	"errors.quantityChainedStepsNotAllowed":
		"Las secuencias de pasos encadenados no están permitidas para esta cantidad",
	"errors.quantityHeterogeneousUnitsNotAllowed":
		"Las unidades heterogéneas no están permitidas en el rango",
	"errors.quantityIncompatibleRangeDimensions":
		"No se puede formar un rango entre la dimensión '{dimension1}' ({unit1}) y '{dimension2}' ({unit2})",
	"errors.quantityDescendingRangeNotAllowed":
		"Los rangos descendentes o decrecientes no están permitidos",
	"errors.quantityParseFailed": "No se pudo analizar la cantidad de '{text}'",
	"errors.quantityUnitNotAllowed":
		"La unidad '{unit}' no está en la lista de unidades permitidas",
	"errors.quantityDimensionNotAllowed":
		"La dimensión física '{dimension}' para la unidad '{unit}' no está permitida",
	"errors.quantityNamespaceDisallowed":
		"El espacio de nombres de concepto '{namespace}' para la unidad '{unit}' no está permitido por la política del consumidor",

	"errors.currencyEmpty": "El texto de moneda está vacío",
	"errors.currencyNotAllowed": "La moneda '{currency}' no está permitida",
	"errors.currencyNegativeNotAllowed":
		"Los montos de moneda negativos no están permitidos",
	"errors.currencyParseFailed": "No se pudo analizar la moneda '{rawText}'",

	"errors.frequencyEmpty": "El texto de frecuencia está vacío",
	"errors.frequencyConditionalNotAllowed":
		"Los horarios condicionales / PRN no están permitidos por la política",
	"errors.frequencyUnrecognized":
		"No se pudo analizar la frecuencia o el horario de cadencia de '{rawText}'",
	"errors.frequencyCadenceTypeNotAllowed":
		"El tipo de cadencia '{cadenceType}' no está permitido por la política",
	"errors.frequencyEventAnchorNotAllowed":
		"El ancla de evento '{eventAnchor}' no está permitida en este contexto de dominio",
	"errors.frequencyTimeUnitNotAllowed":
		"La unidad de tiempo '{unit}' no está permitida en este contexto de dominio",

	"errors.rateEmpty": "La expresión de tasa está vacía",
	"errors.rateOperatorNotAllowed":
		"El operador '{operator}' no está permitido para esta tasa",
	"errors.rateMissingDelimiters":
		"La expresión '{rawText}' no contiene delimitadores de división de tasa",
	"errors.rateTooManyDenominators":
		"La tasa tiene {count} denominadores; el máximo permitido es {max}",
	"errors.rateNumeratorEmpty": "El numerador de la tasa está vacío",
	"errors.rateNumeratorInvalid":
		"No se pudo analizar el numerador de la tasa '{segment}' como cantidad o moneda",
	"errors.rateDenominatorEmpty":
		"El segmento {index} del denominador de la tasa está vacío",

	"errors.numericEmpty": "El texto numérico está vacío",
	"errors.numericNegativeNotAllowed":
		"Los números negativos no están permitidos",
	"errors.numericFractionsNotAllowed": "Las fracciones no están permitidas",
	"errors.numericMixedFractionsNotAllowed":
		"Las fracciones mixtas no están permitidas",
	"errors.numericDivisionByZero":
		"El denominador de la fracción no puede ser cero",
	"errors.numericInvalid":
		"No se pudo analizar '{rawText}' como un número válido",
	"errors.numericBoundsExceeded":
		"El valor {value} está fuera de los límites permitidos [{min}, {max}]",

	"errors.compoundEmpty": "La entrada está vacía",
	"errors.compoundNoSegments":
		"No se encontraron segmentos de unidad en '{rawText}'",
	"errors.compoundUnknownUnit":
		"Unidad desconocida '{unit}' en el segmento '{segment}'",
	"errors.compoundUnregisteredUnit":
		"La unidad '{unit}' no está registrada en el registro de conversión",
	"errors.compoundDimensionMismatch":
		"Dimensiones en conflicto en la cadena: se esperaba la dimensión '{expected}' pero se recibió '{received}' para la unidad '{unit}'",
	"errors.compoundConversionFailed":
		"No se pudo convertir la unidad '{unit}' a un valor canónico",
	"errors.compoundEmptyChain":
		"No se pudieron resolver las dimensiones de la cadena",
	"errors.compoundDimensionNotAllowed":
		"La dimensión '{dimension}' no está permitida",

	"errors.statisticsRejected":
		"El calificador estadístico '{qualifier}' no está permitido para este campo",
	"errors.statisticsPointEstimateRejected":
		"La métrica estadística '{qualifier}' ({role}) no se puede asignar a un espacio de estimación puntual",
	"errors.statisticsExpectedDispersion":
		"El espacio requiere una métrica de dispersión o error, pero se recibió '{qualifier}' ({role})",
	"errors.statisticsExpectedInterval":
		"El espacio requiere un intervalo estadístico (IC/IQR), pero se recibió '{qualifier}'",
	"errors.statisticsQualifierTypeNotAllowed":
		"El tipo de calificador estadístico '{type}' no está en la lista permitida",
	"errors.statisticsQualifierRoleNotAllowed":
		"El rol estadístico '{role}' no está permitido para este campo",

	"errors.dateTimeDuplicateId":
		"El ID de formato de fecha/hora '{id}' debe ser único y coincidir con su clave de mapa",
	"errors.dateTimeFieldMismatch":
		"El formato '{id}' declara campos que no están presentes en sus tokens",
	"errors.dateTimeMissingReference":
		"El analizador hace referencia a un formato desconocido '{id}'",
	"errors.dateTimeKindMismatch": "El formato '{id}' es {kind}, no {expected}",

	"errors.templateInvalidRegex":
		"Expresión regular incrustada no válida en la plantilla en la posición {position}",
	"errors.templateCompileFailed":
		"No se pudo compilar la expresión regular de la plantilla '{pattern}'",
};
