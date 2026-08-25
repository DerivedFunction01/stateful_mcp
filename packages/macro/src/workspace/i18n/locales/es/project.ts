export const ES_PROJECT: Record<string, string> = {
	project: "Proyecto",
	"project.settings.title": "Configuración del proyecto",
	"project.settings.displayName": "Nombre del proyecto",
	"project.settings.projectId": "Identificador del proyecto",
	"project.settings.locale": "Idioma del proyecto",
	"project.settings.defaultProfile": "Perfil predeterminado",
	"project.settings.activeProfile": "Perfil activo",
	"project.settings.noProfile": "Sin perfil",
	"project.settings.backend": "Almacenamiento",
	"project.settings.backendJsonl": "JSONL",
	"project.settings.backendSqlite": "SQLite",
	"project.settings.backendMigrationNotice":
		"Cambiar el almacenamiento requiere una migración.",
	"project.settings.targetBackend": "Almacenamiento de destino",
	"project.settings.previewMigration": "Previsualizar migración",
	"project.settings.applyMigration": "Aplicar migración",
	"project.settings.migrationSummary":
		"La migración incluye {history} recursos de historial y {scratchpads} blocs.",
	"project.settings.migrationUnavailable":
		"La migración no está disponible para este proyecto.",
	"project.settings.recoverMigration": "Recuperar migración interrumpida",
	"project.settings.extensions": "Extensiones",
	"project.settings.templates": "Plantillas del proyecto",
	"project.settings.projectSettings": "Configuración compartida de extensiones",
	"project.settings.resources": "Recursos",
	"project.settings.invalidJson": "JSON no válido en {field}.",
	"project.settings.loading": "Cargando configuración del proyecto...",
	"project.settings.unavailable":
		"La configuración del proyecto no está disponible.",
	"project.settings.cancel": "Cancelar",
	"project.settings.save": "Guardar configuración del proyecto",
	"project.settings.manageTemplates": "Administrar plantillas",
	"project.settings.noTemplates": "No hay plantillas del proyecto",
	"project.noProject": "No hay proyecto configurado",
	"project.unavailable": "No disponible",
	"project.openProjectTitle": "Abrir carpeta de proyecto",
	"project.initProjectTitle": "Inicializar proyecto en carpeta",
	"project.saveAsProjectTitle": "Guardar espacio como proyecto",
	"project.openProjectAction": "Abrir carpeta",
	"project.initProjectAction": "Inicializar proyecto",
	"project.saveProjectAction": "Guardar proyecto aquí",
	"project.init.title": "Inicializar proyecto Macro",
	"project.init.projectName": "Nombre del proyecto",
	"project.init.projectPlaceholder": "El nombre del proyecto",
	"project.init.submit": "Inicializar proyecto",
	"project.init.cancel": "Cancelar",
	"project.settings.createGroup": "Crear grupo",
	"project.settings.groupName": "Nombre del grupo",
	"project.settings.groupNamePlaceholder": "mi-grupo",
	"project.settings.add": "Añadir",
	"project.settings.renameGroup": "Renombrar",
	"project.settings.duplicateGroup": "Duplicar",
	"project.settings.deleteGroup": "Eliminar",
	"project.settings.duplicateGroupName": "Ya existe un grupo llamado {name}.",
	"project.settings.confirmDeleteGroup":
		"¿Eliminar el grupo {name} y su membresía?",
	"project.settings.noGroups":
		"Aún no hay grupos de extensiones. Crea uno para gestionar las extensiones activas.",
	"project.settings.memberCount": "{count} miembros",
	"project.settings.membershipHint":
		"Selecciona o crea un grupo de extensiones para editar su membresía.",
	"project.settings.requires": "requiere: {names}",
	"project.settings.lockedDependency": "Bloqueado",
	"project.settings.reset": "Restablecer",
	"project.settings.sensitivePlaceholder": "••••••••",
	"project.settings.tagPlaceholder": "Escribe y pulsa Enter...",
	"project.settings.keymapCommand": "Comando",
	"project.settings.keymapChord": "Combinación de teclas",
	"project.settings.keymapCommandPlaceholder":
		"ID de comando (p. ej. editor.save)",
	"project.settings.keymapChordPlaceholder": "Combinación (p. ej. Ctrl+S)",
	"project.settings.actions": "Acciones",
	"project.settings.delete": "Eliminar",
	"project.settings.migrationJournal": "Diario de migración",
	"project.settings.migrationJournalNone": "No hay migración en curso.",
	"project.settings.migrationJournalState.preparing": "Preparando",
	"project.settings.migrationJournalState.copying": "Copiando",
	"project.settings.migrationJournalState.verifying": "Verificando",
	"project.settings.migrationJournalState.finalizing": "Finalizando",
	"project.settings.migrationJournalState.failed": "Fallida",
	"project.settings.migrationJournalResumable": "Reanudable",
	"project.settings.migrationJournalAbandoned": "Abandonada",
	"project.settings.migrationJournalStarted": "Iniciada",
	"project.settings.migrationJournalUpdated": "Actualizada",
	"project.settings.migrationJournalOwner": "Proceso {pid} en {hostname}",
	"project.settings.migrationJournalTarget": "Destino",
	"project.settings.migrationJournalCopied":
		"Copiados {history} historiales y {scratchpads} blocs",
	"project.settings.migrationJournalError": "Error",
	"project.settings.refreshJournal": "Actualizar diario",
	"project.settings.discardMigration": "Descartar migración",
	"project.settings.resumeMigration": "Reanudar migración",
	"project.settings.journalRecovery.noJournal":
		"No se encontró un diario de migración.",
	"project.settings.journalRecovery.invalidJournalCleared":
		"Se eliminó un diario de migración ilegible.",
	"project.settings.journalRecovery.migrationCompleted":
		"La migración ya se completó; se eliminó el diario sobrante.",
	"project.settings.journalRecovery.targetDiscarded":
		"Se descartó el destino parcial y se limpió el diario.",
	"project.settings.journalRecovery.targetRetained":
		"El destino parcial se conservó: {reason}",
	"project.settings.journalRecovery.activeMigrationRetained":
		"Una migración sigue en curso en otro lugar y no fue interrumpida.",
	"project.settings.journalRecovery.removedTargetPath":
		"Destino eliminado: {path}",
	"project.settings.activeGroup": "Grupo de extensiones activo",
	"project.settings.noActiveGroup": "Sin grupo de extensiones activo",
	"project.settings.manageActivationGroups": "Gestionar grupos de activación",
	"project.settings.activationGroupsSummary":
		"{count} grupo(s), {members} miembro(s) activos",
	"project.activationGroups.title": "Grupos de activación de extensiones",
	"project.activationGroups.unavailable":
		"Los grupos de activación no están disponibles.",
	"project.activationGroups.loading": "Cargando grupos de activación...",
	"project.activationGroups.groups": "Grupos",
	"project.activationGroups.create": "Crear grupo",
	"project.activationGroups.createGroup": "Crear grupo",
	"project.activationGroups.groupName": "Nombre del grupo",
	"project.activationGroups.groupNamePlaceholder": "mi-grupo",
	"project.activationGroups.add": "Añadir",
	"project.activationGroups.rename": "Renombrar",
	"project.activationGroups.duplicate": "Duplicar",
	"project.activationGroups.delete": "Eliminar",
	"project.activationGroups.cancel": "Cerrar",
	"project.activationGroups.duplicateName":
		"Ya existe un grupo llamado {name}.",
	"project.activationGroups.confirmDelete":
		"¿Eliminar el grupo {name} y su membresía?",
	"project.activationGroups.noGroups":
		"Aún no hay grupos de extensiones. Crea uno para gestionar las extensiones activas.",
	"project.activationGroups.memberCount": "{count} miembros",
	"project.activationGroups.membershipHint":
		"Selecciona un grupo para editar su membresía.",
	"project.activationGroups.activeBadge": "Activo",
	"project.activationGroups.setActive": "Establecer como activo",
	"project.activationGroups.details": "Detalles del grupo",
	"project.activationGroups.noSelection":
		"Selecciona un grupo para ver sus detalles.",
	"project.activationGroups.extensions": "Extensiones",
	"project.activationGroups.requires": "requiere: {names}",
	"project.activationGroups.lockedDependency": "Bloqueado",
	"project.activationGroups.readOnly": "Solo lectura",
	"project.activationGroups.noExtensions":
		"No hay extensiones disponibles para este proyecto.",
	"project.activationGroups.preview": "Previsualizar",
	"project.activationGroups.previewTitle": "Cambios pendientes",
	"project.activationGroups.previewNone": "No hay cambios que aplicar.",
	"project.activationGroups.previewActiveChange": "Grupo activo: {from} → {to}",
	"project.activationGroups.previewGroupRenamed": "Renombrado {from} → {to}",
	"project.activationGroups.previewGroupAdded":
		"Grupo añadido {name} ({count} miembros)",
	"project.activationGroups.previewGroupRemoved": "Grupo eliminado {name}",
	"project.activationGroups.previewGroupChanged":
		"Membresía cambiada de {name}",
	"project.activationGroups.diagnostics": "Diagnóstico",
	"project.activationGroups.diagnosticsTitle": "Diagnóstico",
	"project.activationGroups.diagnosticsNone": "No se detectaron problemas.",
	"project.activationGroups.diagUnknownExtension":
		"El grupo {group} hace referencia a la extensión desconocida {id}.",
	"project.activationGroups.diagMissingDependency":
		"El grupo {group} habilita {id}, que requiere {dep}, pero {dep} no es miembro.",
	"project.activationGroups.diagCycle":
		"El grupo {group} tiene un ciclo de dependencias: {path}.",
	"project.activationGroups.diagEmptyActive":
		"El grupo activo {group} no tiene miembros habilitados.",
	"project.activationGroups.apply": "Aplicar cambios",
	"project.activationGroups.applyFailed":
		"Los grupos de activación no se pudieron aplicar a este proyecto.",
	"project.configuration.unsupportedField":
		"Los siguientes campos son gestionados por un administrador dedicado: {fields}.",
	"project.configuration.backendChangeRequiresMigration":
		"Cambiar el backend del proyecto requiere una migración.",
	"project.configuration.displayNameRequired":
		"Se requiere un nombre para el proyecto.",
	"project.configuration.validationFailed":
		"La configuración no es válida: {details}.",
	"project.path.segmentInvalid":
		"El nombre debe ser un único segmento de ruta.",
	"project.path.relativeRequired": "Las rutas deben ser relativas al proyecto.",
	"project.path.outsideEditableArea":
		"La ruta está fuera del área editable del proyecto.",
	"project.path.escapesRoot": "La ruta sale de la raíz del proyecto.",
	"project.configuration.stale":
		"La configuración del proyecto está desactualizada.",
	"project.extensionGroup.changeRejected":
		"El cambio del grupo de extensiones no se pudo aplicar.",
	"project.extensionGroup.validationFailed":
		"El cambio del grupo de extensiones falló la validación.",
	"project.extensionGroup.activation.rolledBack":
		"La activación del grupo de extensiones falló y se revirtió.",
	"project.migration.resume.noJournal":
		"No hay un diario de migración disponible para reanudar.",
	"project.migration.finalizingCannotResume":
		"Una migración en estado 'finalizing' no se puede reanudar de forma segura.",
	"project.migration.apply.identicalBackend":
		"El backend de destino debe ser distinto del backend actual.",
	"project.migration.participantUnavailable":
		"Un participante de la migración del proyecto no está disponible.",
	"project.manifest.openFailed":
		"No se pudo abrir el manifiesto del proyecto en {manifestPath}.",
	"project.backend.pathEscapesRoot":
		"La ruta del backend del proyecto sale de la raíz del proyecto.",
	"project.manifest.invalidObject":
		"El manifiesto del proyecto debe ser un objeto.",
	"project.manifest.unsupportedVersion":
		"La versión de formato del proyecto {version} no es compatible.",
	"project.manifest.identityRequired":
		"El manifiesto del proyecto requiere metadatos de identidad.",
	"project.manifest.backendInvalid":
		"El manifiesto del proyecto tiene un backend no válido.",
	"project.manifest.resourcesInvalid":
		"El manifiesto del proyecto tiene datos de recursos no válidos.",
	"project.manifest.historyRequired":
		"El manifiesto del proyecto requiere recursos de historial.",
	"project.manifest.extensionGroupsInvalid":
		"El manifiesto del proyecto tiene grupos de activación de extensiones no válidos ({count}).",
	"project.migration.targetPathSame":
		"El destino de migración debe usar una ruta de backend diferente.",
	"project.migration.unexpectedHistory":
		"El destino de migración contiene el recurso de historial inesperado '{historyId}'.",
	"project.migration.unexpectedScratchpad":
		"El destino de migración contiene el recurso de bloc inesperado '{scratchpadId}'.",
	"project.migration.historyMissing":
		"Falta el recurso de historial migrado '{historyId}' en el backend de destino.",
	"project.migration.historyChecksumFailed":
		"El recurso de historial migrado '{historyId}' no superó la verificación de suma de comprobación.",
	"project.migration.scratchpadMissing":
		"Falta el recurso de bloc migrado '{scratchpadId}' en el backend de destino.",
	"project.migration.scratchpadChecksumFailed":
		"El recurso de bloc migrado '{scratchpadId}' no superó la verificación de suma de comprobación.",
	"project.migration.participantCycle":
		"Ciclo de dependencias del participante de migración en '{id}'.",
	"project.migration.participantMissing":
		"Falta el participante de migración '{id}'.",
	"project.migration.participant.missing":
		"Al participante de migración {participantId} de la extensión {extensionId} le faltan recursos requeridos.",
	"project.migration.participant.incompatible":
		"El participante de migración {participantId} de la extensión {extensionId} es incompatible con el backend de destino.",
	"project.resource.disabled.noProviderAvailable":
		"No hay un proveedor disponible para este tipo de recurso.",
	"project.migration.error.conflict":
		"Se detectó un cambio en conflicto durante la migración.",
	"project.migration.error.format":
		"Los datos del proyecto están corruptos o en un formato no compatible.",
	"project.migration.error.unknown":
		"Ocurrió un error desconocido durante la migración.",
	"project.configuration.update.malformed":
		"La solicitud de actualización de configuración no tenía el formato correcto.",
	"project.migration.preview.malformed":
		"La solicitud de previsualización de migración no tenía el formato correcto.",
	"project.migration.apply.malformed":
		"La solicitud de aplicación de migración no tenía el formato correcto.",
	"project.migration.journal.malformed":
		"La solicitud del diario de migración no tenía el formato correcto.",
	"project.migration.discard.malformed":
		"La solicitud de descarte de migración no tenía el formato correcto.",
	"project.migration.resume.malformed":
		"La solicitud de reanudación de migración no tenía el formato correcto.",
	"project.extensionGroup.preview.malformed":
		"La solicitud de previsualización del grupo de extensiones no tenía el formato correcto.",
	"project.extensionGroup.update.malformed":
		"La solicitud de actualización del grupo de extensiones no tenía el formato correcto.",
	"project.extensionGroup.create.malformed":
		"La solicitud de creación del grupo de extensiones no tenía el formato correcto.",
	"project.extensionGroup.duplicate.malformed":
		"La solicitud de duplicación del grupo de extensiones no tenía el formato correcto.",
	"project.extensionGroup.delete.malformed":
		"La solicitud de eliminación del grupo de extensiones no tenía el formato correcto.",
	"project.extensionGroup.activate.malformed":
		"La solicitud de activación del grupo de extensiones no tenía el formato correcto.",
	"project.extensionGroup.unknownGroup":
		"El grupo de activación de extensiones '{groupId}' no existe.",
	"project.extensionGroup.unknownActiveGroup":
		"El grupo de activación de extensiones activo '{groupId}' no existe.",
	"project.extensionGroup.unknownExtension":
		"La extensión '{extensionId}' no está declarada por el proyecto.",
	"project.extensionGroup.missingDependency":
		"La extensión '{extensionId}' requiere '{dependencyId}', pero el proyecto no la declara.",
	"project.extensionGroup.dependencyCycle":
		"Ciclo de dependencias de extensiones: {path}.",
	"project.extensionGroup.duplicateMember":
		"La extensión '{extensionId}' aparece más de una vez.",
	"project.extensionGroup.unavailableExtension":
		"La extensión '{extensionId}' no está disponible.",
	"project.extensionGroup.incompatibleExtension":
		"La extensión '{extensionId}' es incompatible con este proyecto.",
	"project.extensionGroup.emptyGroup":
		"El grupo de activación de extensiones '{groupId}' no tiene miembros.",
	"project.extensionGroup.groupMalformed":
		"El grupo de activación de extensiones '{groupId}' está mal formado.",
	"project.extensionGroup.groupIdMismatch":
		"La clave del grupo de activación de extensiones '{groupId}' no coincide con su id.",
	"project.extensionGroup.invalidGroupId":
		"El id del grupo de activación de extensiones '{groupId}' no es un identificador válido.",
	"project.extensionGroup.reservedGroupId":
		"El id del grupo de activación de extensiones '{groupId}' está reservado por un grupo contribuido.",
	"project.extensionGroup.duplicateGroupId":
		"El id del grupo de activación de extensiones '{groupId}' ya está en uso.",
	"project.extensionGroup.emptyDisplayName":
		"El grupo de activación de extensiones '{groupId}' requiere un nombre para mostrar.",
	"project.extensionGroup.invalidSource":
		"El grupo de activación de extensiones '{groupId}' tiene una fuente desconocida.",
	"project.extensionGroup.invalidMembership":
		"El grupo de activación de extensiones '{groupId}' tiene una lista de membresía no válida.",
	"project.extensionGroup.unknownSourceGroup":
		"El grupo de activación de extensiones '{groupId}' no existe.",
	"project.extensionGroup.readOnlyGroup.edit":
		"El grupo de activación de extensiones '{groupId}' es de solo lectura y debe duplicarse antes de editarlo.",
	"project.extensionGroup.readOnlyGroup.delete":
		"El grupo de activación de extensiones '{groupId}' es de solo lectura y no se puede eliminar.",
	"project.extensionGroup.activeGroupReplacementRequired":
		"El grupo de activación de extensiones '{groupId}' está activo: elige un grupo de reemplazo o borra el grupo activo explícitamente.",
	"project.extensionGroup.activeGroupReplacementRequired.same":
		"El grupo de reemplazo debe ser distinto del grupo eliminado.",
	"project.extensionGroup.activeGroupReplacementRequired.unknown":
		"El grupo de activación de extensiones de reemplazo '{groupId}' no existe.",
	"project.extensionGroup.activeGroupReplacementRequired.cleared":
		"Se borró el grupo de activación de extensiones; se activará cada extensión declarada.",
	"project.configuration.localeUnavailable":
		"El idioma '{locale}' no es un idioma disponible.",
	"project.configuration.settingType.boolean":
		"La configuración del proyecto '{namespace}.{path}' debe ser un booleano.",
	"project.configuration.settingType.number":
		"La configuración del proyecto '{namespace}.{path}' debe ser un número finito.",
	"project.configuration.settingType.string":
		"La configuración del proyecto '{namespace}.{path}' debe ser una cadena.",
	"project.configuration.settingType.enum":
		"La configuración del proyecto '{namespace}.{path}' debe ser uno de: {options}.",
	"project.configuration.settingType.array":
		"La configuración del proyecto '{namespace}.{path}' debe ser una matriz.",
	"project.configuration.settingType.object":
		"La configuración del proyecto '{namespace}.{path}' debe ser un objeto.",
};
