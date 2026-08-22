export const EN_SETTINGS_APPLICATION: Record<string, string> = {
	"settings.schema.app.locale.title": "UI Language",
	"settings.schema.app.locale.desc":
		"Active display language for the user interface.",
	"settings.schema.app.storage.title": "Preferences Storage Engine",
	"settings.schema.app.storage.desc":
		"Storage driver used for client-side durability and host synchronization.",
	"settings.schema.app.storage.indexeddb": "IndexedDB (Default browser store)",
	"settings.schema.app.storage.localstorage": "LocalStorage (Fallback store)",
	"settings.schema.app.storage.memory": "Memory (Ephemeral - testing)",
	"settings.schema.app.storage.jsonl": "Server JSONL (WAL persistent log)",
	"settings.schema.app.keybindings.title": "Keyboard Shortcuts",
	"settings.schema.app.keybindings.desc":
		"Custom keyboard shortcut bindings and command overrides.",
};
