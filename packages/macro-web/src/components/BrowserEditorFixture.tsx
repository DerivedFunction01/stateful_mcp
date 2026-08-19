import { useState, useSyncExternalStore } from "react";
import { createBrowserVimController } from "../lib/browser-vim";
import { StatusBar } from "./StatusBar";
import { Badge, Toggle } from "./ui/primitives";

export function BrowserEditorFixture() {
	const [controller] = useState(() => createBrowserVimController(true));
	const [editorFocused, setEditorFocused] = useState(false);
	const state = useSyncExternalStore(
		(listener) => controller.subscribe(listener),
		() => controller.getState(),
	);
	return (
		<div className="browser-editor-fixture">
			<div className="mode-row">
				<Toggle label="Enable Vim bindings for this editor" checked={state.enabled} onChange={(enabled) => controller.setEnabled(enabled)} />
				{state.enabled && <Badge tone="accent">{state.mode}</Badge>}
			</div>
			<textarea
				className="browser-editor-input"
				defaultValue={'@note(date="2026-08-19", title="Review")'}
				aria-label="Scratchpad editor fixture"
				onFocus={() => setEditorFocused(true)}
				onBlur={() => setEditorFocused(false)}
				onKeyDown={(event) => {
					if (controller.handleKeyDown(event)) event.preventDefault();
				}}
			/>
			<StatusBar vimEnabled={state.enabled} vimMode={state.mode} editorFocused={editorFocused} diagnostics={1} profile="Clinical" domain="Notes" />
		</div>
	);
}
