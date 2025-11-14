# ColorKit Chrome Extension – Deep Technical Reference

**Last Updated:** November 2025  
**Extension Version:** 0.0.3 (`manifest.json`)  
**Manifest Version:** 3  
**Scope:** All runtime contexts (service worker, content scripts, popup/options UI) plus supporting libraries and business logic

This document mirrors the current codebase in `customise calendar 3/` and is intended to be the authoritative description of how the Chrome extension works today. File references below are relative to the project root.

---

## 1. High-Level Architecture

### 1.1 Packaging & Permissions
- Declared in `manifest.json` with MV3 service worker, popup, and options page.
- Key permissions: `identity` (Google OAuth for Tasks API), `storage`, `tabs`, `alarms`.
- Host permissions: `https://calendar.google.com/*`, Supabase (`*.supabase.co`), and the production portal (`https://portal.calendarextension.com/*`).
- Content script bundle injected on Calendar includes, in order: storage helper, feature registry, shared utilities, calendar-coloring utilities/cores, task coloring, time blocking, column CSS helper, toolbar, modal injection, and the bootstrapper (`content/index.js`).

### 1.2 Execution Contexts
| Context | Entry file(s) | Responsibilities |
| --- | --- | --- |
| **Background service worker** | `background.js` | Subscription validation, Supabase push registration, Google Tasks OAuth and sync, alarm scheduling, triaging messages from popup/content/external portal. |
| **Content scripts** | `content/index.js` + `content/featureRegistry.js` + `features/**` + helpers | Enforce subscription gating, manage DOM injections (day colors, task colors, time blocks, toolbar, modal augmentation). |
| **Popup UI** | `popup/popup.html`, `popup/popup.js` | User-facing configuration for every feature, color management, OAuth buttons, diagnostics access. |
| **Options page** | `options/options.html`, `options/options.js`, `options/options.css` | Lightweight alternative UI for weekday colors and date overrides. |
| **Diagnostics tool** | `diagnostics/diagnostics.html/js/css` | Internal support utility to inspect auth/push state and call backend diagnostics APIs. |

### 1.3 External Systems
- **Supabase** (configured in `config.production.js`): authentication + subscription validation endpoints, push registration, diagnostics endpoints.
- **Google Tasks API v1** (`lib/google-tasks-api.js`): read-only scopes for task list metadata and task list membership used by the list color feature.

---

## 2. Storage & Configuration Layer

All feature settings are mediated by `window.cc3Storage` (`lib/storage.js`). Key traits:

- Sync storage (mirrored across browsers) holds the user-facing settings object plus `cf.taskColors`, `cf.taskListColors`, `cf.taskListTextColors`, custom color presets, etc.
- Local storage (per-device) keeps heavier/internal data: task→list mappings (`cf.taskToListMap`), cached task list metadata, Supabase session, push subscription, subscription status, etc.
- `defaultSettings` (lines 61-94) defines:
  - `weekdayColors` / `weekdayOpacity` (keys `0-6` for Sunday–Saturday).
  - `dateColors` map per ISO date.
  - Task coloring toggles + preset/inline palettes.
  - Task list coloring state (`enabled`, `oauthGranted`, `lastSync`, `pendingTextColors` / `textColors` maps keyed by list ID).
  - Time blocking state using day keys `mon`…`sun`, each holding an array of blocks with `{ timeRange: [start,end], color?, label? }`. Date-specific overrides are keyed by `YYYY-MM-DD` and share the same structure.
  - Global time blocking options: `globalColor`, `shadingStyle` (`'solid'` or `'hashed'`).
- **Helper Methods** include:
  - Day coloring: `setEnabled`, `setWeekdayColor`, `setWeekdayOpacity`, `setDateColor`, `clearDateColor`
  - Task coloring: `setTaskColoringEnabled`, `setTaskColor`, `clearTaskColor`, `getTaskColor`
  - **Task list coloring**: `setTaskListDefaultColor`, `clearTaskListDefaultColor`, `setTaskListTextColor`, `clearTaskListTextColor`, `getTaskListColors`, `getTaskListTextColors`
    - **Text Color Storage** (`setTaskListTextColor` at line 295): Writes to TWO locations for reliability:
      1. `cf.taskListTextColors` (direct sync storage key)
      2. `settings.taskListColoring.pendingTextColors` and `textColors` (nested in settings)
    - Includes debug logging to trace saves and verify storage writes
    - Returns updated color map
  - Time blocking: `addTimeBlock`, `removeTimeBlock`, `addDateSpecificTimeBlock`, `clearDateSpecificTimeBlocks`
  - All methods merge into the persisted settings object and emit storage change events

