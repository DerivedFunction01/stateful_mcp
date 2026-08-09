import { Notebook } from "./components/Notebook";
import { SetupWorkspace } from "./components/SetupWorkspace";
import {
	createDefaultSetupSource,
	type SetupSourceStore,
	type SetupSourceDocument,
} from "@stateful-mcp/clinical";
import { useEffect, useState } from "react";

export function NotebookApp({
	preferredSessionId,
}: {
	preferredSessionId?: string;
}) {
	return <Notebook preferredSessionId={preferredSessionId} />;
}

export function SetupApp({ store }: { store: SetupSourceStore }) {
	const [source, setSource] = useState<SetupSourceDocument>(() =>
		createDefaultSetupSource(),
	);

	useEffect(() => {
		let cancelled = false;
		void store.get(source.sourceId).then((value) => {
			if (!cancelled && value) setSource(value);
		});
		return () => {
			cancelled = true;
		};
	}, [store, source.sourceId]);

	return (
		<SetupWorkspace
			source={source}
			onChange={(next) => {
				setSource(next);
			}}
			onSave={() => {
				void store.set(source);
			}}
			onExit={() => process.exit(0)}
		/>
	);
}
