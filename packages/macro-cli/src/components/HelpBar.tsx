import { TextAttributes } from "@opentui/core";

export function HelpBar() {
	return (
		<box paddingLeft={1}>
			<text attributes={TextAttributes.DIM}>Ctrl+P Palette · Ctrl+B Sidepanel · Alt+P Pin · Ctrl+Enter Run · Ctrl+C Quit</text>
		</box>
	);
}