`content/featureRegistry.js` loads settings via `cc3Storage.getAll()` and hands each registered feature its slice. Updates flow back through `window.cc3Features.updateFeature`, ensuring every feature’s `onSettingsChanged` runs in-page immediately.

---

## 3. Subscription, Auth, and Push Infrastructure

### 3.1 Configuration (`config.production.js`)
- Provides Supabase URL + anon key, ColorKit portal base URL, VAPID public key, `ENVIRONMENT`, and a `debugLog` helper gated by `CONFIG.DEBUG`.

### 3.2 Subscription Cache & Validation (`lib/subscription-validator.js`)
- `validateSubscription()` reads `chrome.storage.local.subscriptionStatus`. Used by popup and content bootstrap for instant UX. If absent, it returns states such as `no_session` or `pending_validation` without hitting the network.
- `forceRefreshSubscription()` (only invoked by push events and the 3-day alarm) calls `GET /api/extension/validate` with the Supabase access token, writes the result to `subscriptionStatus` + boolean `subscriptionActive`, and implements fail-open rules: if network/API errors occur while the user was previously unlocked, it preserves access until definitive info is available. Also refreshes expired Supabase tokens when possible.

### 3.3 Background Flow (`background.js`)
- On install/update: sets `firstInstall`, registers push (if VAPID key configured), and schedules a `periodic-subscription-check` alarm every 72 hours starting at the next 4 AM.
- On startup: re-ensures push subscription.
- Push listener: treats payloads as cache invalidation, calls `forceRefreshSubscription`, and broadcasts `SUBSCRIPTION_CANCELLED` or `SUBSCRIPTION_UPDATED` to Calendar tabs + popup.
- Alarm listener: on `periodic-subscription-check`, re-validates; on `task-list-sync`, executes `syncTaskLists()`.
- Message routing:
  - External (`chrome.runtime.onMessageExternal`) accepts `AUTH_SUCCESS`, `PAYMENT_SUCCESS`, `SUBSCRIPTION_CANCELLED`, `LOGOUT`, etc. from the portal host (enforced via URL check).
  - Internal (`chrome.runtime.onMessage`) handles popup/content requests (subscription/auth checks, `OPEN_WEB_APP`, OAuth grant, sync triggers, list metadata, task-color operations, calendar tab activity, list color propagation, etc.).

### 3.4 Content Enforcement (`content/index.js`)
- Waits for `window.cc3Features` and `cc3Storage`, validates subscription via `subscriptionActive` flag, and only boots the feature registry when active.
- Listens for `SUBSCRIPTION_CANCELLED` to immediately disable all features, unmount toolbar, and scrub injected styles.
- On `SUBSCRIPTION_UPDATED`, re-validates and reloads the page if access was regained.

### 3.5 Push Registration & Storage
- `ensureWebPushSubscription()` (service worker) checks `chrome.storage.local.pushSubscription`, validates it with the backend via `/api/extension/validate-push`, or subscribes afresh using the VAPID key. Pending subscriptions are stored until the user logs in so they can be registered server-side.
- `registerPushSubscription()` persists the subscription and POSTs it to `/api/extension/register-push` with the Supabase access token. If no session, it stores `pendingPushSubscription` for later.

---

## 4. Google Tasks Integration & Task List Colors

### 4.1 OAuth & Token Handling (`lib/google-tasks-api.js`)
- `getAuthToken(interactive)` uses `chrome.identity.getAuthToken` with the read-only Tasks scope. Tokens are cached alongside an expiry timestamp (55 minutes). `clearAuthToken` removes cached tokens (with fallback to `chrome.identity.clearAllCachedAuthTokens`).
- `isAuthGranted()` attempts `getAuthToken(false)`; failure indicates revocation.

