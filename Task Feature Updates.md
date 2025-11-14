# Task Feature Updates

## Stage 1 - Task List Text Color Controls (Completed)

### Goals
- Extend stored data so each Google Task list can optionally store a custom text color alongside its existing background color.
- Update popup UI to add a second color control (“List text color”) beneath each list’s background color picker, using the same palette/tabs experience.
- Update task-coloring logic to respect the selected text color (manual > list defaults) while keeping auto-contrast behavior when no override exists.
- Ensure changes repaint live Calendar tabs immediately, just like current background color updates.

### Plan
1. **Storage & Settings**
   - Add a sync map `cf.taskListTextColors`.
   - Provide helpers (`setTaskListTextColor`, `clearTaskListTextColor`, `getTaskListTextColors`) and surface through `window.cc3Storage`.
   - Extend caching/invalidation paths to load the new map alongside existing manual and list colors.
2. **Popup UI**
   - Fetch both background and text color maps when rendering task lists.
   - Render a stacked control column per list: “List color” (existing) and “List text color” (new), each using the palette modal/tabs.
   - Wire the new control into storage helpers, clear actions, and toast/messaging flows so any change triggers repaint.
3. **Content Script Painting**
   - Update `features/tasks-coloring` cache + lookup helpers to provide both background and text colors for every task.
   - Allow `applyPaint`/`paintTaskImmediately`/`doRepaint` to accept an optional text color override; default back to auto-contrast when unset.
   - Ensure storage listeners and manual color actions trigger repaint when `cf.taskListTextColors` changes.
4. **Documentation & Tracking**
   - After implementation, update this tracker with completion notes and refresh `COLORKIT_EXTENSION_DEEP_ANALYSIS.md` to document the new capability.

### Progress
- **Storage & Settings:** Added `cf.taskListTextColors` plus helper methods in `lib/storage.js`, exposing them through `window.cc3Storage` for popup/content usage. (Completed)
- **Popup UI:** Rebuilt each task-list row so “List color” and “List text color” pickers stack with matching palettes, clear buttons, helper text, and live updates to Calendar tabs via `window.cc3Storage`. (Completed)
- **Content Script Painting:** Extended `features/tasks-coloring` caches, lookup helpers, and paint routines to fetch the new text color map, include it in repaints (manual + list defaults), and listen for `cf.taskListTextColors` storage changes. Manual color applications keep auto-contrast unless a list override exists. (Completed)
- **UI Layout:** Task list entries now render inside cards with header swatches summarizing background/text colors and a reserved lower section for upcoming settings. (Completed)
- **Color Pipeline:** Task rendering now mirrors the staged detection flow (completion awareness, list/manual priority, per-list pending text colors, and completed styling hooks) so list-level text colors reliably override Google Calendar’s defaults. (Completed)
