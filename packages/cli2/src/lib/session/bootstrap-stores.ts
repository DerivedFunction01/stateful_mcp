/** @deprecated Store construction belongs to the clinical  bootstrap boundary. */
export {
	createStoreBuilder as createCli2Stores,
	type StoreBackend as Cli2Backend,
	type StoreBuilderConfig as Cli2StoreConfig,
	type StoreBuilderResult as Cli2BootstrapStores,
} from "@stateful-mcp/clinical/bootstrap/store-builder";
