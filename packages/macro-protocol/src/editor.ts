/**
 * Canonical editor mode vocabulary shared across host, protocol, and browser
 * runtimes. It is defined here (the dependency-free protocol package) so browser
 * code can consume it without importing Macro's Bun/runtime root.
 *
 * `COMMAND` is a separate mode, not a folded `NORMAL` state. Entering `:` changes
 * the input owner to the command line, changes which bindings are active, and has
 * distinct Enter/Escape/submission transitions.
 */
export type EditorMode = "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";
