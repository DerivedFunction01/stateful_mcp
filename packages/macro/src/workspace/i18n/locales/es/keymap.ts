export const ES_KEYMAP: Record<string, string> = {
	"keymap.source.macro-profile": "Perfil de Macro",
	"keymap.source.browser-baseline": "Predeterminado del navegador",
	"keymap.source.user-override": "Anulación del usuario",
	"keymap.source.extension": "Extensión",
	"keymap.conflict": "La combinación también está asignada a otro comando",
	"keymap.conditional": "El navegador puede reclamar el atajo",
	"keymap.unavailable": "El atajo no se puede reasignar de forma fiable",
	"keymap.chord.cancelled": "Combinación cancelada",
	"keymap.chord.timeout": "La combinación expiró",
	"keymap.chordPrefix": "Prefijo de combinación pulsado; esperando otra tecla",
	"keymap.shortcutUnavailable":
		"El atajo no se puede reasignar en el navegador:",
	"keymap.shortcutConditional": "El navegador puede gestionar este atajo:",
	"keymap.noBinding": "No hay una combinación activa para este contexto",
	"keymap.profileUnknown":
		"El perfil de combinaciones seleccionado no está disponible",
	"keymap.diagnostic.invalidChord":
		"Combinación desconocida '{chord}' para el comando '{command}'.",
	"keymap.diagnostic.invalidChordFormat":
		"Combinación desconocida '{chord}'. Debe seguir la gramática canónica [ctrl+][meta+][primary+][shift+]<canonical_key>.",
	"keymap.diagnostic.duplicateBinding":
		"La combinación '{chord}' está asignada tanto a '{first}' como a '{second}'.",
	"keymap.diagnostic.sequencePrefixConflict":
		"Las secuencias '{first}' y '{second}' entran en conflicto.",
	"keymap.diagnostic.surface.requiredFields":
		"Los atajos de superficie requieren una tecla, una acción y una etiqueta.",
	"keymap.diagnostic.surface.duplicate":
		"Atajo de superficie duplicado '{key}' en el modo {mode}.",
};
