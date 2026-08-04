import { Notebook } from "./components/Notebook";

export function NotebookApp({
	preferredSessionId,
}: {
	preferredSessionId?: string;
}) {
	return <Notebook preferredSessionId={preferredSessionId} />;
}
