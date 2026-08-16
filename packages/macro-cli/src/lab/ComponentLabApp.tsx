import { useEffect, useState } from "react";
import { TextAttributes, type CliRenderer } from "@opentui/core";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";
import { translate } from "../locales";
import { TuiNamedColors } from "../ui/tokens";
import { createMockWorkspace } from "./mock-workspace";
import { globalStoryRegistry, type TuiStoryRegistry } from "./story-registry";
import type { TerminalSize, TuiStoryContext } from "./story-contract";

export interface ComponentLabAppProps {
	readonly renderer: CliRenderer;
	readonly registry?: TuiStoryRegistry;
	readonly initialStoryId?: string;
	readonly initialWorkspace?: MacroWorkspace;
	readonly initialKeymap?: EditorKeymapProfile;
	readonly onExit?: () => void;
}

const SIZE_PRESETS: readonly { readonly name: string; readonly size: (w: number, h: number) => TerminalSize }[] = [
	{ name: "Fill", size: (w, h) => ({ columns: w, rows: h }) },
	{ name: "80×24", size: () => ({ columns: 80, rows: 24 }) },
	{ name: "120×35", size: () => ({ columns: 120, rows: 35 }) },
	{ name: "160×45", size: () => ({ columns: 160, rows: 45 }) },
];

