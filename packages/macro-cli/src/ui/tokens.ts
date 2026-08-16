export const TuiColors = {
	bgDark: "#0d1117",
	bgSurface: "#161b22",
	bgHighlight: "#21262d",
	bgActive: "#30363d",

	borderDim: "#30363d",
	borderFocus: "#58a6ff",
	borderSubtle: "#21262d",

	textPrimary: "#f0f6fc",
	textMuted: "#8b949e",
	textDim: "#484f58",
	textInverse: "#0d1117",

	accentAmber: "#f0883e",
	accentCyan: "#38bdf8",
	accentPurple: "#bc8cff",
	accentBlue: "#58a6ff",

	statusSuccess: "#3fb950",
	statusWarning: "#d29922",
	statusError: "#f85149",
	statusInfo: "#58a6ff",
} as const;

export const TuiNamedColors = {
	primary: "white",
	muted: "gray",
	dim: "gray",
	accent: "cyan",
	amber: "yellow",
	purple: "magenta",
	success: "green",
	warning: "yellow",
	error: "red",
	info: "cyan",
	border: "gray",
	borderActive: "cyan",
} as const;

export interface TuiBoxGlyphs {
	readonly topLeft: string;
	readonly topRight: string;
	readonly bottomLeft: string;
	readonly bottomRight: string;
	readonly horizontal: string;
	readonly vertical: string;
	readonly cross: string;
	readonly teeDown: string;
	readonly teeUp: string;
	readonly teeRight: string;
	readonly teeLeft: string;
}

export const TuiGlyphs = {
	single: {
		topLeft: "┌",
		topRight: "┐",
		bottomLeft: "└",
		bottomRight: "┘",
		horizontal: "─",
		vertical: "│",
		cross: "┼",
		teeDown: "┬",
		teeUp: "┴",
		teeRight: "├",
		teeLeft: "┤",
	} as TuiBoxGlyphs,
	rounded: {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
		cross: "┼",
		teeDown: "┬",
		teeUp: "┴",
		teeRight: "├",
		teeLeft: "┤",
	} as TuiBoxGlyphs,
	double: {
		topLeft: "╔",
		topRight: "╗",
		bottomLeft: "╚",
		bottomRight: "╝",
		horizontal: "═",
		vertical: "║",
		cross: "╬",
		teeDown: "╦",
		teeUp: "╩",
		teeRight: "╠",
		teeLeft: "╣",
	} as TuiBoxGlyphs,
	ascii: {
		topLeft: "+",
		topRight: "+",
		bottomLeft: "+",
		bottomRight: "+",
		horizontal: "-",
		vertical: "|",
		cross: "+",
		teeDown: "+",
		teeUp: "+",
		teeRight: "+",
		teeLeft: "+",
	} as TuiBoxGlyphs,
	connectors: {
		treeBranch: "├── ",
		treeLast: "└── ",
		treeVertical: "│   ",
		projection: "↳ ",
		arrowRight: "→ ",
		check: "✓",
		alert: "!",
		bullet: "●",
		dot: "·",
		cursor: "█",
	},
	connectorsAscii: {
		treeBranch: "|-- ",
		treeLast: "+-- ",
		treeVertical: "|   ",
		projection: "-> ",
		arrowRight: "-> ",
		check: "[v]",
		alert: "[!]",
		bullet: "*",
		dot: "-",
		cursor: "#",
	},
} as const;

export const TuiLayoutMetrics = {
	minActivityRailWidth: 5,
	minSidepanelWidth: 26,
	minStageWidth: 36,
	minContentHeight: 8,
	modalMinWidth: 46,
	modalMaxWidth: 80,
	statusBarHeight: 1,
	helpBarHeight: 1,
	tabStripHeight: 1,
} as const;
