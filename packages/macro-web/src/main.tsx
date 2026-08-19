import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Macro Web root element is missing");

createRoot(root).render(
	<StrictMode>
		<ThemeProvider>
			<I18nProvider>
				<App />
			</I18nProvider>
		</ThemeProvider>
	</StrictMode>,
);
