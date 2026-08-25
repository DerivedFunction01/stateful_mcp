export const EN_EXTENSIONS: Record<string, string> = {
	"extensions.errors.dependencyUnavailable":
		"Extension '{extensionId}' cannot activate because dependencies are unavailable: {missing}",
	"extensions.errors.activationFailed": "Extension '{extensionId}' failed to activate",
	"extensions.errors.importFailed": "Failed to import extension file '{sourceFile}'",
	"extensions.errors.exportMissing":
		"Extension file '{sourceFile}' must default-export an extension",
	"extensions.errors.manifestInvalid":
		"Extension file '{sourceFile}' has an invalid manifest",
	"extensions.errors.duplicateId": "Duplicate extension ID '{id}'",
	"extensions.errors.missingDependency":
		"Extension '{extensionId}' requires missing dependency '{dependency}'",
	"extensions.errors.dependencyCycle":
		"Extension dependency cycle includes '{id}'",
};
