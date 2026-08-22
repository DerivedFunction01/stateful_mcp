import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./lib/macro-i18n-provider";
import { ThemeProvider } from "./lib/theme";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Macro Web root element is missing");

createRoot(root).render(
	<StrictMode>
		<I18nProvider>
			<ThemeProvider>
				<App />
			</ThemeProvider>
		</I18nProvider>
	</StrictMode>,
);
