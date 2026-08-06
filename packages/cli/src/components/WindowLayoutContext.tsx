import { createContext, useContext } from "react";
import {
	deriveWindowLayout,
	type WindowLayout,
} from "../lib/editor/window-layout";

const defaultLayout = deriveWindowLayout({
	columns: 80,
	rows: 24,
	sidebarOpen: false,
});

export const WindowLayoutContext = createContext<WindowLayout>(defaultLayout);

export function useWindowLayout(): WindowLayout {
	return useContext(WindowLayoutContext);
}