export function ComponentLabApp({
	renderer,
	registry = globalStoryRegistry,
	initialStoryId,
	initialWorkspace,
	initialKeymap,
	onExit,
}: ComponentLabAppProps) {
	const stories = registry.listStories();

	const initialIndex = initialStoryId
		? Math.max(0, stories.findIndex((s) => s.id === initialStoryId))
		: 0;

	const [storyIndex, setStoryIndex] = useState(initialIndex);
	const [stateIndex, setStateIndex] = useState(0);
	const [sizePresetIndex, setSizePresetIndex] = useState(0);
	const [showBounds, setShowBounds] = useState(false);
	const [reloadCount, setReloadCount] = useState(0);

	// In-memory mock workspace for isolated deterministic rendering
	const [fixtureWorkspace, setFixtureWorkspace] = useState(() =>
		initialWorkspace && initialKeymap
			? { workspace: initialWorkspace, keymap: initialKeymap }
			: createMockWorkspace(),
	);

	const currentStory = stories[storyIndex] ?? stories[0];
	const states = currentStory?.states ?? ["default"];
	const currentState = states[stateIndex % states.length] ?? "default";

	const currentPreset = SIZE_PRESETS[sizePresetIndex % SIZE_PRESETS.length]!;
	const effectiveSize = currentPreset.size(renderer.width, renderer.height);

	useEffect(() => {
		setStateIndex(0);
	}, [storyIndex]);

	useEffect(() => {
		const handleKeypress = (key: { name: string; sequence: string; ctrl: boolean; meta: boolean; shift: boolean }) => {
			const name = key.name;
			const input = key.sequence;

			if (name === "escape" || (key.ctrl && input.toLowerCase() === "c")) {
				onExit?.();
				renderer.destroy();
				return;
			}

			if (name === "up") {
				setStoryIndex((prev) => (prev > 0 ? prev - 1 : stories.length - 1));
				return;
			}

			if (name === "down") {
				setStoryIndex((prev) => (prev < stories.length - 1 ? prev + 1 : 0));
				return;
			}

			if (name === "left") {
				setStateIndex((prev) => (prev > 0 ? prev - 1 : states.length - 1));
				return;
			}

			if (name === "right") {
				setStateIndex((prev) => (prev < states.length - 1 ? prev + 1 : 0));
				return;
			}

			if (name === "s" || input === "s") {
				setSizePresetIndex((prev) => (prev + 1) % SIZE_PRESETS.length);
				return;
			}

			if (name === "b" || input === "b") {
				setShowBounds((prev) => !prev);
				return;
			}

			if (name === "r" || input === "r") {
				setReloadCount((prev) => prev + 1);
				setFixtureWorkspace(createMockWorkspace());
				return;
			}
		};

		renderer.keyInput.on("keypress", handleKeypress);
		return () => {
			renderer.keyInput.off("keypress", handleKeypress);
		};
	}, [onExit, renderer, states.length, stories.length]);

	const storyContext: TuiStoryContext = {
		storyId: currentStory?.id ?? "unknown",
		stateId: currentState,
		size: effectiveSize,
		workspace: fixtureWorkspace.workspace,
		keymap: fixtureWorkspace.keymap,
		showBounds,
	};

	const renderedStory = currentStory ? currentStory.render(storyContext) : null;

	const navWidth = Math.min(26, Math.max(20, Math.floor(renderer.width * 0.22)));
	const previewWidth = renderer.width - navWidth - 1;
	const bodyHeight = Math.max(10, renderer.height - 4);

	return (
		<box flexDirection="column" width="100%" height="100%">
			{/* Top Header */}
			<box height={1} borderStyle="single" borderColor="cyan" paddingLeft={1} paddingRight={1} flexDirection="row">
				<text fg="cyan" attributes={TextAttributes.BOLD}>
					{translate(fixtureWorkspace.workspace.i18n, "lab.title", "Macro CLI Component Lab")}
				</text>
				<box flexGrow={1} />
				<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
					preset: {currentPreset.name} ({effectiveSize.columns}×{effectiveSize.rows})
				</text>
			</box>

			{/* Main Split: Navigation & Preview */}
			<box flexGrow={1} flexDirection="row">
				{/* Left Navigation Rail */}
				<box
					width={navWidth}
					height={bodyHeight}
					borderStyle="single"
					borderColor={TuiNamedColors.border}
					flexDirection="column"
					paddingLeft={1}
					paddingRight={1}
				>
					<box height={1} marginBottom={1}>
						<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
							{translate(fixtureWorkspace.workspace.i18n, "lab.components", "Components")} ({stories.length})
						</text>
					</box>
					{stories.map((s, idx) => {
						const isSelected = idx === storyIndex;
						return (
							<box key={s.id} height={1}>
								<text
									attributes={isSelected ? TextAttributes.INVERSE | TextAttributes.BOLD : 0}
									fg={isSelected ? "yellow" : TuiNamedColors.primary}
								>
									{isSelected ? "> " : "  "}{s.title}
								</text>
							</box>
						);
					})}
				</box>

				{/* Right Stage: Bounded Preview Canvas */}
				<box
					width={previewWidth}
					height={bodyHeight}
					borderStyle="single"
					borderColor={showBounds ? "magenta" : TuiNamedColors.border}
					flexDirection="column"
					paddingLeft={1}
					paddingRight={1}
				>
					<box height={1} marginBottom={1} flexDirection="row">
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
							{currentStory?.title ?? "Story"}
						</text>
						<text fg="yellow">
							{" "}[state: {currentState}]
						</text>
						{showBounds && (
							<text fg="magenta" attributes={TextAttributes.DIM}>
								{" "}[bounds ON]
							</text>
						)}
						<box flexGrow={1} />
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							state {stateIndex + 1}/{states.length}
						</text>
					</box>

					<box flexGrow={1} key={`${currentStory?.id}-${currentState}-${reloadCount}`}>
						{renderedStory}
					</box>
				</box>
			</box>

			{/* Bottom Status & Key Legend Bar */}
			<box height={2} borderStyle="single" borderColor={TuiNamedColors.border} paddingLeft={1} paddingRight={1} flexDirection="column">
				<box height={1} flexDirection="row">
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						Story:{" "}
					</text>
					<text fg={TuiNamedColors.primary}>
						{currentStory?.id}  
					</text>
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						State:{" "}
					</text>
					<text fg={TuiNamedColors.primary}>
						{currentState}  
					</text>
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						Size:{" "}
					</text>
					<text fg={TuiNamedColors.primary}>
						{effectiveSize.columns}×{effectiveSize.rows}  
					</text>
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						Bounds:{" "}
					</text>
					<text fg={showBounds ? "magenta" : TuiNamedColors.muted}>
						{showBounds ? "ON" : "OFF"}
					</text>
				</box>
				<box height={1}>
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						{translate(fixtureWorkspace.workspace.i18n, "lab.shortcuts", "↑↓ component  ←→ state  s size  b bounds  r reload  Esc exit")}
					</text>
				</box>
			</box>
		</box>
	);
}