### 4.2 API Calls & Background Handlers
- `fetchTaskLists()`: `GET https://tasks.googleapis.com/tasks/v1/users/@me/lists`.
- `fetchTasksInList(listId, pageToken?)`: paginated read of tasks for each list.
- `buildTaskToListMapping()`: full rescan; stores task lists metadata (`cf.taskListsMeta`) and `cf.taskToListMap` (task ID → list ID) in local storage, respecting a safety cap (`MAX_TASKS_PER_LIST` = 1000).
- `incrementalSync(updatedMin)`: fetches lists updated since `lastSyncTime` to avoid full scans.
- `getListIdForTask()` and `findTaskInAllLists()` support quick lookups for new tasks detected by the content script. Both fast path (recent 30 seconds) and full search automatically update the `cf.taskToListMap` cache.
- `checkStorageQuota()` uses `chrome.storage.local.getBytesInUse()` to warn above 80% of the 10 MB quota.
- **Background Color Retrieval** (`background.js:803`):
  - `getListDefaultColor(listId)` retrieves both background and text colors for a task list
  - Reads from three parallel sources: `cf.taskListColors`, `cf.taskListTextColors`, and `settings.taskListColoring`
  - Returns `{ backgroundColor, textColor }` object with both colors or null values
- **New Task Handler** (`background.js:770`):
  - `handleNewTaskDetected(taskId)` performs quick cache lookup or API search to find task's list
  - Calls `getListDefaultColor(listId)` to get both background and text colors
  - Returns `{ success: true, listId, backgroundColor, textColor }` for successful detection
  - Content script uses this response to invalidate cache and trigger repaint with list default colors

### 4.3 Background State Machine
- Maintains `pollingState` (`ACTIVE` / `IDLE` / `SLEEP`) based on Calendar tab presence and recent `USER_ACTIVITY` messages (5-minute window). Transitions set the `task-list-sync` alarm cadence: 1 minute when active, 5 minutes when idle, and cleared entirely when asleep.
- `syncTaskLists(fullSync=false)` checks `settings.taskListColoring.enabled` and `oauthGranted`. It calls either `buildTaskToListMapping()` or `incrementalSync()`, updates `settings.taskListColoring.lastSync`, invokes `checkStorageQuota()`, broadcasts `TASK_LISTS_UPDATED`, and returns stats.

### 4.4 Popup UI (`popup/popup.js`, section around lines 1138-2050)
- Renders each Google Tasks list with stacked controls: a background color swatch wired to `cf.taskListColors` and a "List text color" picker wired to `cf.taskListTextColors`. Both use the shared palette/tabs experience and write through `window.cc3Storage`.
- List text colors are stored in **two locations** for reliability:
  - `cf.taskListTextColors` (direct sync storage key)
  - `settings.taskListColoring.pendingTextColors` / `settings.taskListColoring.textColors` (nested in settings)
- Provides buttons to grant OAuth (`GOOGLE_OAUTH_REQUEST`) and trigger resync (`SYNC_TASK_LISTS`).
- Applying a list color updates sync storage and can send `APPLY_LIST_COLOR_TO_EXISTING` to the background to repaint existing tasks lacking manual colors.
- `task list coloring` toggle writes to settings and, when turned on without OAuth, prompts an authorization flow.
- Broadcasts `TASK_LIST_TEXT_COLOR_UPDATED` message to calendar tabs when text colors change.

### 4.5 Task Detection & Painting
- `features/tasks-coloring/index.js` observes the Calendar DOM for task chips (`data-eventid` starting with `tasks.`). It resolves task IDs, fetches manual colors or list defaults, and paints the clickable element (skipping dialogs).
- **Color Priority System**:
  1. **Manual task colors**: Use auto-contrast text (white/black based on luminance)
  2. **List default colors**: Use list text color if set, otherwise auto-contrast
  3. **No color**: No painting applied
- **In-Memory Cache System** (`refreshColorCache()` at line 672):
  - Caches task→list mappings, manual colors, list colors, **list text colors**, and completion styling
  - Cache lifetime: 30 seconds
  - **Critical Fix**: Cache return path (line 676-683) now correctly includes `listTextColors` and `completedStyling` to prevent text colors from being lost
  - Invalidated on storage changes (`cf.taskColors`, `cf.taskListColors`, `cf.taskListTextColors`, `settings`, `cf.taskToListMap`)
- **Text Color Resolution** (`getColorForTask()` at line 755):
  - Retrieves `listTextColors` from cache for the task's list
  - Passes `pendingTextColor` to `buildColorInfo()` which selects text color via priority: override → list text color → auto-contrast
  - Debug logging shows color lookup details, text color selection, and final applied colors
- **New Task Detection** (`handleNewTaskCreated()` at line 817):
  - When a new task is created, sends `NEW_TASK_DETECTED` to background
  - Background finds list ID via API and updates `cf.taskToListMap` cache
  - Content script invalidates cache and triggers immediate repaint
  - Normal repaint flow applies list default colors (background + text) correctly
