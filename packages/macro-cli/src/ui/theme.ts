export interface TuiThemeColors {
	// Backgrounds
	readonly bgCanvas: string;
	readonly bgSurface: string;
	readonly bgElevated: string;
	readonly bgActive: string;
	readonly bgHover: string;
	readonly bgSelect: string;
	readonly bgSelectText: string;

	// Foregrounds & Text
	readonly fgPrimary: string;
	readonly fgSecondary: string;
	readonly fgMuted: string;
	readonly fgDim: string;
	readonly fgInverse: string;

	// Cursor Contrast
	readonly cursorBg: string;
	readonly cursorFg: string;

	// Borders & Rules
	readonly borderSubtle: string;
	readonly borderDefault: string;
	readonly borderActive: string;

	// Accents & Categories
	readonly accentPrimary: string;
	readonly accentSecondary: string;
	readonly accentAmber: string;
	readonly accentPeach: string;

	// Semantic Status
	readonly statusSuccess: string;
	readonly statusWarning: string;
	readonly statusError: string;
	readonly statusInfo: string;

	// Mode Badges
	readonly modeNormalBg: string;
	readonly modeInsertBg: string;
	readonly modeVisualBg: string;
	readonly modeCommandBg: string;
	readonly modeBadgeFg: string;
}

export interface TuiThemeDefinition {
	readonly id: string;
	readonly name: string;
	readonly mode: "dark" | "light";
	readonly colors: TuiThemeColors;
}

// 1. GitHub Dark (Default)
export const GITHUB_DARK_THEME: TuiThemeDefinition = {
	id: "github-dark",
	name: "GitHub Dark",
	mode: "dark",
	colors: {
		bgCanvas: "#0d1117",
		bgSurface: "#161b22",
		bgElevated: "#21262d",
		bgActive: "#30363d",
		bgHover: "#282e37",
		bgSelect: "#fdba74",
		bgSelectText: "#0d1117",

		fgPrimary: "#f0f6fc",
		fgSecondary: "#c9d1d9",
		fgMuted: "#8b949e",
		fgDim: "#484f58",
		fgInverse: "#0d1117",

		cursorBg: "#fdba74",
		cursorFg: "#0d1117",

		borderSubtle: "#21262d",
		borderDefault: "#30363d",
		borderActive: "#58a6ff",

		accentPrimary: "#38bdf8",
		accentSecondary: "#a78bfa",
		accentAmber: "#f59e0b",
		accentPeach: "#fdba74",

		statusSuccess: "#3fb950",
		statusWarning: "#d29922",
		statusError: "#f85149",
		statusInfo: "#58a6ff",

		modeNormalBg: "#2ea043",
		modeInsertBg: "#38bdf8",
		modeVisualBg: "#a371f7",
		modeCommandBg: "#f59e0b",
		modeBadgeFg: "#0d1117",
	},
};

// 2. GitHub Light (Full Light Mode Support)
export const GITHUB_LIGHT_THEME: TuiThemeDefinition = {
	id: "github-light",
	name: "GitHub Light",
	mode: "light",
	colors: {
		bgCanvas: "#ffffff",
		bgSurface: "#f6f8fa",
		bgElevated: "#eaeef2",
		bgActive: "#d0d7de",
		bgHover: "#e2e8f0",
		bgSelect: "#0969da",
		bgSelectText: "#ffffff",

		fgPrimary: "#1f2328",
		fgSecondary: "#57606a",
		fgMuted: "#656d76",
		fgDim: "#8c959f",
		fgInverse: "#ffffff",

		cursorBg: "#0969da",
		cursorFg: "#ffffff",

		borderSubtle: "#d8dee4",
		borderDefault: "#d0d7de",
		borderActive: "#0969da",

		accentPrimary: "#0969da",
		accentSecondary: "#8250df",
		accentAmber: "#9a6700",
		accentPeach: "#bc4c00",

		statusSuccess: "#1a7f37",
		statusWarning: "#9a6700",
		statusError: "#cf222e",
		statusInfo: "#0969da",

		modeNormalBg: "#1a7f37",
		modeInsertBg: "#0969da",
		modeVisualBg: "#8250df",
		modeCommandBg: "#9a6700",
		modeBadgeFg: "#ffffff",
	},
};

// 3. OpenCode Dark
export const OPENCODE_DARK_THEME: TuiThemeDefinition = {
	id: "opencode-dark",
	name: "OpenCode Dark",
	mode: "dark",
	colors: {
		bgCanvas: "#121417",
		bgSurface: "#1a1d23",
		bgElevated: "#22272e",
		bgActive: "#2d333b",
		bgHover: "#282e37",
		bgSelect: "#fdba74",
		bgSelectText: "#0d1117",

		fgPrimary: "#e6edf3",
		fgSecondary: "#adbac7",
		fgMuted: "#768390",
		fgDim: "#545d68",
		fgInverse: "#121417",

		cursorBg: "#fdba74",
		cursorFg: "#0d1117",

		borderSubtle: "#22272e",
		borderDefault: "#373e47",
		borderActive: "#58a6ff",

		accentPrimary: "#38bdf8",
		accentSecondary: "#c084fc",
		accentAmber: "#fbbf24",
		accentPeach: "#fdba74",

		statusSuccess: "#4ade80",
		statusWarning: "#fbbf24",
		statusError: "#f87171",
		statusInfo: "#38bdf8",

		modeNormalBg: "#22c55e",
		modeInsertBg: "#38bdf8",
		modeVisualBg: "#c084fc",
		modeCommandBg: "#fbbf24",
		modeBadgeFg: "#0d1117",
	},
};

