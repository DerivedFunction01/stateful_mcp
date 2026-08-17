import { TextAttributes } from "@opentui/core";
import { TuiDropdown } from "../../ui/primitives/TuiDropdown";
import { TuiInput } from "../../ui/primitives/TuiInput";
import { TuiTabs } from "../../ui/primitives/TuiTabs";
import { TuiToggle } from "../../ui/primitives/TuiToggle";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

const SCOPES = [
	{ id: "user", label: "User" },
	{ id: "remote", label: "Remote [WSL: ubuntu]" },
	{ id: "workspace", label: "Workspace" },
	{ id: "ide", label: "Antigravity IDE Settings" },
];

interface SettingCategory {
	readonly id: string;
	readonly label: string;
	readonly icon?: string;
	readonly isExpanded?: boolean;
	readonly children?: readonly { id: string; label: string }[];
}

const CATEGORIES: readonly SettingCategory[] = [
	{ id: "commonly-used", label: "Commonly Used", icon: "●" },
	{
		id: "text-editor",
		label: "Text Editor",
		icon: "›",
		isExpanded: true,
		children: [
			{ id: "font", label: "Font" },
			{ id: "formatting", label: "Formatting" },
			{ id: "cursor", label: "Cursor" },
		],
	},
	{
		id: "workbench",
		label: "Workbench",
		icon: "›",
		children: [
			{ id: "appearance", label: "Appearance" },
			{ id: "layout", label: "Layout" },
		],
	},
	{ id: "window", label: "Window", icon: "›" },
	{
		id: "features",
		label: "Features",
		icon: "›",
		children: [
			{ id: "terminal", label: "Terminal" },
			{ id: "explorer", label: "Explorer" },
		],
	},
	{ id: "application", label: "Application", icon: "›" },
	{ id: "security", label: "Security", icon: "›" },
	{ id: "extensions", label: "Extensions", icon: "›" },
];

