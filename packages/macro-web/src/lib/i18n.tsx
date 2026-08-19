import { createDefaultI18nKernel } from "@stateful-mcp/macro/workspace/i18n/discovery";
import { I18nKernel, type TranslationParams } from "@stateful-mcp/macro/workspace/i18n/i18n-kernel";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type WebLocale = "en" | "es";

const WEB_TRANSLATIONS: Record<WebLocale, Record<string, string>> = {
	en: {
		"app.profile": "Profile", "app.host": "Host diagnostics",
		"nav.workbench": "Workbench", "nav.notes": "Notes", "nav.settings": "Settings", "nav.gallery": "Component gallery", "nav.host": "Host diagnostics", "nav.commandPalette": "Command palette",
		"settings.search": "Search settings", "settings.save": "Save changes", "settings.discard": "Discard changes", "settings.language": "Language", "settings.description": "Configure fundamentals, profile behavior, and focused editor interactions.", "settings.settingsCount": "3 settings", "settings.appearanceCard": "Appearance", "settings.profileCard": "Fundamentals and profile", "settings.editorCard": "Scratchpad editor", "settings.theme": "Theme", "settings.density": "Density", "settings.comfortable": "Comfortable", "settings.compact": "Compact", "settings.activeProfile": "Active profile", "settings.enabledApps": "Enabled domain applications", "settings.clinical": "Clinical", "settings.research": "Research", "settings.notes": "Notes", "settings.measurements": "Measurements", "settings.sampleRuntime": "Sample runtime", "settings.vimToggle": "Enable Vim bindings in the focused scratchpad", "settings.macroToken": "Macro start token", "settings.macroTokenHint": "Used when authoring macro calls.", "settings.unsaved": "You have unsaved settings changes.",
		"gallery.eyebrow": "DEVELOPMENT ONLY", "gallery.title": "Component gallery", "gallery.description": "Responsive, accessible fixtures for the Macro web workbench.", "gallery.foundations": "Foundations", "gallery.primary": "Primary action", "gallery.secondary": "Secondary", "gallery.ghost": "Ghost", "gallery.danger": "Danger", "gallery.formStates": "Form states", "gallery.diagnostics": "Diagnostics", "gallery.editorContexts": "Editor contexts", "gallery.themeSwatches": "Theme swatches", "gallery.hostDiagnostics": "Host-connected diagnostics", "gallery.hostFixture": "This story uses the same snapshot shape as the Bun host transport.", "gallery.fixtureInfo": "This story is rendered from fixture data.", "gallery.previewValid": "Macro preview is valid.", "gallery.profileWarning": "The current profile has unsaved changes.", "gallery.dateError": "The date argument could not be parsed.", "gallery.enabled": "Enabled", "gallery.active": "Active", "gallery.theme": "Theme", "gallery.locale": "Locale",
		"theme.midnight": "Midnight", "theme.cloud": "Cloud", "theme.violet": "Violet", "common.english": "English", "common.spanish": "Español", "common.appearance": "Appearance", "common.profile": "Profile", "common.editor": "Editor", "common.themeDensity": "Theme and density", "common.profileApps": "Fundamentals and domain applications", "common.editorKeys": "Scratchpad and keyboard behavior",
		"workbench.previewEyebrow": "BROWSER WORKBENCH PREVIEW", "workbench.heading": "Build the workbench from the host.", "workbench.description": "The runtime and session boundary are ready. This surface intentionally stays small while the component gallery establishes the browser interaction model.", "workbench.openSettings": "Open settings", "workbench.openScratchpad": "Open scratchpad", "workbench.currentSession": "Current session", "workbench.nextSurfaces": "Next surfaces", "workbench.domainApps": "Domain apps", "workbench.editorContext": "Editor context", "workbench.vimEnabled": "Vim enabled", "workbench.browserNative": "Browser native",
		"status.local": "Local", "status.offline": "Offline", "status.zeroDiagnostics": "0 diagnostics", "status.macro": "Macro", "status.encoding": "UTF-8", "status.notifications": "Notifications", "editor.toggleVim": "Enable Vim bindings for this editor",
		"host.workspace": "Workspace", "host.session": "Session", "host.profile": "Profile", "host.transport": "Transport status", "host.http": "HTTP snapshot", "host.websocket": "WebSocket events", "host.protocol": "Protocol", "host.typed": "Typed snapshot/events", "host.description": "Inspect the host-connected snapshot and event boundary.", "host.fixtureNote": "Open the component gallery for the fixture-backed snapshot while the Bun server endpoints are being wired.",
		"status.saved": "Saved", "status.dirty": "Unsaved changes", "status.diagnostics": "diagnostics", "common.loading": "Loading", "common.error": "Something went wrong", "common.noResults": "No results",
	},
	es: {
		"app.profile": "Perfil", "app.host": "Diagnóstico del host",
		"nav.workbench": "Espacio de trabajo", "nav.notes": "Notas", "nav.settings": "Configuración", "nav.gallery": "Galería de componentes", "nav.host": "Diagnóstico del host", "nav.commandPalette": "Paleta de comandos",
		"settings.search": "Buscar configuración", "settings.save": "Guardar cambios", "settings.discard": "Descartar cambios", "settings.language": "Idioma", "settings.description": "Configura fundamentos, comportamiento del perfil e interacciones del editor enfocado.", "settings.settingsCount": "3 ajustes", "settings.appearanceCard": "Apariencia", "settings.profileCard": "Fundamentos y perfil", "settings.editorCard": "Editor del bloc", "settings.theme": "Tema", "settings.density": "Densidad", "settings.comfortable": "Cómoda", "settings.compact": "Compacta", "settings.activeProfile": "Perfil activo", "settings.enabledApps": "Aplicaciones de dominio activadas", "settings.clinical": "Clínico", "settings.research": "Investigación", "settings.notes": "Notas", "settings.measurements": "Mediciones", "settings.sampleRuntime": "Runtime de ejemplo", "settings.vimToggle": "Activar enlaces Vim en el bloc enfocado", "settings.macroToken": "Token inicial de macro", "settings.macroTokenHint": "Se usa al escribir llamadas de macro.", "settings.unsaved": "Tienes cambios de configuración sin guardar.",
		"gallery.eyebrow": "SOLO DESARROLLO", "gallery.title": "Galería de componentes", "gallery.description": "Fixtures responsivos y accesibles para el espacio web de Macro.", "gallery.foundations": "Fundamentos", "gallery.primary": "Acción principal", "gallery.secondary": "Secundaria", "gallery.ghost": "Fantasma", "gallery.danger": "Peligro", "gallery.formStates": "Estados de formulario", "gallery.diagnostics": "Diagnósticos", "gallery.editorContexts": "Contextos del editor", "gallery.themeSwatches": "Muestras de tema", "gallery.hostDiagnostics": "Diagnóstico conectado al host", "gallery.hostFixture": "Esta historia usa la misma forma de snapshot que el transporte Bun.", "gallery.fixtureInfo": "Esta historia se muestra con datos de fixture.", "gallery.previewValid": "La vista previa de la macro es válida.", "gallery.profileWarning": "El perfil actual tiene cambios sin guardar.", "gallery.dateError": "No se pudo analizar el argumento de fecha.", "gallery.enabled": "Activado", "gallery.active": "Activo", "gallery.theme": "Tema", "gallery.locale": "Idioma",
		"theme.midnight": "Medianoche", "theme.cloud": "Nube", "theme.violet": "Violeta", "common.english": "English", "common.spanish": "Español", "common.appearance": "Apariencia", "common.profile": "Perfil", "common.editor": "Editor", "common.themeDensity": "Tema y densidad", "common.profileApps": "Fundamentos y aplicaciones de dominio", "common.editorKeys": "Comportamiento del bloc y teclado",
		"workbench.previewEyebrow": "VISTA PREVIA DEL ESPACIO WEB", "workbench.heading": "Construye el espacio desde el host.", "workbench.description": "El límite de runtime y sesión está listo. Esta superficie se mantiene pequeña mientras la galería establece la interacción web.", "workbench.openSettings": "Abrir configuración", "workbench.openScratchpad": "Abrir bloc de notas", "workbench.currentSession": "Sesión actual", "workbench.nextSurfaces": "Próximas superficies", "workbench.domainApps": "Aplicaciones de dominio", "workbench.editorContext": "Contexto del editor", "workbench.vimEnabled": "Vim activado", "workbench.browserNative": "Nativo del navegador",
		"status.local": "Local", "status.offline": "Sin conexión", "status.zeroDiagnostics": "0 diagnósticos", "status.macro": "Macro", "status.encoding": "UTF-8", "status.notifications": "Notificaciones", "editor.toggleVim": "Activar enlaces Vim para este editor",
		"host.workspace": "Espacio de trabajo", "host.session": "Sesión", "host.profile": "Perfil", "host.transport": "Estado del transporte", "host.http": "Snapshot HTTP", "host.websocket": "Eventos WebSocket", "host.protocol": "Protocolo", "host.typed": "Snapshot/eventos tipados", "host.description": "Inspecciona el snapshot conectado al host y el límite de eventos.", "host.fixtureNote": "Abre la galería para ver el snapshot de fixture mientras se conectan los endpoints Bun.",
		"status.saved": "Guardado", "status.dirty": "Cambios sin guardar", "status.diagnostics": "diagnósticos", "common.loading": "Cargando", "common.error": "Algo salió mal", "common.noResults": "Sin resultados",
	},
};

interface I18nContextValue {
	readonly locale: WebLocale;
	readonly setLocale: (locale: WebLocale) => void;
	readonly t: (key: string, fallback?: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function createWebI18nKernel(): I18nKernel {
	const kernel = createDefaultI18nKernel("en");
	for (const [locale, dictionary] of Object.entries(WEB_TRANSLATIONS)) kernel.registerTranslations(locale, dictionary, "macro-web");
	return kernel;
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
	const kernel = useMemo(createWebI18nKernel, []);
	const locale = kernel.getActiveLocale() as WebLocale;
	useSyncExternalStore((listener) => kernel.subscribe(listener), () => kernel.getActiveLocale());
	const value = useMemo<I18nContextValue>(() => ({
		locale,
		setLocale: (next) => kernel.setActiveLocale(next),
		t: (key, fallback = key, params) => {
			const direct = kernel.t(key, params);
			if (direct !== key) return direct;
			return fallback;
		},
	}), [kernel, locale]);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
	const value = useContext(I18nContext);
	if (!value) throw new Error("useI18n must be used within I18nProvider");
	return value;
}