- Mutation observers, URL-change watchers, and periodic timers ensure colors persist across view changes. Storage change listeners (line 1157-1181) trigger cache invalidation and repaints with debug logging.
- Before painting, the renderer inspects each task for Google's completion styling (line-through text). Completed tasks can receive alternate styling via `taskListColoring.completedStyling[listId]` (background/text colors plus opacity), whereas pending tasks use the list's default + text color override.
- `content/modalInjection.js` augments Google's task dialogs (but intentionally skips Google's appearance/theme dialogs). When editing existing tasks, it injects ColorKit color controls via `window.cfTasksColoring.injectTaskColorControls`.

---

## 5. Calendar Day Coloring & Column Styling

### 5.1 Day Coloring Core (`features/calendar-coloring/core/dayColoring.js`)
- Registers with the feature registry as `dayColoring`.
- Detects the user’s week start dynamically by inspecting the live grid (column headers, actual dates) and falls back to Sunday.
- Supports multiple Calendar views (day, week, multi-day) and locales. Uses MutationObservers, URL watchers, and periodic reapply timers to keep colors intact during DOM churn.
- Applies both weekday colors (root-level settings) and date-specific overrides (from `settings.dateColors`). Opacity is derived from `weekdayOpacity` per day.
- Includes cleanup/teardown logic invoked when the feature is disabled.

### 5.2 Month Coloring (`features/calendar-coloring/core/monthColoring.js`)
- Colors month view cells by mapping header text/positions to weekdays. Works in 7-column (weekends visible) and 5-column (weekdays only) layouts.
- Observes the grid root for redraws and repaints asynchronously to avoid flicker.

### 5.3 Column CSS Helper (`features/columnCss.js`)
- Provides a lightweight alternative when full day coloring is disabled. Injects CSS custom properties targeted to each `[role='grid'] > [data-start-date-key]` chunk, coloring columns using nth-child-safe selectors.
- Automatically disables itself if `dayColoring` is enabled to avoid conflicts.

---

## 6. Popup & Color Management

### 6.1 Popup Overview (`popup/popup.js`)
- Single-page app rendered via plain DOM manipulation.
- Sections include subscription status/overlays, Color Lab (shared custom colors with stats), day coloring cards, task coloring presets/inline palettes, task list colors, time blocking editors, and diagnostics links.
- Each control writes to `cc3Storage` helpers and immediately calls `window.cc3Features.updateFeature` (either with entire settings or the specific feature payload) so active Calendar tabs update without reloads.
- Implements toasts, validation warnings, and “learn more” info cards. Buttons like “Manage account” open the hosted portal via `OPEN_WEB_APP` message.

### 6.2 Color Lab (`popup/popup.js`, sections ~497-940)
- Stores user-defined custom colors in sync storage. Provides collection stats, edit/delete actions, and quick-apply buttons feeding other pickers.
- Inline colors for task coloring/time blocking come from `settings.taskColoring.inlineColors` or defaults defined in `lib/storage.js`.

### 6.3 Options Page (`options/options.js`)
- Presents a simplified view for weekday colors, week-start dropdown, presets list, and date overrides, all powered by the same `cc3Storage` API.

---

## 7. Time Blocking

### 7.1 Data Model
- Settings stored under `settings.timeBlocking`:
  - `enabled` (boolean).
  - `globalColor` (hex).
  - `shadingStyle`: `'solid'` or `'hashed'` (the only two styles supported by `features/time-blocking/core/timeBlocking.js`).
  - `weeklySchedule`: object keyed by `mon`…`sun`, each value an ordered array of blocks `{ timeRange: ['HH:MM', 'HH:MM'], color?, label? }`.
  - `dateSpecificSchedule`: map of ISO date → array of blocks with same structure.

### 7.2 Content Rendering (`features/time-blocking/index.js` + `core/timeBlocking.js`)
- `features/time-blocking/index.js` registers the feature, initializes the core when enabled, monitors DOM mutations, and runs persistence checks plus view-change polling to keep overlays in place.
- `core/timeBlocking.js`:
  - Converts Google’s `data-datekey` integers to actual dates.
  - Merges weekly blocks with date-specific overrides when rendering each calendar column.
  - Creates `.cc3-timeblock` elements positioned absolutely within each day column; sets CSS variables for color/opacity.
  - `applyBlockStyles` enforces either a solid fill (with `opacity: 0.7`) or a hashed SVG pattern (for the `'hashed'` style). There is no support for striped/dotted/gradient shading in the current code.
  - Adds tooltips and inline labels, cleans up on disable, and exposes `render`, `forceRender`, `updateBlockColors`, and `cleanup` APIs.

