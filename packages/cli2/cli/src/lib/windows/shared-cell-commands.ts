import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { VariableCommandProvider } from "@stateful-mcp/clinical/session/variable-command-provider";

/** Commands available to every window that can host cells. */
export function getSharedCellCommandDescriptors(): CommandDescriptor[] {
	return new VariableCommandProvider().getDescriptors();
}

/** Keeps cell-input classification aligned with the shared command bundle. */
export function isSharedVariableCommand(verb: string): boolean {
	return getSharedCellCommandDescriptors().some(
		(descriptor) =>
			descriptor.verb.toLowerCase() === verb.toLowerCase() ||
			descriptor.aliases.some(
				(alias) => alias.toLowerCase() === verb.toLowerCase(),
			),
	);
}