// 4. Monokai Pro
export const MONOKAI_THEME: TuiThemeDefinition = {
	id: "monokai",
	name: "Monokai Pro",
	mode: "dark",
	colors: {
		bgCanvas: "#2d2a2e",
		bgSurface: "#363337",
		bgElevated: "#403e41",
		bgActive: "#4d4a4e",
		bgHover: "#454347",
		bgSelect: "#ffd866",
		bgSelectText: "#2d2a2e",

		fgPrimary: "#fcfcfa",
		fgSecondary: "#c1c0c0",
		fgMuted: "#939293",
		fgDim: "#727072",
		fgInverse: "#2d2a2e",

		cursorBg: "#ffd866",
		cursorFg: "#2d2a2e",

		borderSubtle: "#403e41",
		borderDefault: "#4d4a4e",
		borderActive: "#78dce8",

		accentPrimary: "#78dce8",
		accentSecondary: "#ab9df2",
		accentAmber: "#ffd866",
		accentPeach: "#fc9867",

		statusSuccess: "#a9dc76",
		statusWarning: "#ffd866",
		statusError: "#ff6188",
		statusInfo: "#78dce8",

		modeNormalBg: "#a9dc76",
		modeInsertBg: "#78dce8",
		modeVisualBg: "#ab9df2",
		modeCommandBg: "#ffd866",
		modeBadgeFg: "#2d2a2e",
	},
};

// 5. Nord Polar Night
export const NORD_THEME: TuiThemeDefinition = {
	id: "nord",
	name: "Nord Polar Night",
	mode: "dark",
	colors: {
		bgCanvas: "#2e3440",
		bgSurface: "#3b4252",
		bgElevated: "#434c5e",
		bgActive: "#4c566a",
		bgHover: "#434c5e",
		bgSelect: "#88c0d0",
		bgSelectText: "#2e3440",

		fgPrimary: "#eceff4",
		fgSecondary: "#e5e9f0",
		fgMuted: "#d8dee9",
		fgDim: "#4c566a",
		fgInverse: "#2e3440",

		cursorBg: "#88c0d0",
		cursorFg: "#2e3440",

		borderSubtle: "#3b4252",
		borderDefault: "#4c566a",
		borderActive: "#88c0d0",

		accentPrimary: "#88c0d0",
		accentSecondary: "#b48ead",
		accentAmber: "#ebcb8b",
		accentPeach: "#d08770",

		statusSuccess: "#a3be8c",
		statusWarning: "#ebcb8b",
		statusError: "#bf616a",
		statusInfo: "#81a1c1",

		modeNormalBg: "#a3be8c",
		modeInsertBg: "#88c0d0",
		modeVisualBg: "#b48ead",
		modeCommandBg: "#ebcb8b",
		modeBadgeFg: "#2e3440",
	},
};

export class TuiThemeRegistry {
	private readonly themes = new Map<string, TuiThemeDefinition>();
	private activeThemeId = "github-dark";

	constructor() {
		this.register(GITHUB_DARK_THEME);
		this.register(GITHUB_LIGHT_THEME);
		this.register(OPENCODE_DARK_THEME);
		this.register(MONOKAI_THEME);
		this.register(NORD_THEME);
	}

	register(theme: TuiThemeDefinition): void {
		this.themes.set(theme.id, theme);
	}

	get(id: string): TuiThemeDefinition | undefined {
		return this.themes.get(id);
	}

	getActive(): TuiThemeDefinition {
		return this.themes.get(this.activeThemeId) ?? GITHUB_DARK_THEME;
	}

	setActive(id: string): boolean {
		if (this.themes.has(id)) {
			this.activeThemeId = id;
			return true;
		}
		return false;
	}

	list(): readonly TuiThemeDefinition[] {
		return Array.from(this.themes.values());
	}
}

export const GlobalThemeRegistry = new TuiThemeRegistry();

/**
 * Generates browser web application CSS custom property tokens from a theme definition.
 */
export function generateCssThemeVariables(theme: TuiThemeDefinition): string {
	const c = theme.colors;
	return `
:root {
  --theme-id: "${theme.id}";
  --theme-mode: "${theme.mode}";
  --color-bg-canvas: ${c.bgCanvas};
  --color-bg-surface: ${c.bgSurface};
  --color-bg-elevated: ${c.bgElevated};
  --color-bg-active: ${c.bgActive};
  --color-bg-hover: ${c.bgHover};
  --color-bg-select: ${c.bgSelect};
  --color-bg-select-text: ${c.bgSelectText};

  --color-fg-primary: ${c.fgPrimary};
  --color-fg-secondary: ${c.fgSecondary};
  --color-fg-muted: ${c.fgMuted};
  --color-fg-dim: ${c.fgDim};
  --color-fg-inverse: ${c.fgInverse};

  --color-cursor-bg: ${c.cursorBg};
  --color-cursor-fg: ${c.cursorFg};

  --color-border-subtle: ${c.borderSubtle};
  --color-border-default: ${c.borderDefault};
  --color-border-active: ${c.borderActive};

  --color-accent-primary: ${c.accentPrimary};
  --color-accent-secondary: ${c.accentSecondary};
  --color-accent-amber: ${c.accentAmber};
  --color-accent-peach: ${c.accentPeach};

  --color-status-success: ${c.statusSuccess};
  --color-status-warning: ${c.statusWarning};
  --color-status-error: ${c.statusError};
  --color-status-info: ${c.statusInfo};
}
`.trim();
}
