import { ClinicalBootstrap } from "@stateful-mcp/clinical/bootstrap/bootstrap";
import {
	buildCli2Bootstrap,
	Cli2BootstrapBuilder,
	type Cli2BootstrapOptions,
	type Cli2BootstrapResult,
} from "./cli2-bootstrap";

export type BootstrapResult = Cli2BootstrapResult;

/** Default CLI2 session entrypoint. Uses the in-memory  composition. */
export async function bootstrapSession(
	options: Cli2BootstrapOptions = {},
): Promise<BootstrapResult> {
	return buildCli2Bootstrap({
		...options,
		clinical:
			options.clinical ??
			(await ClinicalBootstrap.withDefaultBackend("memory", {
				syntaxProfile: options.syntaxProfile,
			})),
	});
}

export { Cli2BootstrapBuilder };
