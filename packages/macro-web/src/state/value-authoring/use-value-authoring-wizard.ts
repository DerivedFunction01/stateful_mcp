import {
	createValueAuthoringWizard,
	type ValueAuthoringWizardStore,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { HostClient } from "../../lib/host-client";
import { createHostClientAuthoringPort } from "./host-client-port";

/**
 * Subscribes a React component to a renderer-neutral wizard store instance.
 * The factory runs once; the subscription and disposal follow the component
 * lifecycle. All behavior remains in the Phase 3 model.
 */
export function useWizardStore(createStore: () => ValueAuthoringWizardStore): {
	readonly store: ValueAuthoringWizardStore;
} {
	const [store] = useState(createStore);
	useEffect(() => () => store.dispose(), [store]);
	useSyncExternalStore(store.subscribe, store.getState, store.getState);
	return { store };
}

/**
 * Production wiring: builds the wizard over the typed HostClient port.
 */
export function useValueAuthoringWizard(client: HostClient): {
	readonly store: ValueAuthoringWizardStore;
} {
	return useWizardStore(() =>
		createValueAuthoringWizard(createHostClientAuthoringPort(client)),
	);
}