### 7.3 Popup Editors (`popup/popup.js`, ~1700-3476)
- Weekly schedule UI iterates day keys (`mon`…`sun`), shows each block with time pickers, label input, palette tabs, and Save/Delete controls. `addTimeBlock(dayKey)` opens a modal to create new blocks, ultimately calling `cc3Storage.addTimeBlock`.
- Date-specific editor lists existing overrides, supports modal-based creation (`addDateSpecificTimeBlock`) and bulk clear.
- Global controls (enable toggle, shading style dropdown, global color picker) update settings and message the content script via `timeBlockingChanged` or `timeBlockingColorChanged` events.

---

## 8. Task Coloring & Modal Controls

### 8.1 Task Chip Detection & Coloring (`features/tasks-coloring/index.js`)
- **DOM Identification**: `isTasksChip`/`getTaskIdFromChip` identify task DOM nodes from `data-eventid`, `data-taskid`, or ancestor attributes.
- **Element Caching**: Uses cached mappings (`taskElementReferences` WeakMap) and throttle/debounce logic to avoid repaint storms.
- **Color Resolution Flow**:
  1. `doRepaint()` (line 900) iterates all task elements on the page
  2. Calls `getColorForTask(taskId, manualColorMap, { isCompleted })` for each task
  3. `getColorForTask()` checks cache for:
     - Manual color (`cf.taskColors[taskId]`) → Returns with auto-contrast text
     - List default color (`cf.taskListColors[listId]`) → Returns with list text color if set
  4. `buildColorInfo()` (line 797) selects text color: `overrideTextColor || pendingTextColor || pickContrastingText(baseColor)`
  5. `applyPaintIfNeeded()` (line 649) applies background and text colors to DOM via inline styles
- **Performance Optimizations**:
  - In-memory cache reduces storage reads from ~33/sec to ~0.03/sec (99.9% improvement)
  - Cache invalidation on storage changes ensures fresh data
  - Debounced repaints (100ms) prevent excessive DOM updates
  - Fast path for cached task element references
- **DOM Observation**:
  - `MutationObserver` detects navigation and new task creation (line 1095)
  - URL mutation watcher for back/forward navigation (line 1131)
  - `popstate` event listener (line 1143)
  - Periodic repaint timer (3 seconds) for reliability (line 1149)
  - Storage change listeners with debug logging (line 1157-1181)
- **Debug Logging**: Comprehensive console logs trace:
  - Cache refresh with text colors loaded
  - Color lookup per task (list ID, background/text colors)
  - Text color selection (override vs list vs auto-contrast)
  - Storage change events and repaint triggers
- **API**: Exposes debug helpers via `window.cfTasksColoring`:
  - `repaint()` - Trigger manual repaint
  - `getColorMap()` - Get manual task colors
  - `debugRepaint()` - Force immediate repaint
  - `getLastClickedTaskId()` - Get last clicked task ID

### 8.2 Modal Injection (`content/modalInjection.js`)
- Watches for Google dialogs (`role="dialog"` / `[aria-modal="true"]`). Filters out appearance/theme dialogs and ensures context corresponds to an existing task (checking DOM attributes or `window.cfTasksColoring.getLastClickedTaskId`).
- Injects task color controls into edit dialogs via `window.cfTasksColoring.injectTaskColorControls` and hooks into save flows to persist colors.

---

## 9. Toolbar & Activity Tracking

### 9.1 Toolbar (`content/toolbar.js`)
- Provides a collapsible floating toolbar with toggles for Day Colors, Task Colors, and Time Blocks.
- Each toggle persists via `cc3Storage` (`setEnabled`, `setTaskColoringEnabled`, `setTimeBlockingEnabled`) and triggers the respective feature update.
- Automatically re-renders when storage settings change.

### 9.2 Activity Reporting (`content/index.js`)
- Adds passive `click`/`keydown` listeners and `visibilitychange` handlers to inform the background worker of user activity and tab focus, enabling the smart polling state machine for Google Tasks syncing.

---

## 10. Messaging Summary

