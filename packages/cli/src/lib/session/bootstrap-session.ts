import {
	Cli2BootstrapBuilder,
	buildCli2Bootstrap,
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
			(await import("@stateful-mcp/clinical/bootstrap/bootstrap").then(
				(m) => m.ClinicalBootstrap.withDefaultBackend("memory", {
					syntaxProfile: options.syntaxProfile,
				}),
			)),
	});
}

export { Cli2BootstrapBuilder };
