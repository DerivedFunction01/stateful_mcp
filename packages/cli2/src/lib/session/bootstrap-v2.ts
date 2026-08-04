import {
	Cli2BootstrapBuilder,
	buildCli2Bootstrap,
	type Cli2BootstrapOptions,
	type Cli2BootstrapResult,
} from "./cli2-bootstrap-builder";
import { StoreBuilder } from "@stateful-mcp/clinical/bootstrap/store-builder";

export type BootstrapResult = Cli2BootstrapResult;

/** Default CLI2  entrypoint. Uses the in-memory  composition. */
export async function bootstrapSession(
	options: Cli2BootstrapOptions = {},
): Promise<BootstrapResult> {
	return buildCli2Bootstrap({
		...options,
		stores:
			options.stores ?? (await StoreBuilder.withDefaultBackend("memory")),
	});
}

export { Cli2BootstrapBuilder };
export type {
	Cli2Backend,
	Cli2BootstrapStores,
	Cli2StoreConfig,
} from "./bootstrap-stores";
