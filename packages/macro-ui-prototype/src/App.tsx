import { useMemo, useReducer } from "react";
import { createFixture } from "./fixtures";
import { filteredCommands, reducePrototypeState } from "./reducer";
import type { DomainFixture, PanelId } from "./model";
import { ActivityPanel, ActivityRail, CommandPaletteModal, DiagramPanel, Dropdown, EmptyState, FormPanel, HelpBar, JournalPanel, MainStage, ScratchpadSurface, Sidepanel, SidepanelActivityRail, StatusBar, WorkspaceTabs } from "./components/WorkspaceShell";

export function App() {
	const [state, dispatch] = useReducer(reducePrototypeState, undefined, () => createFixture("core"));
	const commands = useMemo(() => filteredCommands(state), [state]);
	return (
		<div className="prototype-app">
			<header className="prototype-toolbar">
				<div className="brand">MACRO<span>WORKSPACE</span></div>
				<div className="fixture-switcher" role="tablist" aria-label="Fixture domains">
					{(["core", "retail", "engineering", "clinical"] as DomainFixture[]).map((fixture) => (
						<button className={state.fixture === fixture ? "fixture active" : "fixture"} key={fixture} onClick={() => dispatch({ type: "fixture", fixture })}>{fixture}</button>
					))}
				</div>
				<span className="prototype-label">visual reference · lightweight interaction</span>
			</header>
			<nav className="preview-controls" aria-label="Preview states">
				<span className="preview-label">Preview state</span>
				<button onClick={() => dispatch({ type: "palette-open" })}>Command palette</button>
				<button onClick={() => dispatch({ type: "toggle-region", region: "inspector" })}>{state.panelRegions.inspector.open ? "Hide inspector panel" : "Show inspector panel"}</button>
				<button onClick={() => dispatch({ type: "inspector-pin" })}>{state.inspectorMode === "pinned" ? "Unpin inspector" : "Pin inspector"}</button>
				<button onClick={() => dispatch({ type: "toggle-region", region: "activity" })}>{state.panelRegions.activity.open ? "Hide activity panel" : "Show activity panel"}</button>
				<button onClick={() => dispatch({ type: "dock-region", region: "activity", dock: state.panelRegions.activity.dock === "start" ? "end" : "start" })}>Move activity panel</button>
				<button onClick={() => dispatch({ type: "dock-region", region: "inspector", dock: state.panelRegions.inspector.dock === "start" ? "end" : "start" })}>Move inspector panel</button>
				<button onClick={() => dispatch({ type: "view", id: "journal" })}>Journal</button>
				<button onClick={() => { dispatch({ type: "fixture", fixture: "retail" }); dispatch({ type: "view", id: "domain" }); }}>Retail form</button>
				<button onClick={() => { dispatch({ type: "fixture", fixture: "retail" }); dispatch({ type: "tab", id: "pos" }); dispatch({ type: "view", id: "domain" }); }}>Retail POS</button>
				<button onClick={() => { dispatch({ type: "fixture", fixture: "engineering" }); dispatch({ type: "view", id: "domain" }); }}>Engineering graph</button>
				<button onClick={() => dispatch({ type: "fixture", fixture: "core" })}>Reset core</button>
			</nav>
			<div className="workspace-frame">
				{state.panelRegions.activity.open && <div className="panel-region activity-region" data-dock={state.panelRegions.activity.dock} style={{ order: state.panelRegions.activity.dock === "start" ? 0 : 3 }}><ActivityRail active={state.activeActivityViewId} onSelect={(id) => dispatch({ type: "activity-view", id })} /><ActivityPanel active={state.activeActivityViewId} dispatch={dispatch} /></div>}
				<div className="workspace-column" style={{ order: 2 }}>
					<WorkspaceTabs active={state.activeTabId} onSelect={(id) => dispatch({ type: "tab", id })} />
					<div className="workspace-body">
						<main className="main-stage"><MainStage state={state} dispatch={dispatch} /></main>
					</div>
				</div>
				{state.panelRegions.inspector.open && <div className="panel-region inspector-region" data-dock={state.panelRegions.inspector.dock} style={{ order: state.panelRegions.inspector.dock === "start" ? 1 : 4 }}><Sidepanel state={state} dispatch={dispatch} /><SidepanelActivityRail active={state.activeInspectorViewId} onSelect={(id) => dispatch({ type: "view", id })} /></div>}
			</div>
			<StatusBar state={state} />
			<HelpBar />
			{state.paletteOpen && <CommandPaletteModal state={state} commands={commands} dispatch={dispatch} />}
		</div>
	);
}

export type { PanelId };
