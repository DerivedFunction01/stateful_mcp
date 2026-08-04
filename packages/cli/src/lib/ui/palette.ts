/**
 * Semantic UI palette for the terminal interface.
 *
 * Centralizes Ink color names so components never hardcode color literals.
 * Semantics (not locales) live here; the values are low-level color tokens.
 */
export const palette = {
	/** Section / screen titles. */
	header: "white",
	/** Emphasized tokens (command verbs, key chords). */
	emphasized: "cyan",
	/** Secondary emphasis (cell command verbs). */
	secondary: "yellow",
	/** Descriptive text (command / binding descriptions). */
	description: "white",
	/** Muted metadata (group labels, hints). */
	muted: "gray",
} as const;
