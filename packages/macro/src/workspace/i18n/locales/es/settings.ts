import { ES_SETTINGS_APPEARANCE } from "./settings/appearance";
import { ES_SETTINGS_APPLICATION } from "./settings/application";
import { ES_SETTINGS_EDITOR } from "./settings/editor";
import { ES_SETTINGS_FUNDAMENTALS } from "./settings/fundamentals/index";

export const ES_SETTINGS: Record<string, string> = {
	"settings.title": "Configuración",
	"settings.search": "Buscar configuración",
	"settings.findPrompt": "Buscar:",
	"settings.searchPlaceholder":
		"Buscar configuración (ej. 'decimal', 'unidad')",
	"settings.profileLabel": "Perfil de configuración",
	"settings.profile": "Perfil",
	"settings.profile.base": "Base (Predeterminado)",
	"settings.profile.createNew": "+ Crear nuevo perfil…",
	"settings.profile.newFromBase": "Nuevo perfil desde base",
	"settings.scope": "Ámbito de almacenamiento",
	"settings.scope.workspace": "Espacio / Proyecto",
	"settings.scope.user": "Usuario",
	"settings.scope.folder": "Carpeta",
	"settings.scope.unsupported":
		"El almacenamiento para este ámbito no está disponible.",
	"settings.profile.unsupported":
		"Este perfil de configuración no está disponible.",
	"settings.bundle.invalid": "El paquete de configuración no es válido.",
	"settings.bundle.blocked":
		"No se pudo aplicar el paquete de configuración: {message}",
	"settings.bundle.scopeUnsupported":
		"El almacenamiento de configuración para el ámbito {scope} no está disponible.",
	"settings.bundle.profileUnsupported":
		"El perfil de configuración {profile} no está disponible.",
	"settings.bundle.versionInvalid":
		"La versión del paquete de configuración no es compatible.",
	"settings.bundle.stale":
		"La revisión del paquete de configuración está desactualizada.",
	"settings.bundle.stageUnavailable":
		"La importación de configuración preparada no está disponible.",
	"settings.bundle.stageUnknown":
		"La etapa de importación de configuración es desconocida.",
	"settings.bundle.profileOutsideSelection":
		"El paquete contiene el perfil {profile} fuera del perfil seleccionado.",
	"settings.bundle.sensitiveOmitted":
		"Se omitió la configuración sensible del paquete importado.",
	"settings.bundle.valueInvalid": "El ajuste {path} tiene un valor no válido.",
	"settings.diagnostic.rootNotObject":
		"La raíz de la configuración debe ser un objeto JSON.",
	"settings.diagnostic.jsonParseError":
		"El texto de configuración no es JSON válido.",
	"settings.diagnostic.invalidValue": "Valor no válido para {path}.",
	"settings.diagnostic.outOfRange":
		"El valor de {path} está fuera de su rango permitido.",
	"settings.diagnostic.previewStale":
		"La vista previa de configuración está desactualizada.",
	"settings.values.unknownTemplateToken":
		"Token de plantilla desconocido '{token}'.",
	"settings.values.parseError":
		"No se pudo analizar el valor ({code}): {message}",
	"settings.modifiedOnly": "Mostrar solo modificados",
	"settings.categories": "Categorías de configuración",
	"settings.category.syntax": "Sintaxis principal",
	"settings.category.values": "Fundamentos y valores",
	"settings.category.appearance": "Apariencia y tema",
	"settings.category.editor": "Configuración del editor",
	"settings.category.keymap": "Atajos y movimientos",
	"settings.category.extensions": "Extensiones",
	"settings.group.currency": "Moneda",
	"settings.group.dateTime": "Fecha y hora",
	"settings.group.quantity": "Cantidad y unidades",
	"settings.group.frequency": "Frecuencia y cadencia",
	"settings.group.numeric": "Números",
	"settings.group.general": "General",
	"settings.group.execution": "Ejecución",
	"settings.group.font": "Fuente",
	"settings.group.formatting": "Formato",
	"settings.group.layout": "Diseño",
	"settings.group.appearance": "Apariencia",
	"settings.group.i18n": "Internacionalización",
	"settings.group.storage": "Almacenamiento",
	"settings.group.keyboard": "Teclado",
	"settings.jsonMode": "Modo JSON",
	"settings.rawJson": "JSON sin formato",
	"settings.jsonUnavailable":
		"El modo JSON no está disponible para configuraciones sensibles.",
	"settings.export": "Exportar",
	"settings.import": "Importar",
	"settings.exported": "Configuración copiada al portapapeles.",
	"settings.downloaded": "Configuración descargada.",
	"settings.importConfirm":
		"¿Aplicar este paquete de configuración al perfil seleccionado?",
	"settings.importReady":
		"El archivo pasó la validación del host y está listo para aplicarse.",
	"settings.importMode": "Modo de importación",
	"settings.importReplace": "Reemplazar configuración seleccionada",
	"settings.importMerge": "Combinar configuración seleccionada",
	"settings.preview": "Vista previa",
	"settings.preview.tokens": "Tokens disponibles",
	"settings.preview.sampleInput": "Entrada de muestra",
	"settings.preview.unknownTokens": "Tokens de plantilla desconocidos",
	"settings.preview.sampleMatched": "Muestra analizada correctamente",
	"settings.preview.sampleFailed": "La muestra no se pudo analizar",
	"settings.preview.stale": "La vista previa está desactualizada",
	"settings.preview.diagnostic": "Error de validación de vista previa",
	"settings.imported": "Configuración importada.",
	"settings.cancel": "Cancelar",
	"settings.unsavedTitle": "Configuraciones sin guardar",
	"settings.unsavedMessage":
		"¿Guardar o descartar los cambios de configuración antes de salir?",
	"settings.keepEditing": "Seguir editando",
	"settings.saveAndContinue": "Guardar y continuar",
	"settings.unsupportedWidget":
		"Este control de configuración no está disponible en el renderizador web.",
	"settings.unavailable":
		"La configuración no está disponible para este espacio.",
	"settings.conflict":
		"La configuración cambió en otro lugar. Recarga o continúa editando antes de guardar.",
	"settings.actions.save": "Guardar configuración",
	"settings.save": "Guardar cambios",
	"settings.discard": "Descartar cambios",
	"settings.language": "Idioma",
	"settings.description":
		"Configura fundamentos, comportamiento del perfil e interacciones del editor enfocado.",
	"settings.settingsCount": "{count} ajustes",
	"settings.settingsCountOne": "1 ajuste",
	"settings.origin.overridden": "Modificado en {scope}",
	"settings.origin.inherited": "Heredado de {profile}",
	"settings.origin.default": "Predeterminado",
	"settings.appearanceCard": "Apariencia",
	"settings.profileCard": "Fundamentos y perfil",
	"settings.editorCard": "Editor del bloc",
	"settings.theme": "Tema",
	"settings.density": "Densidad",
	"settings.comfortable": "Cómoda",
	"settings.compact": "Compacta",
	"settings.activeProfile": "Perfil activo",
	"settings.enabledApps": "Aplicaciones de dominio activadas",
	"settings.measurements": "Mediciones",
	"settings.sampleRuntime": "Runtime de ejemplo",
	"settings.vimToggle": "Activar enlaces Vim en el bloc enfocado",
	"settings.macroToken": "Macro start token",
	"settings.macroTokenHint": "Se usa al escribir llamadas de macro.",
	"settings.unsaved": "Tienes cambios de configuración sin guardar.",
	...ES_SETTINGS_FUNDAMENTALS,
	...ES_SETTINGS_EDITOR,
	...ES_SETTINGS_APPEARANCE,
	...ES_SETTINGS_APPLICATION,
};