| Sender | Message Type | Handler |
| --- | --- | --- |
| Popup → background | `CHECK_AUTH`, `CHECK_SUBSCRIPTION`, `OPEN_WEB_APP`, `CLEAR_AUTH`, `ENSURE_PUSH`, `GOOGLE_OAUTH_REQUEST`, `SYNC_TASK_LISTS`, `CHECK_OAUTH_STATUS`, `GET_TASK_LISTS_META`, `APPLY_LIST_COLOR_TO_EXISTING`, `SUBSCRIPTION_UPDATED`, etc. | `chrome.runtime.onMessage` in `background.js`. |
| Popup → content (Calendar tabs) | `timeBlockingChanged`, `timeBlockingColorChanged` | Sent via `chrome.tabs.sendMessage` in `popup/popup.js`, handled in `features/time-blocking/index.js` to re-render blocks. |
| Content → background | `CALENDAR_TAB_ACTIVE/INACTIVE`, `USER_ACTIVITY`, `NEW_TASK_DETECTED`, `REPAINT_TASKS` triggers, subscription messages. |
| Background → content | `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_UPDATED`, `TASK_LISTS_UPDATED`, `REPAINT_TASKS`. |
| External portal → background | `AUTH_SUCCESS`, `PAYMENT_SUCCESS`, `SUBSCRIPTION_CANCELLED`, `LOGOUT`, `PAGE_LOADED` (validated via sender URL). |
| Diagnostics page → background | Shares the same `chrome.runtime` APIs, calling push validation/register utilities exposed in `background.js`. |

---

## 11. Diagnostics & Developer Utilities

- `diagnostics/diagnostics.js` renders auth/push status, lets support re-register push subscriptions, run backend diagnostics via `/api/extension/debug-push`, and send test push notifications. It logs via `debugLog` and updates the UI with recent activities.
- `debug-clear-oauth.js` is a script intended for the service worker console to clear cached Google OAuth tokens when troubleshooting task list access.
- Project documentation (`USER_GUIDE.md`, `IMPLEMENTATION_PROGRESS.md`, `TASK_LIST_COLORS_IMPLEMENTATION_PLAN.md`) describes shipped functionality, roadmap, and QA notes but does not override this technical reference.

---

## 12. File Topology (Selected Highlights)

```
background.js                         ← Service worker
config.production.js / config.js       ← Environment-specific constants
lib/
  storage.js                           ← cc3Storage helper
  google-tasks-api.js                  ← OAuth + API client
  subscription-validator.js            ← Subscription cache + validation
  supabase-extension.js                ← Storage-based Supabase helper
content/
  index.js                             ← Subscription gate + bootstrap
  featureRegistry.js                   ← Registers/boots features
  toolbar.js                           ← In-page toolbar
  modalInjection.js                    ← Task dialog augmentation
features/
  calendar-coloring/core/*.js          ← Day & month coloring
  tasks-coloring/index.js              ← Task chip painting
  tasks-coloring/styles.css            ← Task coloring styles
  time-blocking/index.js               ← Feature wrapper
  time-blocking/core/timeBlocking.js   ← Renderer
  shared/utils.js                      ← Reusable DOM/color helpers
popup/
  popup.html / popup.js                ← Main UI
options/
  options.html / options.js            ← Minimal UI
```

---

## 13. Accuracy Commitments
- Version numbers, shading options, data schemas, and behavior described above match the current source files (checked November 2025).
- Any future code changes must be reflected here immediately; sections referencing non-existent helpers or outdated flows should be updated or removed alongside the code change.

This document now serves as the source of truth for the ColorKit extension’s architecture and business logic.

---

## AGENTS.md – Rules
1. **Business logic boundaries**: Never alter subscription/auth flows, Supabase integrations, or any portal/webapp communication without explicit approval. Focus changes on extension UI/features only.
2. **Task scope discipline**: Only implement work the user has explicitly requested; avoid opportunistic tweaks or unrelated refactors.
3. **Plan awareness**: Maintain a clear plan for every task. If requirements become unclear, pause and ask for clarification before continuing.
4. **Root-cause mindset**: Do not assume bugs exist. When unexpected behavior is reported, analyze the codebase to find the true source before proposing fixes.
5. **Artifacts restraint**: Avoid creating extra Markdown files, tests, or debug scripts unless specifically asked.
6. **Documentation readiness**: Track modifications continuously so they can be summarized and propagated to this document when tasks complete.
7. **No placeholders**: Do not leave TODOs, stub implementations, or unfinished UI/code in the repo.
8. **Reference first**: Before coding, re-read this document and any in-progress specifications to ensure implementations match the documented architecture and conventions.
9. **Evidence over assumption**: Prefer direct code investigation, repro steps, or experiments over guesses when implementing new features or fixes.