export const settingsWindowStory: TuiStory = {
	id: "settings-window",
	title: "Settings Window (VS Code Style)",
	category: "Views",
	states: [
		"commonly-used",
		"search-active",
		"content-focused",
		"insert-editing",
		"text-editor-category",
		"narrow",
	],
	render(context) {
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;
		const isNarrow = context.stateId === "narrow";
		const isSearchActive = context.stateId === "search-active";
		const isContentFocused =
			context.stateId === "content-focused" ||
			context.stateId === "insert-editing";
		const isInsertEditing = context.stateId === "insert-editing";
		const isTextEditor = context.stateId === "text-editor-category";

		const totalWidth = isNarrow ? 58 : Math.min(100, context.size.columns - 4);
		const sidebarWidth = isNarrow ? 18 : 24;
		const contentWidth = Math.max(28, totalWidth - sidebarWidth - 4);

		return (
			<box
				flexDirection="column"
				width={totalWidth}
				backgroundColor={c.bgCanvas}
				padding={1}
			>
				{/* 1. Search Bar Header */}
				<box
					flexDirection="row"
					alignItems="center"
					borderStyle="single"
					borderColor={isSearchActive ? c.borderActive : c.borderDefault}
					backgroundColor={c.bgSurface}
					paddingLeft={1}
					paddingRight={1}
					height={3}
					marginBottom={1}
				>
					<text fg={isSearchActive ? c.accentPrimary : c.fgMuted}>🔍 </text>
					<text
						fg={isSearchActive ? c.fgPrimary : c.fgDim}
						attributes={isSearchActive ? TextAttributes.BOLD : 0}
					>
						{isSearchActive ? "autosave" : "Search settings"}
					</text>
					{isSearchActive && (
						<text fg={c.accentPeach} attributes={TextAttributes.BOLD}>
							▌
						</text>
					)}
					<box flexGrow={1} />
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						⚡ Filter
					</text>
				</box>

				{/* 2. Scope Bar (Sub-tabs below search) */}
				<box height={1} marginBottom={1} flexDirection="row">
					<TuiTabs
						tabs={SCOPES}
						activeTabId={isTextEditor ? "workspace" : "user"}
						theme={theme}
					/>
				</box>

				{/* 3. Main Stage: Two-column split */}
				<box flexDirection="row" flexGrow={1}>
					{/* Left Category Navigation Sidebar */}
					<box
						width={sidebarWidth}
						flexDirection="column"
						paddingRight={1}
						borderStyle="single"
						borderColor={
							!isContentFocused && !isSearchActive
								? c.borderActive
								: c.borderSubtle
						}
					>
						{CATEGORIES.map((cat) => {
							const isSelected = isTextEditor
								? cat.id === "text-editor"
								: cat.id === "commonly-used";

							return (
								<box key={cat.id} flexDirection="column" marginBottom={0}>
									<box
										height={1}
										flexDirection="row"
										backgroundColor={isSelected ? c.bgActive : undefined}
										paddingLeft={1}
									>
										<text
											fg={isSelected ? c.accentPrimary : c.fgSecondary}
											attributes={isSelected ? TextAttributes.BOLD : 0}
										>
											{cat.icon ? `${cat.icon} ` : ""}
											{cat.label}
										</text>
									</box>
									{cat.isExpanded && cat.children && (
										<box flexDirection="column" paddingLeft={3}>
											{cat.children.map((child) => (
												<box key={child.id} height={1}>
													<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
														· {child.label}
													</text>
												</box>
											))}
										</box>
									)}
								</box>
							);
						})}
					</box>

					{/* Right Main Content Area */}
					<box
						flexDirection="column"
						flexGrow={1}
						paddingLeft={2}
						width={contentWidth}
					>
						{/* Category Title */}
						<box height={2} flexDirection="column" marginBottom={1}>
							<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
								{isTextEditor ? "Text Editor" : "Commonly Used"}
							</text>
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								{isTextEditor
									? "Manage editor layout, typography, and formatting behavior."
									: "Frequently configured editor and workbench preferences."}
							</text>
						</box>

						{/* Setting 1: Files: Auto Save (Dropdown) */}
						<box flexDirection="column" marginBottom={1}>
							<box flexDirection="row">
								<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
									Files:{" "}
								</text>
								<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
									Auto Save
								</text>
							</box>
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								Controls auto save of editors that have unsaved changes.
							</text>
							<box marginTop={0}>
								<TuiDropdown
									label=""
									selectedId={isSearchActive ? "afterDelay" : "off"}
									options={[
										{ id: "off", label: "off" },
										{ id: "afterDelay", label: "afterDelay" },
										{ id: "onFocusChange", label: "onFocusChange" },
										{ id: "onWindowChange", label: "onWindowChange" },
									]}
									isFocused={isContentFocused && !isInsertEditing}
									width={Math.min(32, contentWidth - 4)}
									theme={theme}
								/>
							</box>
						</box>

						{/* Setting 2: Editor: Font Size (Input) */}
						<box flexDirection="column" marginBottom={1}>
							<box flexDirection="row">
								<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
									Editor:{" "}
								</text>
								<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
									Font Size
								</text>
							</box>
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								Controls the font size in pixels.
							</text>
							<box marginTop={0}>
								<TuiInput
									label=""
									value={isInsertEditing ? "16▌" : "14"}
									hint={
										isInsertEditing
											? "Enter to commit · Esc to cancel"
											: "Enter to edit"
									}
									isFocused={isInsertEditing}
									width={Math.min(24, contentWidth - 4)}
									theme={theme}
								/>
							</box>
						</box>

						{/* Setting 3: Workbench: Color Theme (Dropdown) */}
						<box flexDirection="column" marginBottom={1}>
							<box flexDirection="row">
								<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
									Workbench:{" "}
								</text>
								<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
									Color Theme
								</text>
							</box>
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								Specifies the color theme used in the workbench.
							</text>
							<box marginTop={0}>
								<TuiDropdown
									label=""
									selectedId="github-dark"
									options={[
										{ id: "github-dark", label: "GitHub Dark" },
										{ id: "github-light", label: "GitHub Light" },
										{ id: "opencode-dark", label: "OpenCode Dark" },
										{ id: "monokai", label: "Monokai Pro" },
										{ id: "nord", label: "Nord Polar Night" },
									]}
									isFocused={false}
									width={Math.min(32, contentWidth - 4)}
									theme={theme}
								/>
							</box>
						</box>

						{/* Setting 4: Editor: Word Wrap (Toggle) */}
						<box flexDirection="column" marginBottom={1}>
							<box flexDirection="row">
								<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
									Editor:{" "}
								</text>
								<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
									Word Wrap
								</text>
							</box>
							<box marginTop={0}>
								<TuiToggle
									label="Wrap lines to viewport width"
									checked={true}
									isFocused={false}
									description="Controls how lines should wrap."
									theme={theme}
								/>
							</box>
						</box>
					</box>
				</box>

				{/* 4. Footer Help / Navigation Bar */}
				<box
					height={1}
					marginTop={1}
					paddingTop={1}
					borderStyle="single"
					borderColor={c.borderSubtle}
					flexDirection="row"
				>
					<text fg={c.statusSuccess} attributes={TextAttributes.BOLD}>
						Saved
					</text>
					<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
						{" · "}User Settings
					</text>
					<box flexGrow={1} />
					<text fg={c.fgDim}>
						j/k navigate · h/l focus · / search · Ctrl+S save · Esc editor
					</text>
				</box>
			</box>
		);
	},
};
