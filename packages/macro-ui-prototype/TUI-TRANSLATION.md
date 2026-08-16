# Browser Prototype to Ink Translation

| Prototype surface | `macro-cli` translation |
| --- | --- |
| CSS grid/flex workspace shell | Ink `Box` rows/columns with terminal width thresholds |
| CSS design tokens | Ink color tokens and shared spacing constants |
| Browser focus state | `WindowLayoutStateManager` focused pane plus contribution interaction state |
| DOM keyboard events | `WorkspaceInputEvent` routed by the root dispatcher |
| Centered command modal | Ink absolute overlay backed by the modal stack |
| Dropdown menu | Contributed interaction provider with keyboard selection |
| Form controls | Provider-rendered Ink controls and semantic command actions |
| Service diagram | Character-cell graph renderer with keyboard node navigation |
| CSS breakpoints | Wide, medium, and narrow terminal column/row thresholds |
| Fixture state gallery | `macro-cli` component and dispatcher tests |

The browser prototype is allowed to use pointer interactions for visual inspection, but every meaningful state transition must also have a keyboard equivalent that can be represented by the terminal renderer.
