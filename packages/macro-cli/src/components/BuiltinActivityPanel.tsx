import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { TuiInput } from "../ui/primitives/TuiInput";
import { TuiList } from "../ui/primitives/TuiList";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

export function BuiltinActivityPanel({
	workspace,
	keymap,
	kind,
	theme,
	width,
	activeProfile,
	resolvedExtensionIds = [],
}: {
	workspace: MacroWorkspace;
	keymap?: EditorKeymapProfile;
	kind: "settings" | "extensions";
	theme?: TuiThemeDefinition;
	width: number;
	activeProfile?: string;
	resolvedExtensionIds?: readonly string[];
}) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	if (kind === "settings") {
		const profile = workspace.profile;
		const entries = [
			{
				id: "theme",
				label: "Appearance",
				detail: "Theme and terminal presentation",
			},
			{ id: "locale", label: "Locale", detail: profile?.locale ?? "en" },
			{
				id: "dateTime",
				label: "Date and time",
				detail: profile?.dateTime
					? `${Object.keys(profile.dateTime.formats).length} formats`
					: profile?.date
						? "Legacy date format"
						: "Default formats",
			},
			{ id: "keymap", label: "Keymap", detail: keymap?.profileId ?? "default" },
			{
				id: "raw",
				label: "Raw configuration",
				detail: "Inspect profile and keymap JSON",
			},
			...workspace.settingsContributions.list().map((entry) => ({
				id: entry.namespace,
				label: entry.title,
				detail: `${entry.schema.length} setting${entry.schema.length === 1 ? "" : "s"} · ${entry.extensionId}`,
			})),
		];
		const selectedIndex = Math.max(
			0,
			entries.findIndex(
				(entry) =>
					entry.id === workspace.settingsNavigation.getSnapshot().section,
			),
		);
		const selectedEntry = entries[selectedIndex];
		const contribution = selectedEntry
			? workspace.settingsContributions.get(selectedEntry.id)
			: undefined;
		const settings = workspace.settings;
		const schema = contribution?.normalizedSchema ?? [];
		const diagnostics = settings?.getDiagnostics() ?? [];
		const setValue = (path: readonly string[], value: unknown) =>
			settings?.setPath(path, value);
		const renderSetting = (entry: (typeof schema)[number]) => {
			const value = settings?.getPath(entry.path);
			const diagnostic = diagnostics.find(
				(item) => item.path?.join(".") === entry.path.join("."),
			);
			const hint =
				diagnostic?.message ??
				entry.description ??
				`${entry.type}${entry.restartRequired ? " · restart required" : ""}`;
			if (entry.type === "boolean") {
				return (
					<box
						key={entry.path.join(".")}
						flexDirection="column"
						onMouseDown={(event) => {
							if (event.button === 0) setValue(entry.path, value !== true);
						}}
					>
						<text fg={diagnostic ? c.statusError : c.fgPrimary}>
							{value === true ? "[ON]" : "[OFF]"} {entry.title}
						</text>
						<text fg={diagnostic ? c.statusError : c.fgMuted}>{hint}</text>
					</box>
				);
			}
			if (entry.type === "enum") {
				const values = entry.enumValues ?? [];
				return (
					<box
						key={entry.path.join(".")}
						flexDirection="column"
						onMouseDown={(event) => {
							if (event.button === 0 && values.length > 0) {
								const index = values.indexOf(String(value));
								setValue(entry.path, values[(index + 1) % values.length]);
							}
						}}
					>
						<text fg={diagnostic ? c.statusError : c.fgPrimary}>
							{entry.title}: {String(value ?? "(unset)")}
						</text>
						<text fg={diagnostic ? c.statusError : c.fgMuted}>
							{hint} · click to cycle
						</text>
					</box>
				);
			}
			if (entry.type === "number") {
				const numeric = typeof value === "number" ? value : 0;
				const step =
					entry.max !== undefined && entry.min !== undefined
						? Math.max((entry.max - entry.min) / 10, 1)
						: 1;
				return (
					<box
						key={entry.path.join(".")}
						flexDirection="column"
						onMouseDown={(event) => {
							if (event.button === 0)
								setValue(
									entry.path,
									entry.max !== undefined
										? Math.min(entry.max, numeric + step)
										: numeric + step,
								);
						}}
					>
						<text fg={diagnostic ? c.statusError : c.fgPrimary}>
							{entry.title}: {String(value ?? 0)}
						</text>
						<text fg={diagnostic ? c.statusError : c.fgMuted}>
							{hint} · click to increment
						</text>
					</box>
				);
			}
			return (
				<TuiInput
					key={entry.path.join(".")}
					label={entry.title}
					value={value === undefined ? "" : JSON.stringify(value)}
					hint={hint}
					intent={diagnostic ? "error" : "default"}
					isReadOnly
					width={Math.max(24, width - 4)}
					theme={theme}
				/>
			);
		};
		return (
			<box flexDirection="column" padding={1} width={width}>
				<text fg={c.fgPrimary} attributes={1}>
					Settings
				</text>
				<text fg={c.fgMuted}>Runtime configuration and formatting</text>
				<box flexDirection="row" flexGrow={1}>
					<box width={Math.max(24, Math.floor(width * 0.42))}>
						<TuiList
							items={entries.map((entry) => ({
								id: entry.id,
								title: entry.label,
								description: entry.detail,
							}))}
							selectedIndex={selectedIndex}
							onHighlightChange={(index) => {
								const entry = entries[index];
								if (entry)
									workspace.settingsNavigation.open({ section: entry.id });
							}}
							onSelect={(_id, index) => {
								const entry = entries[index];
								if (entry)
									workspace.settingsNavigation.open({ section: entry.id });
							}}
							theme={theme}
						/>
					</box>
					<box flexDirection="column" flexGrow={1} paddingLeft={1}>
						<text fg={c.fgPrimary} attributes={1}>
							{selectedEntry?.label ?? "Settings"}
						</text>
						{contribution?.description && (
							<text fg={c.fgMuted}>{contribution.description}</text>
						)}
						{schema.length > 0 ? (
							schema.map(renderSetting)
						) : (
							<text fg={c.fgMuted}>
								Use Raw configuration to inspect or edit this section.
							</text>
						)}
						{diagnostics.length > 0 && (
							<text fg={c.statusError}>
								{diagnostics.length} validation issue
								{diagnostics.length === 1 ? "" : "s"}
							</text>
						)}
						<box flexDirection="row" marginTop={1}>
							<box
								paddingRight={2}
								onMouseDown={() => {
									void workspace.commands.executeCommand(
										"workspace.saveActive",
									);
								}}
							>
								<text fg={c.accentPrimary}>[ Save ]</text>
							</box>
							<box
								paddingRight={2}
								onMouseDown={() => {
									void settings?.reset();
								}}
							>
								<text fg={c.statusWarning}>[ Reset ]</text>
							</box>
							<box
								onMouseDown={() => {
									void settings?.reload();
								}}
							>
								<text fg={c.fgMuted}>[ Reload ]</text>
							</box>
						</box>
						{settings?.isDirty() && (
							<text fg={c.statusWarning}>Unsaved changes</text>
						)}
					</box>
				</box>
			</box>
		);
	}

	const snapshots = workspace.contributions.getRuntimeSnapshots();
	return (
		<box flexDirection="column" padding={1} width={width}>
			<text fg={c.fgPrimary} attributes={1}>
				Extensions
			</text>
			<text fg={c.fgMuted}>
				{activeProfile ? `Profile: ${activeProfile} · ` : ""}
				{snapshots.length} active extension{snapshots.length === 1 ? "" : "s"}
			</text>
			{resolvedExtensionIds.length > 0 && (
				<text fg={c.fgDim}>Resolved: {resolvedExtensionIds.join(", ")}</text>
			)}
			<TuiList
				items={snapshots.map((snapshot) => ({
					id: snapshot.id,
					title: snapshot.id,
					description: `${snapshot.version} · ${snapshot.contributions.views.length} views · ${snapshot.contributions.commands.length} commands`,
				}))}
				selectedIndex={0}
				emptyMessage="No active extensions"
				theme={theme}
			/>
		</box>
	);
}
