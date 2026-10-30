# Workbench source explorer

Approved direction: C, a folder tree beside the selected source file, collapsing on narrow panels. Source must use the workbench / LiveLoveApp light canvas, white panels, fine neutral borders, compact typography and Hashbrown accent colors. Replay, Live and Source share the surrounding frame and mode controls. Do not carry over the companion's dark brown editor surface.

- Desktop: a roughly 220px explorer with collapsible real directories and filename buttons. Full paths appear in the selected file header and accessible button names. Match docs sidenav typography, 32px desktop rows, spacing, white background and soft selection. Use the workbench's rounded 24-unit stroke icon style, including its file-code icon.
- Narrow panels: one collapsed file-picker row. Opening reveals the same tree inline; selection closes it and returns focus to the toggle. Use container width so the code never gets squeezed by docs navigation.
- Keep the same panel mounted across responsive changes, preserving active mode, file selection and source fetch state. On mobile, Replay uses video and Source remains available; Live stays desktop-only.
- Preserve lazy source loading, commit-specific GitHub links, snippet-driven selection, first-highlight scrolling, loading and failure fallbacks. Code scrolls inside a bounded pane.
- Source alone uses light syntax highlighting. Existing article code blocks keep their theme.
- Refinement: remove the highlight legend and file dots, use an accessible GitHub logo link in the file header, and remove the outer panel/card borders and nested indentation rules. Keep only subtle navigation/code dividers and retain the shared mode controls.
- Validate with regression tests for directory disclosure, file selection, mobile picker focus, mobile source access, responsive state and lazy loading. Run www build, test and lint, and inspect desktop/mobile rendering.
