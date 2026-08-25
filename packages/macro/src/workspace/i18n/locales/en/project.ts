export const EN_PROJECT: Record<string, string> = {
	project: "Project",
	"project.settings.title": "Project Settings",
	"project.settings.displayName": "Project Name",
	"project.settings.projectId": "Project Identifier",
	"project.settings.locale": "Project Locale",
	"project.settings.defaultProfile": "Default Profile",
	"project.settings.activeProfile": "Active Profile",
	"project.settings.noProfile": "No profile",
	"project.settings.backend": "Storage Backend",
	"project.settings.backendJsonl": "JSONL",
	"project.settings.backendSqlite": "SQLite",
	"project.settings.backendMigrationNotice":
		"Changing storage requires a migration.",
	"project.settings.targetBackend": "Target Backend",
	"project.settings.previewMigration": "Preview Migration",
	"project.settings.applyMigration": "Apply Migration",
	"project.settings.migrationSummary":
		"Migration includes {history} history resources and {scratchpads} scratchpads.",
	"project.settings.migrationUnavailable":
		"Migration is unavailable for this project.",
	"project.settings.recoverMigration": "Recover Interrupted Migration",
	"project.settings.extensions": "Extensions",
	"project.settings.templates": "Project Templates",
	"project.settings.projectSettings": "Shared Extension Configuration",
	"project.settings.resources": "Resources",
	"project.settings.invalidJson": "Invalid JSON in {field}.",
	"project.settings.loading": "Loading project settings...",
	"project.settings.unavailable": "Project settings are unavailable.",
	"project.settings.cancel": "Cancel",
	"project.settings.save": "Save Project Settings",
	"project.settings.manageTemplates": "Manage Templates",
	"project.settings.noTemplates": "No project templates",
	"project.noProject": "No project configured",
	"project.unavailable": "Unavailable",
	"project.openProjectTitle": "Open Project Folder",
	"project.initProjectTitle": "Initialize Project in Folder",
	"project.saveAsProjectTitle": "Save Workspace As Project",
	"project.openProjectAction": "Open Folder",
	"project.initProjectAction": "Initialize Project",
	"project.saveProjectAction": "Save Project Here",
	"project.init.title": "Initialize Macro Project",
	"project.init.projectName": "Project Name",
	"project.init.projectPlaceholder": "Project Name",
	"project.init.submit": "Initialize Project",
	"project.init.cancel": "Cancel",
	"project.settings.createGroup": "Create Group",
	"project.settings.groupName": "Group Name",
	"project.settings.groupNamePlaceholder": "my-group",
	"project.settings.add": "Add",
	"project.settings.renameGroup": "Rename",
	"project.settings.duplicateGroup": "Duplicate",
	"project.settings.deleteGroup": "Delete",
	"project.settings.duplicateGroupName": "A group named {name} already exists.",
	"project.settings.confirmDeleteGroup":
		"Delete the {name} group and its membership?",
	"project.settings.noGroups":
		"No extension groups yet. Create one to manage active extensions.",
	"project.settings.memberCount": "{count} members",
	"project.settings.membershipHint":
		"Select or create an extension group to edit its membership.",
	"project.settings.requires": "requires: {names}",
	"project.settings.lockedDependency": "Locked",
	"project.settings.reset": "Reset",
	"project.settings.sensitivePlaceholder": "••••••••",
	"project.settings.tagPlaceholder": "Type and press Enter...",
	"project.settings.keymapCommand": "Command",
	"project.settings.keymapChord": "Keybinding Chord",
	"project.settings.keymapCommandPlaceholder": "Command ID (e.g. editor.save)",
	"project.settings.keymapChordPlaceholder": "Chord (e.g. Ctrl+S)",
	"project.settings.actions": "Actions",
	"project.settings.delete": "Delete",
	"project.settings.migrationJournal": "Migration Journal",
	"project.settings.migrationJournalNone": "No migration in progress.",
	"project.settings.migrationJournalState.preparing": "Preparing",
	"project.settings.migrationJournalState.copying": "Copying",
	"project.settings.migrationJournalState.verifying": "Verifying",
	"project.settings.migrationJournalState.finalizing": "Finalizing",
	"project.settings.migrationJournalState.failed": "Failed",
	"project.settings.migrationJournalResumable": "Resumable",
	"project.settings.migrationJournalAbandoned": "Abandoned",
	"project.settings.migrationJournalStarted": "Started",
	"project.settings.migrationJournalUpdated": "Updated",
	"project.settings.migrationJournalOwner": "Process {pid} on {hostname}",
	"project.settings.migrationJournalTarget": "Target",
	"project.settings.migrationJournalCopied":
		"Copied {history} history and {scratchpads} scratchpads",
	"project.settings.migrationJournalError": "Error",
	"project.settings.refreshJournal": "Refresh Journal",
	"project.settings.discardMigration": "Discard Migration",
	"project.settings.resumeMigration": "Resume Migration",
	"project.settings.journalRecovery.noJournal":
		"No migration journal was found.",
	"project.settings.journalRecovery.invalidJournalCleared":
		"Removed an unreadable migration journal.",
	"project.settings.journalRecovery.migrationCompleted":
		"The migration already completed; the leftover journal was removed.",
	"project.settings.journalRecovery.targetDiscarded":
		"Discarded the partial migration target and cleared the journal.",
	"project.settings.journalRecovery.targetRetained":
		"The partial target was retained: {reason}",
	"project.settings.journalRecovery.activeMigrationRetained":
		"A migration is still in progress elsewhere and was not interrupted.",
	"project.settings.journalRecovery.removedTargetPath":
		"Removed target: {path}",
	"project.settings.activeGroup": "Active Extension Group",
	"project.settings.noActiveGroup": "No active extension group",
	"project.settings.manageActivationGroups": "Manage Activation Groups",
	"project.settings.activationGroupsSummary":
		"{count} group(s), {members} active member(s)",
	"project.activationGroups.title": "Extension Activation Groups",
	"project.activationGroups.unavailable": "Activation groups are unavailable.",
	"project.activationGroups.loading": "Loading activation groups...",
	"project.activationGroups.groups": "Groups",
	"project.activationGroups.create": "Create Group",
	"project.activationGroups.createGroup": "Create Group",
	"project.activationGroups.groupName": "Group Name",
	"project.activationGroups.groupNamePlaceholder": "my-group",
	"project.activationGroups.add": "Add",
	"project.activationGroups.rename": "Rename",
	"project.activationGroups.duplicate": "Duplicate",
	"project.activationGroups.delete": "Delete",
	"project.activationGroups.cancel": "Close",
	"project.activationGroups.duplicateName":
		"A group named {name} already exists.",
	"project.activationGroups.confirmDelete":
		"Delete the {name} group and its membership?",
	"project.activationGroups.noGroups":
		"No extension groups yet. Create one to manage active extensions.",
	"project.activationGroups.memberCount": "{count} members",
	"project.activationGroups.membershipHint":
		"Select a group to edit its membership.",
	"project.activationGroups.activeBadge": "Active",
	"project.activationGroups.setActive": "Set as Active",
	"project.activationGroups.details": "Group Details",
	"project.activationGroups.noSelection": "Select a group to view its details.",
	"project.activationGroups.extensions": "Extensions",
	"project.activationGroups.requires": "requires: {names}",
	"project.activationGroups.lockedDependency": "Locked",
	"project.activationGroups.readOnly": "Read-only",
	"project.activationGroups.noExtensions":
		"No extensions are available for this project.",
	"project.activationGroups.preview": "Preview",
	"project.activationGroups.previewTitle": "Pending Changes",
	"project.activationGroups.previewNone": "No changes to apply.",
	"project.activationGroups.previewActiveChange": "Active group: {from} → {to}",
	"project.activationGroups.previewGroupRenamed": "Renamed {from} → {to}",
	"project.activationGroups.previewGroupAdded":
		"Added group {name} ({count} members)",
	"project.activationGroups.previewGroupRemoved": "Removed group {name}",
	"project.activationGroups.previewGroupChanged":
		"Changed membership of {name}",
	"project.activationGroups.diagnostics": "Diagnostics",
	"project.activationGroups.diagnosticsTitle": "Diagnostics",
	"project.activationGroups.diagnosticsNone": "No problems detected.",
	"project.activationGroups.diagUnknownExtension":
		"Group {group} references unknown extension {id}.",
	"project.activationGroups.diagMissingDependency":
		"Group {group} enables {id}, which requires {dep}, but {dep} is not a member.",
	"project.activationGroups.diagCycle":
		"Group {group} has a dependency cycle: {path}.",
	"project.activationGroups.diagEmptyActive":
		"Active group {group} has no members enabled.",
	"project.activationGroups.apply": "Apply Changes",
	"project.activationGroups.applyFailed":
		"Activation groups could not be applied to this project.",
	"project.configuration.unsupportedField":
		"The following field(s) are managed by a dedicated manager: {fields}.",
	"project.configuration.backendChangeRequiresMigration":
		"Changing the project backend requires a migration.",
	"project.configuration.displayNameRequired":
		"A project display name is required.",
	"project.configuration.validationFailed":
		"The configuration is invalid: {details}.",
	"project.configuration.stale": "Project configuration is stale.",
	"project.extensionGroup.changeRejected":
		"The extension group change could not be applied.",
	"project.extensionGroup.validationFailed":
		"The extension group change failed validation.",
	"project.extensionGroup.activation.rolledBack":
		"Activating the extension group failed and was rolled back.",
	"project.migration.resume.noJournal":
		"No migration journal is available to resume.",
	"project.migration.finalizingCannotResume":
		"A migration in the 'finalizing' state cannot be resumed safely.",
	"project.migration.apply.identicalBackend":
		"The target backend must differ from the current backend.",
	"project.migration.participantUnavailable":
		"A project migration participant is unavailable.",
	"project.migration.participant.missing":
		"Migration participant {participantId} from extension {extensionId} is missing required resources.",
	"project.migration.participant.incompatible":
		"Migration participant {participantId} from extension {extensionId} is incompatible with the target backend.",
	"project.resource.disabled.noProviderAvailable":
		"No provider available for this resource type.",
	"project.migration.error.conflict":
		"A conflicting change was detected during migration.",
	"project.migration.error.format":
		"The project data is corrupt or in an unsupported format.",
	"project.migration.error.unknown":
		"An unknown error occurred during migration.",
	"project.configuration.update.malformed":
		"The configuration update request was malformed.",
	"project.migration.preview.malformed":
		"The migration preview request was malformed.",
	"project.migration.apply.malformed":
		"The migration apply request was malformed.",
	"project.migration.journal.malformed":
		"The migration journal request was malformed.",
	"project.migration.discard.malformed":
		"The migration discard request was malformed.",
	"project.migration.resume.malformed":
		"The migration resume request was malformed.",
	"project.extensionGroup.preview.malformed":
		"The extension group preview request was malformed.",
	"project.extensionGroup.update.malformed":
		"The extension group update request was malformed.",
	"project.extensionGroup.create.malformed":
		"The extension group create request was malformed.",
	"project.extensionGroup.duplicate.malformed":
		"The extension group duplicate request was malformed.",
	"project.extensionGroup.delete.malformed":
		"The extension group delete request was malformed.",
	"project.extensionGroup.activate.malformed":
		"The extension group activation request was malformed.",
	"project.extensionGroup.unknownGroup":
		"Extension activation group '{groupId}' does not exist.",
	"project.extensionGroup.unknownActiveGroup":
		"Active extension activation group '{groupId}' does not exist.",
	"project.extensionGroup.unknownExtension":
		"Extension '{extensionId}' is not declared by the project.",
	"project.extensionGroup.missingDependency":
		"Extension '{extensionId}' requires '{dependencyId}', which the project does not declare.",
	"project.extensionGroup.dependencyCycle":
		"Extension dependency cycle: {path}.",
	"project.extensionGroup.duplicateMember":
		"Extension '{extensionId}' is listed more than once.",
	"project.extensionGroup.unavailableExtension":
		"Extension '{extensionId}' is not available.",
	"project.extensionGroup.incompatibleExtension":
		"Extension '{extensionId}' is incompatible with this project.",
	"project.extensionGroup.emptyGroup":
		"Extension activation group '{groupId}' has no members.",
	"project.extensionGroup.groupMalformed":
		"Extension activation group '{groupId}' is malformed.",
	"project.extensionGroup.groupIdMismatch":
		"Extension activation group key '{groupId}' does not match its id.",
	"project.extensionGroup.invalidGroupId":
		"Extension activation group id '{groupId}' is not a valid identifier.",
	"project.extensionGroup.reservedGroupId":
		"Extension activation group id '{groupId}' is reserved by a contributed group.",
	"project.extensionGroup.duplicateGroupId":
		"Extension activation group id '{groupId}' is already in use.",
	"project.extensionGroup.emptyDisplayName":
		"Extension activation group '{groupId}' requires a display name.",
	"project.extensionGroup.invalidSource":
		"Extension activation group '{groupId}' has an unknown source.",
	"project.extensionGroup.invalidMembership":
		"Extension activation group '{groupId}' has an invalid membership list.",
	"project.extensionGroup.unknownSourceGroup":
		"Extension activation group '{groupId}' does not exist.",
	"project.extensionGroup.readOnlyGroup.edit":
		"Extension activation group '{groupId}' is read-only and must be duplicated before editing.",
	"project.extensionGroup.readOnlyGroup.delete":
		"Extension activation group '{groupId}' is read-only and cannot be deleted.",
	"project.extensionGroup.activeGroupReplacementRequired":
		"Extension activation group '{groupId}' is active: choose a replacement group or clear the active group explicitly.",
	"project.extensionGroup.activeGroupReplacementRequired.same":
		"The replacement group must differ from the deleted group.",
	"project.extensionGroup.activeGroupReplacementRequired.unknown":
		"Replacement extension activation group '{groupId}' does not exist.",
	"project.extensionGroup.activeGroupReplacementRequired.cleared":
		"The active extension activation group was cleared; every declared extension will activate.",
	"project.configuration.localeUnavailable":
		"Locale '{locale}' is not an available locale.",
	"project.configuration.settingType.boolean":
		"Project setting '{namespace}.{path}' must be a boolean.",
	"project.configuration.settingType.number":
		"Project setting '{namespace}.{path}' must be a finite number.",
	"project.configuration.settingType.string":
		"Project setting '{namespace}.{path}' must be a string.",
	"project.configuration.settingType.enum":
		"Project setting '{namespace}.{path}' must be one of: {options}.",
	"project.configuration.settingType.array":
		"Project setting '{namespace}.{path}' must be an array.",
	"project.configuration.settingType.object":
		"Project setting '{namespace}.{path}' must be an object.",
};
