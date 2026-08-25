export const ES_EXTENSIONS: Record<string, string> = {
	"extensions.errors.dependencyUnavailable":
		"La extensión '{extensionId}' no puede activarse porque faltan dependencias: {missing}",
	"extensions.errors.activationFailed": "La extensión '{extensionId}' no pudo activarse",
	"extensions.errors.importFailed": "No se pudo importar el archivo de extensión '{sourceFile}'",
	"extensions.errors.exportMissing":
		"El archivo de extensión '{sourceFile}' debe exportar por defecto una extensión",
	"extensions.errors.manifestInvalid":
		"El archivo de extensión '{sourceFile}' tiene un manifiesto no válido",
	"extensions.errors.duplicateId": "El ID de extensión '{id}' está duplicado",
	"extensions.errors.missingDependency":
		"La extensión '{extensionId}' requiere la dependencia faltante '{dependency}'",
	"extensions.errors.dependencyCycle":
		"El ciclo de dependencias de extensiones incluye '{id}'",
};
