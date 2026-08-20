import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createBrowserVimController } from "../lib/browser-vim";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";
import { useI18n } from "../lib/macro-i18n-provider";
import { StatusBar } from "./StatusBar";
import { Badge, Toggle } from "./ui/primitives";

export function BrowserEditorFixture() {
	const { t } = useI18n();
	const registry = useEditorSurfaceRegistry();
	const [notice, setNotice] = useState<string>();
	const [controller] = useState(() =>
		createBrowserVimController(true, {
			onCommandModeUnsupported: () =>
				setNotice(t("editor.commandModeUnsupported")),
		}),
	);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [editorFocused, setEditorFocused] = useState(false);
	const state = useSyncExternalStore(
		(listener) => controller.subscribe(listener),
		() => controller.getState(),
	);
	const surfaceId = "fixture:editor";
	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		registry.register({
			id: surfaceId,
			element,
			focused: editorFocused,
			context: { focusedRegion: "main" },
			vimEnabled: state.enabled,
			mode: state.enabled ? state.mode : undefined,
		});
		return () => registry.unregister(surfaceId);
	}, [registry, surfaceId]);
	useEffect(() => {
		registry.update(surfaceId, {
			focused: editorFocused,
			context: { focusedRegion: "main" },
			vimEnabled: state.enabled,
			mode: state.enabled ? state.mode : undefined,
		});
	}, [registry, surfaceId, editorFocused, state.enabled, state.mode]);
	return (
		<div className="browser-editor-fixture" ref={containerRef}>
			<div className="mode-row">
				<Toggle
					label={t("editor.toggleVim")}
					checked={state.enabled}
					onChange={(enabled) => controller.setEnabled(enabled)}
				/>
				{state.enabled && <Badge tone="accent">{state.mode}</Badge>}
			</div>
			{notice && <p className="fixture-notice">{notice}</p>}
			<textarea
				className="browser-editor-input"
				defaultValue=""
				aria-label={t("workbench.editor")}
				onFocus={() => setEditorFocused(true)}
				onBlur={() => setEditorFocused(false)}
				onKeyDown={(event) => {
					if (controller.handleKeyDown(event)) event.preventDefault();
				}}
			/>
			<StatusBar
				vimEnabled={state.enabled}
				vimMode={state.enabled ? state.mode : undefined}
				editorFocused={editorFocused}
				diagnostics={0}
				profile={t("host.profile")}
				domain={t("common.editor")}
			/>
		</div>
	);
}
