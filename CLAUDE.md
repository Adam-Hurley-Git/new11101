# ColorKit Chrome Extension - Full Codebase Reference

**Last Updated**: November 17, 2025
**Extension Version**: 0.0.3 (Chrome Web Store Ready)
**Manifest Version**: 3
**Minimum Chrome Version**: 121

This document provides comprehensive context about the ColorKit Chrome extension codebase for AI assistants and developers.

---

## Recent Changes (v0.0.3 - November 2025)

### UX/Performance Fixes

1. **✅ Fixed Completed Task Coloring** - Tasks completed in Google Calendar now properly colored
   - Fixed Google Tasks API parameter: `showHidden: true` (was `false`)
   - Completed tasks in first-party clients (Calendar, mobile) now fetchable
   - Files: `lib/google-tasks-api.js`

2. **✅ Fixed Slider Flickering** - Removed interfering hover effects
   - Removed transitions/transforms from `.section` elements
   - Removed hover effects from opacity slider containers
   - Files: `popup/popup.html`

3. **✅ Fixed Scroll Conflicts** - Sliders now draggable without interruption
   - Removed nested scroll from `#taskListItems` (first fix)
   - Prevented DOM destruction during slider interaction (second fix)
   - Smart storage change detection prevents unnecessary reloads
   - Files: `popup/popup.html`, `popup/popup.js`

4. **✅ Fixed Setting Dependencies** - All settings now work independently
   - Text colors work without background colors
   - Completed styling works without pending styling
   - Task list coloring works without inline colors toggle
   - Files: `features/tasks-coloring/index.js`

5. **✅ Enhanced Clear Button UX** - Visual feedback and proper reset
   - Added `:active` state with scale transform
   - Proper reset to Google's default (`#ffffff`)
   - Closes modal after clearing
   - Files: `popup/popup.html`, `popup/popup.js`

### Technical Improvements

- **Smart Storage Listener**: Detects if only `completedStyling` changed to avoid DOM rebuilds
- **Transparent Backgrounds**: Settings can apply text-only or completed-only styling
- **Better Error Handling**: Clear buttons properly disable/enable based on state

### Previous Version (v0.0.2 - January 2025)

#### Chrome Web Store Compliance

- ❌ Removed `cookies` permission (unused, causing Chrome Web Store rejection)
- ❌ Removed `notifications` permission (using Web Push API instead)
- ❌ Removed development host permissions from production manifest
- ✅ Added `identity` permission for Google OAuth (Tasks API)
- ✅ Added `minimum_chrome_version: "121"` for silent push support

#### New Features

1. **Improved OAuth State Management** - Storage flag as source of truth
2. **Custom Inline Colors** - User-customizable quick-access colors in task modal
3. **Enhanced OAuth Button UX** - Loading states & specific error messages
4. **Subscription Broadcasting** - Real-time updates to calendar tabs

#### Code Cleanup

- Removed Chrome < 121 fallback code
- Removed unused `isAuthenticated()` function
- Removed broken Chrome update notice element
- Simplified push notification subscription (silent mode only)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Structure](#file-structure)
3. [Core Systems](#core-systems)
4. [Features](#features)
5. [Storage Schema](#storage-schema)
6. [Message Passing](#message-passing)
7. [API Integrations](#api-integrations)
8. [Critical Code Patterns](#critical-code-patterns)
9. [Performance Optimizations](#performance-optimizations)
10. [Security & Privacy](#security--privacy)

---

## Architecture Overview

### Extension Type

**Manifest V3 Chrome Extension** with:

- Service Worker background script
- Content scripts injected into Google Calendar
- Popup UI for settings management
- OAuth 2.0 integration for Google Tasks API
- Supabase backend for subscription validation

### Technology Stack

- **JavaScript (ES6 modules)**
- **Chrome Extension APIs**: storage, identity, runtime, tabs, alarms
- **Google Tasks API v1**: Read-only access
- **Supabase**: Authentication and subscription management
- **Vanilla HTML/CSS**: No framework dependencies

### Execution Contexts

**Service Worker** (`background.js`):

- Persistent background tasks
- Message routing
- OAuth token management
- Subscription validation
- Task list syncing state machine

**Content Script** (`content/index.js`):

- Runs on https://calendar.google.com/*
- DOM manipulation
- Feature registration
- Activity tracking

**Popup** (`popup/popup.html`, `popup/popup.js`):

- Settings UI (520x650px)
- Feature toggles
- Color pickers
- Subscription status

---

## File Structure

```
customise calendar 3/
├── manifest.json                       # Extension manifest (V3)
├── background.js                       # Service worker (31KB)
├── config.js                           # Development config
├── config.production.js                # Production config
│
├── content/
│   ├── index.js                        # Main content script entry
│   ├── featureRegistry.js              # Feature loader
│   ├── modalInjection.js               # Task modal detection
│   └── toolbar.js                      # Toolbar injections
│
├── lib/
│   ├── storage.js                      # Storage abstraction layer
│   ├── google-tasks-api.js             # Google Tasks API integration
│   └── subscription-validator.js       # Supabase subscription validation
│
├── features/
│   ├── shared/
│   │   └── utils.js                    # Shared utilities (color picker)
│   ├── calendar-coloring/
│   │   ├── index.js                    # Day/month coloring entry
│   │   ├── core/
│   │   │   ├── dayColoring.js          # Weekday coloring logic
│   │   │   └── monthColoring.js        # Month view coloring
│   │   └── utils/
│   │       └── dateUtils.js            # Date manipulation helpers
│   ├── tasks-coloring/
│   │   ├── index.js                    # Task coloring + list defaults
│   │   └── styles.css                  # Task coloring styles
│   ├── time-blocking/
│   │   ├── index.js                    # Time blocking entry
│   │   └── core/
│   │       └── timeBlocking.js         # Time block rendering
│   └── columnCss.js                    # Column width adjustments
│
├── popup/
│   ├── popup.html                      # Settings UI (520x650px)
│   └── popup.js                        # Settings logic (~37k tokens)
│
├── diagnostics/
│   └── diagnostics.js                  # Debug tools
│
├── images/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
│
└── options/
    └── options.html                    # Options page (minimal)
```

---

## Core Systems

### 1. Storage System (`lib/storage.js`)

**Purpose**: Abstraction layer over Chrome storage APIs with deep merge support

**Key Functions**:

```javascript
// Settings Management
async function getAll()                              // Get all settings
async function setAll(newSettings)                   // Set all settings (deep merge)
async function getSettings()                         // Get settings object
async function setSettings(partialSettings)          // Update settings (deep merge)
async function resetToDefaults()                     // Reset to default settings

// Day Coloring
async function setDayColoringEnabled(enabled)
async function setWeekdayColor(day, color)
async function setWeekdayOpacity(opacity)
async function setDateColor(date, color)
async function clearDateColor(date)

// Task Coloring (Individual)
async function setTaskColoringEnabled(enabled)
async function setTaskColor(taskId, color)
async function clearTaskColor(taskId)
async function getTaskColor(taskId)
async function getTaskColors()

// Task Coloring (List Defaults - NEW)
async function getDefaultColorForTask(taskId)        // Priority: manual > list > none
async function setTaskListDefaultColor(listId, color)
async function clearTaskListDefaultColor(listId)
async function getTaskListColors()
async function getTaskListsMeta()

// Time Blocking
async function setTimeBlockingEnabled(enabled)
async function setGlobalTimeBlockColor(color)
async function addWeeklyTimeBlock(day, startTime, endTime, color)
async function removeWeeklyTimeBlock(day, blockId)
```

**Storage Keys**:

```javascript
// Chrome Storage Sync (max 100KB, syncs across devices)
{
  "settings": {
    "enabled": false,
    "weekdayColors": { "0": "#fff", "1": "#fff", ... },
    "weekdayOpacity": 15,
    "dateColors": { "2025-11-03": "#ff0000" },
    "presetColors": ["#4285f4", "#34a853", ...],
    "taskColoring": {
      "enabled": false,
      "presetColors": [...],
      "inlineColors": [...]
    },
    "taskListColoring": {                            // NEW
      "enabled": false,
      "oauthGranted": false,
      "lastSync": null,
      "syncInterval": 5
    },
    "timeBlocking": {
      "enabled": false,
      "globalColor": "#FFEB3B",
      "shadingStyle": "solid",
      "weeklySchedule": {...},
      "dateSpecificSchedule": {...}
    }
  },
  "cf.taskColors": {                                 // Manual task colors
    "taskId123": "#4285f4",
    "taskId456": "#34a853"
  },
  "cf.taskListColors": {                             // List default colors
    "listId789": "#4285f4",
    "listIdABC": "#ea4335"
  },
  "customDayColors": ["#ff0000", "#00ff00"]
}

// Chrome Storage Local (max 10MB, device-specific)
{
  "cf.taskToListMap": {                              // Task → List mapping cache
    "taskId123": "listId789",
    "taskId456": "listIdABC"
  },
  "cf.taskListsMeta": [                              // Task lists metadata
    {
      "id": "listId789",
      "title": "My Tasks",
      "updated": "2025-11-03T00:00:00Z"
    }
  ],
  "subscriptionStatus": {                            // Supabase subscription
    "isActive": true,
    "status": "active",
    "reason": "subscription_active",
    "scheduledCancellation": false
  }
}
```

**Global Access**:

- Exported as `window.cc3Storage` in content scripts
- All functions return Promises
- Deep merge prevents overwriting unrelated settings

---

### 2. Google Tasks API (`lib/google-tasks-api.js`)

**Purpose**: OAuth integration and API calls to Google Tasks API

**Architecture**:

- OAuth token caching (55-minute expiry)
- Exponential backoff for rate limits
- Parallel API searches
- Fast path optimization for new tasks
- Storage quota monitoring

**Key Functions**:

```javascript
// OAuth Management
async function getAuthToken(interactive = false)     // Get/refresh OAuth token
async function clearAuthToken()                      // Clear cached token
async function isAuthGranted()                       // Check if OAuth granted

// API Calls (all return JSON)
async function fetchTaskLists()                      // GET /users/@me/lists
async function fetchTasksInList(listId, updatedMin) // GET /lists/{listId}/tasks
async function fetchTaskDetails(taskId, listId)     // GET /lists/{listId}/tasks/{taskId}

// Mapping & Sync
async function buildTaskToListMapping()              // Full sync (all lists/tasks)
async function incrementalSync(lastSyncTime)         // Incremental sync (updatedMin)
async function getListIdForTask(taskId)              // Quick cache lookup

// New Task Detection (Parallel + Fast Path)
async function findTaskInAllLists(taskId)            // Search for task in all lists
  // 1. Fast path: Search last 30 seconds of updates (parallel)
  // 2. Fallback: Full search across all lists (parallel)
  // 3. Updates cache on success

// Storage
async function cacheTaskListsMeta(lists)             // Save lists metadata
async function cacheTaskToListMap(mapping)           // Save task→list mapping
async function getLastSyncTime()                     // Get last sync timestamp
async function setLastSyncTime(timestamp)            // Update sync timestamp

// Error Handling
async function exponentialBackoff(attempt)           // Calculate backoff delay
async function safeApiCall(fn, retries = 2)         // Retry wrapper
function handleApiError(error)                       // Error classification
async function checkStorageQuota()                   // Monitor quota usage
```

**OAuth Configuration** (`manifest.json`):

```json
{
  "permissions": ["identity"],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/tasks.readonly"]
  }
}
```

**API Quota**:

- Google Tasks API: 50,000 queries/day (default)
- Heavy user (35+ lists): ~34,000 queries/day
- Safe margin: 68% utilization at max load

**Critical Fixes**:

- **Base64 Decoding**: Google Tasks API returns base64-encoded task IDs, but Google Calendar DOM uses decoded IDs
  - Fixed in 3 locations: `buildTaskToListMapping()`, `incrementalSync()`, `findTaskInAllLists()`
  - Example: `atob("LVhVQzRlWm9Idk9sRzRnNA")` → `-XUC4eZoHvOlG4g4`

---

### 3. Subscription Validation (`lib/subscription-validator.js`)

**Purpose**: Validate user subscriptions via Supabase backend with **FAIL-OPEN** architecture

**CRITICAL: Fail-Open Architecture**:

The system is designed to **preserve user access during temporary failures**:

- ✅ Only locks when subscription is **confirmed inactive**
- ✅ Preserves unlock state on API errors, network issues, token expiry
- ✅ Auto-refreshes expired tokens instead of locking
- ❌ **NEVER** locks paying users during temporary system failures

**Integration**:

- Connects to Supabase project
- Validates subscription status via `/api/extension/validate`
- Auto-refreshes expired access tokens (1-hour expiry)
- Preserves lock state on errors (fail-open)
- Updated by push notifications and 3-day alarm

**Key Functions**:

```javascript
async function validateSubscription()               // Read from storage (no API call)
async function forceRefreshSubscription()           // API call with fail-open logic
  // - Reads current lock state BEFORE making API call
  // - Attempts token refresh on 401 errors
  // - Preserves unlock state on all error types
  // - Only locks when API confirms subscription is inactive
async function clearSubscriptionCache()             // Force revalidation
```

**Subscription States**:

- `active` - Subscription valid, all features unlocked
- `trialing` - Trial period, all features unlocked
- `canceled` - Subscription canceled, features locked
- `past_due` - Payment failed, grace period (still unlocked)
- `incomplete` - Payment not completed
- **NEW**: `token_expired_preserved` - Token expired but access preserved (fail-open)
- **NEW**: `api_error_preserved` - API error but access preserved (fail-open)
- **NEW**: `network_error_preserved` - Network error but access preserved (fail-open)

**Token Refresh Flow** (NEW):

When 401 Unauthorized received:

1. Extract `refresh_token` from storage
2. POST to `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`
3. Receive new `access_token` and `refresh_token`
4. Update storage with new tokens
5. Retry original API call with new token
6. If success → continue normally
7. If fails → preserve unlock state (fail-open)

**Error Handling Matrix**:

| Scenario                        | Behavior                                |
| ------------------------------- | --------------------------------------- |
| Paddle API timeout              | ✅ Database fallback (web app)          |
| Token expired                   | ✅ Auto-refresh token                   |
| Token refresh fails             | ✅ Preserve unlock if user was unlocked |
| API 500/503 error               | ✅ Preserve current lock state          |
| Network offline                 | ✅ Preserve current lock state          |
| Subscription confirmed inactive | ✅ Lock user (correct)                  |

---

## Features

### Feature 1: Calendar Day Coloring

**Files**:

- `features/calendar-coloring/index.js` - Entry point
- `features/calendar-coloring/core/dayColoring.js` - Weekday coloring
- `features/calendar-coloring/core/monthColoring.js` - Month view
- `features/calendar-coloring/utils/dateUtils.js` - Date helpers

**How It Works**:

1. Content script loads on Google Calendar
2. Waits for DOM ready (`.roMxlc` grid appears)
3. Identifies day cells by data attributes
4. Applies background colors with opacity
5. Watches for navigation (MutationObserver)
6. Re-colors on date change

**DOM Selectors**:

- Day cells: `[data-datekey="YYYYMMDD"]`
- Grid container: `.roMxlc`
- Month view: `.DShyMc-bN97Pc-Y93ICc`

**Priority System**:

1. Specific date colors (highest)
2. Weekday colors (medium)
3. No color (lowest)

**Performance**:

- Debounced repaints (100ms)
- Only repaints visible cells
- Uses CSS custom properties for colors

---

### Feature 2: Individual Task Coloring

**Files**:

- `features/tasks-coloring/index.js` - Main logic (903 lines)
- `features/tasks-coloring/styles.css` - Task styles
- `content/modalInjection.js` - Task modal detection

**How It Works**:

1. Detects tasks on calendar grid
2. Injects color picker into task popup
3. Saves color to `cf.taskColors` in storage
4. Repaints tasks when navigating

**DOM Selectors**:

- Task chips: `[data-eventid^="tasks."]` or `[data-eventid^="tasks_"]`
- Task popup: `[data-draggable-id]` containing task
- Task modal: `.hWWDdQJzRQ==` (edit modal)

**Color Picker Injection**:

- **Popup**: Inline colors + "Choose Color" button
- **Modal**: Full color picker with tabs

**Storage**:

- Manual colors: `cf.taskColors[taskId] = color`
- Synced across devices via Chrome Sync

**Performance**:

- Caches task element references (WeakMap)
- Debounced repaints (100ms)
- Only repaints visible tasks

---

### Feature 3: Task List Default Colors (NEW)

**Files**:

- `lib/google-tasks-api.js` - API integration
- `features/tasks-coloring/index.js` - Coloring logic
- `background.js` - State machine & message handlers
- `popup/popup.html` - UI
- `popup/popup.js` - UI logic

**How It Works**:

**1. OAuth & Initial Sync**:

```javascript
// User clicks "Grant Access"
background.js: handleOAuthRequest()
  ↓
google-tasks-api.js: getAuthToken(true) // interactive=true
  ↓
Chrome shows OAuth consent
  ↓
google-tasks-api.js: buildTaskToListMapping()
  ↓
Parallel fetches all lists → all tasks
  ↓
Stores mapping: cf.taskToListMap[taskId] = listId
Stores metadata: cf.taskListsMeta = [{ id, title, updated }]
```

**2. Setting Default Colors**:

```javascript
// User sets color for "Work Tasks" list
popup.js: colorPicker.onColorChange(color)
  ↓
storage.js: setTaskListDefaultColor(listId, color)
  ↓
Saves to cf.taskListColors[listId] = color
  ↓
Optional: Apply to existing tasks
  ↓
background.js: APPLY_LIST_COLOR_TO_EXISTING
  ↓
content: repaintAllTasksInList(listId, color)
```

**3. Instant Coloring for New Tasks**:

```javascript
// User creates new task on calendar
features/tasks-coloring/index.js: doRepaint()
  ↓
Finds task not in cache
  ↓
Sends NEW_TASK_DETECTED to background
  ↓
background.js: handleNewTaskDetected(taskId)
  ↓
  Quick cache lookup: getListIdForTask(taskId)
  ↓ (if not found)
  API search: findTaskInAllLists(taskId)
    ↓
    Fast path: Search last 30 seconds (parallel)
    ↓ (fallback)
    Full search: All lists (parallel)
  ↓
  Returns: { success: true, listId, color }
  ↓
content: paintTaskImmediately(taskId, color)
  ↓
Task colored in <1 second
```

**4. State Machine (Smart Polling)**:

```javascript
// Calendar tab active + recent activity
→ ACTIVE mode: 1-minute polling

// Calendar open, no recent activity (5 min idle)
→ IDLE mode: 5-minute polling

// No calendar tabs open
→ SLEEP mode: Polling paused
```

**In-Memory Cache** (99.9% improvement):

```javascript
// features/tasks-coloring/index.js

let taskToListMapCache = null;
let listColorsCache = null;
let manualColorsCache = null;
let cacheLastUpdated = 0;
const CACHE_LIFETIME = 30000; // 30 seconds

async function refreshColorCache() {
  // Check if cache is still fresh
  if (cache valid && not expired) {
    return cached data;
  }

  // Parallel fetch all color data
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get('cf.taskToListMap'),
    chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors'])
  ]);

  // Update cache
  taskToListMapCache = localData;
  manualColorsCache = syncData.taskColors;
  listColorsCache = syncData.taskListColors;
  cacheLastUpdated = Date.now();

  return cache;
}

// Invalidate cache on storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (color data changed) {
    invalidateColorCache();
    repaintSoon();
  }
});
```

**Priority System**:

```javascript
async function getColorForTask(taskId, manualColorsMap) {
  const cache = await refreshColorCache();

  // Priority 1: Manual color (highest)
  if (cache.manualColors[taskId]) {
    return cache.manualColors[taskId];
  }

  // Priority 2: List default color
  const listId = cache.taskToListMap[taskId];
  if (listId && cache.listColors[listId]) {
    return cache.listColors[listId];
  }

  // Priority 3: No color
  return null;
}
```

**Setting Independence** (v0.0.3 Fix):

Previously, task color settings had artificial dependencies:
- Text colors required background colors to work
- Completed styling required pending styling to be set
- Task list coloring required inline colors toggle

**After Fix** (`features/tasks-coloring/index.js`):

1. **Removed restrictive early return**:
```javascript
// OLD - would skip rendering if both settings disabled:
if (!quickPickColoringEnabled && !taskListColoringEnabled) {
  return; // Exit early - nothing to paint
}

// NEW - check for ANY active setting:
// Text colors, completed styling, etc. all work independently
```

2. **buildColorInfo() uses transparent backgrounds**:
```javascript
function buildColorInfo({ baseColor, pendingTextColor, isCompleted, completedStyling }) {
  // Allow styling even without base color - use transparent background
  const defaultBgColor = 'rgba(255, 255, 255, 0)';

  const bgColor = baseColor || defaultBgColor;
  const textColor = pendingTextColor || pickContrastingText(bgColor);

  return {
    backgroundColor: bgColor,
    textColor,
    bgOpacity: baseColor ? 1 : 0, // 0 opacity if using transparent
    textOpacity: 1,
  };
}
```

3. **getColorForTask() checks ALL settings**:
```javascript
// Check for any list-based settings (background, text, OR completed styling)
if (listId) {
  const listBgColor = cache.listColors[listId];
  const hasTextColor = !!pendingTextColor;
  const hasCompletedStyling = isCompleted && completedStyling?.enabled;

  // Apply colors if we have ANY setting (not just background)
  if (listBgColor || hasTextColor || hasCompletedStyling) {
    return buildColorInfo({ baseColor: listBgColor, ... });
  }
}
```

**Result**: Users can now:
- Set only text opacity without background color
- Style completed tasks without styling pending tasks
- Use task list coloring independently of inline colors

**Performance Metrics**:

- Storage reads: 33/sec → 0.03/sec (99.9% reduction)
- Instant coloring: <1 second for new tasks
- Parallel searches: 10× faster than sequential
- API quota safe: <70% for heavy users

---

### Feature 4: Time Blocking

**Files**:

- `features/time-blocking/index.js` - Entry point
- `features/time-blocking/core/timeBlocking.js` - Rendering logic

**How It Works**:

1. Renders colored overlays on calendar grid
2. Supports weekly recurring blocks
3. Supports date-specific one-time blocks
4. Multiple shading styles (solid, striped, dotted, gradient)

**DOM Selectors**:

- Time grid: `.Nj8eUd`
- Time slots: `[data-datekey][data-time]`

**Storage**:

```javascript
{
  "weeklySchedule": {
    "1": [                              // Monday (0=Sunday)
      {
        "id": "block_123",
        "startTime": "09:00",
        "endTime": "17:00",
        "color": "#4285f4"
      }
    ]
  },
  "dateSpecificSchedule": {
    "2025-11-03": [
      {
        "id": "block_456",
        "startTime": "14:00",
        "endTime": "16:00",
        "color": "#ea4335"
      }
    ]
  }
}
```

---

### Shared: Color Picker (`features/shared/utils.js`)

**Purpose**: Reusable custom color picker component

**Global Access**: `window.cc3SharedUtils.createCustomColorPicker(options)`

**API**:

```javascript
const picker = window.cc3SharedUtils.createCustomColorPicker({
  initialColor: '#4285f4', // Starting color
  openDirection: 'down', // 'up' or 'down'
  position: 'popup', // 'popup' or 'modal'
  enableTabs: true, // Show color palette tabs
  onColorChange: (color) => {}, // Callback on color change
  onApply: (color) => {}, // Callback on apply
  onClear: () => {}, // Callback on clear
});

// Methods
picker.setColor(color); // Programmatically set color
picker.getColor(); // Get current color
picker.open(); // Open picker
picker.close(); // Close picker
picker.destroy(); // Clean up
```

**Color Palettes**:

- **Vibrant**: 31 colors (bold, saturated)
- **Pastel**: 35 colors (soft, muted)
- **Dark**: 36 colors (deep, rich)
- **Custom**: User-saved colors from `customDayColors`

**DOM Structure**:

```html
<div class="cc3-color-picker-container">
  <div class="cc3-color-preview" style="background: #4285f4;"></div>
  <div class="cc3-color-dropdown" style="display: none;">
    <div class="cc3-color-tabs">
      <button data-tab="vibrant">Vibrant</button>
      <button data-tab="pastel">Pastel</button>
      <button data-tab="dark">Dark</button>
      <button data-tab="custom">Custom</button>
    </div>
    <div class="cc3-color-grid">
      <!-- Color swatches -->
    </div>
    <div class="cc3-color-actions">
      <button class="cc3-color-apply">Apply</button>
      <button class="cc3-color-clear">Clear</button>
    </div>
  </div>
</div>
```

---

## Storage Schema

### Chrome Storage Sync (max 100KB, syncs across devices)

```javascript
{
  // Main settings object
  "settings": {
    "enabled": false,                                // Day coloring enabled
    "weekdayColors": {
      "0": "#ffffff",                                // Sunday
      "1": "#ffffff",                                // Monday
      "2": "#ffffff",                                // Tuesday
      "3": "#ffffff",                                // Wednesday
      "4": "#ffffff",                                // Thursday
      "5": "#ffffff",                                // Friday
      "6": "#ffffff"                                 // Saturday
    },
    "weekdayOpacity": 15,                            // 0-100
    "dateColors": {
      "2025-11-03": "#ff0000",                       // YYYY-MM-DD format
      "2025-12-25": "#34a853"
    },
    "presetColors": [
      "#4285f4", "#ea4335", "#fbbc04", "#34a853",    // 12 preset colors
      "#ff6d00", "#46bdc6", "#7baaf7", "#f07b72",
      "#fdd663", "#81c995", "#9e69af", "#e8710a"
    ],
    "weekStart": 0,                                  // 0=Sunday, 1=Monday
    "taskColoring": {
      "enabled": false,
      "presetColors": [                              // Calendar popup colors
        "#4285f4", "#ea4335", "#fbbc04", "#34a853",
        "#ff6d00", "#46bdc6", "#7baaf7", "#f07b72",
        "#fdd663", "#81c995", "#9e69af", "#e8710a"
      ],
      "inlineColors": [                              // Task modal inline colors
        "#4285f4", "#ea4335", "#fbbc04", "#34a853",
        "#ff6d00", "#46bdc6", "#7baaf7", "#f07b72"
      ]
    },
    "taskListColoring": {
      "enabled": false,
      "oauthGranted": false,
      "lastSync": null,                              // Timestamp
      "syncInterval": 5                              // Minutes
    },
    "timeBlocking": {
      "enabled": false,
      "globalColor": "#FFEB3B",
      "shadingStyle": "solid",                       // solid|striped|dotted|gradient
      "weeklySchedule": {
        "0": [],                                     // Sunday blocks
        "1": [                                       // Monday blocks
          {
            "id": "block_abc123",
            "startTime": "09:00",
            "endTime": "17:00",
            "color": "#4285f4"                       // Optional override
          }
        ]
      },
      "dateSpecificSchedule": {
        "2025-11-03": [
          {
            "id": "block_def456",
            "startTime": "14:00",
            "endTime": "16:00",
            "color": "#ea4335"
          }
        ]
      }
    }
  },

  // Manual task colors
  "cf.taskColors": {
    "taskId_abc123": "#4285f4",
    "taskId_def456": "#ea4335"
  },

  // Task list default colors
  "cf.taskListColors": {
    "listId_xyz789": "#4285f4",                      // "Work Tasks" → Blue
    "listId_mno012": "#34a853"                       // "Personal" → Green
  },

  // User's custom saved colors
  "customDayColors": [
    "#ff0000",
    "#00ff00",
    "#0000ff"
  ]
}
```

### Chrome Storage Local (max 10MB, device-specific)

```javascript
{
  // Task ID → List ID mapping (cached from Google Tasks API)
  "cf.taskToListMap": {
    "LVhVQzRlWm9Idk9sRzRnNA": "MTIzNDU2Nzg5",       // Base64 task ID → List ID
    "NTNWX1FUaFBrdWE0Vnl5Uw": "MTIzNDU2Nzg5",
    "-XUC4eZoHvOlG4g4": "listId_work"               // Decoded task ID → List ID
  },

  // Task lists metadata
  "cf.taskListsMeta": [
    {
      "id": "MTIzNDU2Nzg5",
      "title": "My Tasks",
      "updated": "2025-11-03T12:00:00.000Z"
    },
    {
      "id": "listId_work",
      "title": "Work Tasks",
      "updated": "2025-11-03T10:30:00.000Z"
    }
  ],

  // Subscription status (from Supabase)
  "subscriptionStatus": {
    "isActive": true,
    "status": "active",                              // active|trialing|canceled|past_due
    "reason": "subscription_active",
    "scheduledCancellation": false,
    "lastChecked": 1699000000000                     // Timestamp
  }
}
```

---

## Message Passing

### Background ← → Content Script

**Content → Background**:

```javascript
// Subscription validation
chrome.runtime.sendMessage(
  {
    type: 'CHECK_SUBSCRIPTION',
  },
  (response) => {
    // response: { isActive: boolean, status: string, reason: string }
  },
);

// Google OAuth request
chrome.runtime.sendMessage(
  {
    type: 'GOOGLE_OAUTH_REQUEST',
  },
  (response) => {
    // response: { success: boolean, token: string, error?: string }
  },
);

// Trigger sync
chrome.runtime.sendMessage(
  {
    type: 'SYNC_TASK_LISTS',
  },
  (response) => {
    // response: { success: boolean, taskCount: number, error?: string }
  },
);

// New task detected (instant coloring)
chrome.runtime.sendMessage(
  {
    type: 'NEW_TASK_DETECTED',
    taskId: 'taskId_abc123',
  },
  (response) => {
    // response: { success: boolean, listId: string, color: string }
  },
);

// Get list default color
chrome.runtime.sendMessage(
  {
    type: 'GET_LIST_DEFAULT_COLOR',
    listId: 'listId_xyz789',
  },
  (response) => {
    // response: string (color) or null
  },
);

// Activity tracking
chrome.runtime.sendMessage({
  type: 'USER_ACTIVITY',
});

chrome.runtime.sendMessage({
  type: 'CALENDAR_TAB_ACTIVE',
});

chrome.runtime.sendMessage({
  type: 'CALENDAR_TAB_INACTIVE',
});
```

**Background → Content**:

```javascript
// Task lists updated notification
chrome.tabs.sendMessage(tabId, {
  type: 'TASK_LISTS_UPDATED',
});

// Feature toggled
chrome.tabs.sendMessage(tabId, {
  type: 'FEATURE_TOGGLED',
  feature: 'taskListColoring',
  enabled: true,
});
```

### Background ← → Popup

**Popup → Background**:

```javascript
// Same messages as Content → Background
// Plus some popup-specific ones:

chrome.runtime.sendMessage({
  type: 'OPEN_WEB_APP',
});

chrome.runtime.sendMessage({
  type: 'CLEAR_AUTH',
});
```

---

## API Integrations

### Google Tasks API v1

**Base URL**: `https://tasks.googleapis.com/tasks/v1`

**Endpoints Used**:

```javascript
// List all task lists
GET /users/@me/lists
Response: { items: [ { id, title, updated, selfLink } ] }

// Get tasks in a list
GET /lists/{listId}/tasks?showCompleted=true&showHidden=true&maxResults=100&pageToken={token}
Query params:
  - showCompleted: true (include completed tasks for styling)
  - showHidden: true (CRITICAL: include tasks completed in first-party clients)
  - maxResults: 100 (pagination)
  - pageToken: for pagination
  - updatedMin: RFC3339 timestamp (incremental sync)
Response: { items: [ { id, title, updated, status, ... } ], nextPageToken }

// Get specific task (not currently used, but available)
GET /lists/{listId}/tasks/{taskId}
Response: { id, title, updated, status, ... }
```

**CRITICAL Parameter - showHidden**:

According to Google Tasks API documentation:
- `showHidden: false` → Only returns tasks completed via the API
- `showHidden: true` → Returns tasks completed in **first-party clients** (Google Calendar, mobile apps, etc.)

**Before Fix**:
- Extension used `showHidden: 'false'`
- Tasks completed in Google Calendar were NOT fetched
- Completed task coloring didn't work for most users

**After Fix** (v0.0.3):
- Changed to `showHidden: 'true'` in `fetchTasksInList()` and `fetchTasksWithCompletedLimit()`
- All completed tasks now fetched correctly
- Completed task styling works as expected

Files affected: `lib/google-tasks-api.js` (lines 145, 222)

**Authentication**:

- OAuth 2.0 with `chrome.identity.getAuthToken()`
- Scope: `https://www.googleapis.com/auth/tasks.readonly`
- Tokens cached for 55 minutes (expire at 60 minutes)

**Error Handling**:

- 401 Unauthorized → Clear token, retry
- 429 Rate Limit → Exponential backoff (1s, 2s, 4s, 8s, max 30s)
- 500 Server Error → Retry up to 2 times
- Network errors → Graceful fallback to cached data

**Quota Management**:

- Default quota: 50,000 queries/day
- Current usage: ~150 calls/day/user (normal use)
- Heavy user (35+ lists): ~34,000 calls/day
- Safe margin: Can support 333+ heavy users

---

### Supabase

**Purpose**: Subscription validation and user authentication

**Integration**:

- Supabase client initialized in `lib/subscription-validator.js`
- Validates subscription status on popup open
- Caches result for 5 minutes in local storage

**Tables** (inferred):

- `customers` - User subscription data
- Links to Paddle payment processor

**API Calls**:

- Check subscription status: Query `customers` table
- Validate user session
- Return: `{ isActive, status, reason, scheduledCancellation }`

---

## Critical Code Patterns

### 1. Deep Merge for Settings

**Problem**: Updating nested settings without overwriting sibling keys

**Solution** (`lib/storage.js`):

```javascript
function deepMerge(target, source) {
  const output = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

// Usage
const current = await chrome.storage.sync.get('settings');
const updated = deepMerge(current.settings, {
  taskListColoring: { enabled: true }, // Only updates this key
});
await chrome.storage.sync.set({ settings: updated });
```

**Why**: Prevents accidentally deleting unrelated settings when updating one feature

---

### 2. MutationObserver for DOM Changes

**Problem**: Google Calendar dynamically updates the DOM on navigation

**Solution** (`features/tasks-coloring/index.js`):

```javascript
const mo = new MutationObserver((mutations) => {
  mutationCount++;
  const hasLargeMutation = mutations.some((m) => m.addedNodes.length > 5);
  const isLikelyNavigation = mutationCount > 3 || hasLargeMutation;

  if (isLikelyNavigation && !isNavigating) {
    isNavigating = true;
    taskElementReferences.clear();
    repaintSoon();
    setTimeout(repaintSoon, 10);
    setTimeout(repaintSoon, 50);
    setTimeout(repaintSoon, 150);
    setTimeout(() => {
      isNavigating = false;
      mutationCount = 0;
    }, 500);
  } else {
    debounceRepaint();
  }
});

mo.observe(document.body, {
  childList: true,
  subtree: true,
});
```

**Why**: Google Calendar doesn't fire native navigation events, so we detect DOM mutations

---

### 3. Debouncing Expensive Operations

**Problem**: Repainting colors on every DOM change causes performance issues

**Solution**:

```javascript
let debounceTimer = null;

function debounceRepaint() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    repaintSoon();
  }, 100); // 100ms debounce
}
```

**Why**: Batches multiple rapid changes into a single repaint

---

### 4. WeakMap for Element References

**Problem**: Need to track painted task elements without memory leaks

**Solution**:

```javascript
const taskElementReferences = new WeakMap();

function paintTaskImmediately(taskId, color) {
  const els = findTaskElementOnCalendarGrid(taskId);
  els.forEach((el) => {
    taskElementReferences.set(taskId, el); // Track reference
    applyPaint(el, color);
  });
}
```

**Why**: WeakMap automatically cleans up when elements are removed from DOM

---

### 5. Feature Registry Pattern

**Problem**: Dynamically load features based on settings

**Solution** (`content/featureRegistry.js`):

```javascript
const features = {
  'day-coloring': () => import('./features/calendar-coloring/index.js'),
  'task-coloring': () => import('./features/tasks-coloring/index.js'),
  'time-blocking': () => import('./features/time-blocking/index.js'),
};

async function loadFeatures() {
  const settings = await chrome.storage.sync.get('settings');

  if (settings.settings?.enabled) {
    await features['day-coloring']();
  }

  if (settings.settings?.taskColoring?.enabled) {
    await features['task-coloring']();
  }

  if (settings.settings?.timeBlocking?.enabled) {
    await features['time-blocking']();
  }
}
```

**Why**: Only loads code for enabled features, reducing memory usage

---

### 6. State Machine for Polling

**Problem**: Balance sync frequency with API quota and performance

**Solution** (`background.js`):

```javascript
let pollingState = 'SLEEP'; // ACTIVE | IDLE | SLEEP
let activeCalendarTabs = new Set();
let lastUserActivity = Date.now();

async function updatePollingState() {
  const hasActiveTabs = activeCalendarTabs.size > 0;
  const recentActivity = Date.now() - lastUserActivity < 5 * 60 * 1000; // 5 min

  let newState;
  if (hasActiveTabs && recentActivity) {
    newState = 'ACTIVE'; // 1-minute polling
  } else if (hasActiveTabs) {
    newState = 'IDLE'; // 5-minute polling
  } else {
    newState = 'SLEEP'; // No polling
  }

  if (newState !== pollingState) {
    await transitionPollingState(pollingState, newState);
    pollingState = newState;
  }
}

async function transitionPollingState(from, to) {
  await chrome.alarms.clear('task-list-sync');

  if (to === 'ACTIVE') {
    await chrome.alarms.create('task-list-sync', { periodInMinutes: 1 });
  } else if (to === 'IDLE') {
    await chrome.alarms.create('task-list-sync', { periodInMinutes: 5 });
  }
  // SLEEP: no alarm
}
```

**Why**: Optimizes API calls based on user activity

---

### 7. Smart Storage Listener to Prevent DOM Destruction

**Problem**: Dragging opacity sliders causes popup to scroll/reset because storage changes trigger full DOM rebuild

**Root Cause**:
1. User drags opacity slider
2. `oninput` handler saves to storage: `setCompletedBgOpacity(listId, opacity)`
3. `storage.onChanged` listener fires
4. Listener calls `updateTaskListColoringToggle()`
5. Which calls `loadTaskLists()` → `taskListItems.innerHTML = ''`
6. Slider element destroyed while user is dragging it
7. Popup scroll resets when DOM is recreated

**Solution** (`popup/popup.js`):

```javascript
// OLD (destructive):
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    settings = changes.settings.newValue;
    updateTaskListColoringToggle(); // ALWAYS reloads task lists
  }
});

// NEW (selective):
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    const oldSettings = changes.settings.oldValue || {};
    const newSettings = changes.settings.newValue || {};
    settings = newSettings;

    // Check if ONLY completedStyling values changed (colors/opacities)
    const onlyCompletedStylingChanged = (() => {
      if (!oldSettings.taskListColoring || !newSettings.taskListColoring) return false;

      // Create copies and remove completedStyling from both
      const oldCopy = JSON.parse(JSON.stringify(oldSettings));
      const newCopy = JSON.parse(JSON.stringify(newSettings));

      if (oldCopy.taskListColoring) delete oldCopy.taskListColoring.completedStyling;
      if (newCopy.taskListColoring) delete newCopy.taskListColoring.completedStyling;

      // If everything else is identical, only completedStyling changed
      return JSON.stringify(oldCopy) === JSON.stringify(newCopy);
    })();

    // Only reload task lists if something other than completedStyling changed
    if (!onlyCompletedStylingChanged) {
      updateTaskListColoringToggle();
    }

    // Other updates continue normally
    updateToggle();
    updateTaskColoringToggle();
    // ...
  }
});
```

**Why**:
- Preserves DOM elements during slider interaction
- Prevents scroll reset when only colors/opacities change
- Still reloads when necessary (list changes, enable/disable, etc.)
- Makes sliders smooth and usable

---

## Performance Optimizations

### 1. In-Memory Cache (99.9% improvement)

**Before**:

```javascript
async function getColorForTask(taskId) {
  // 3 storage reads per task
  const { 'cf.taskColors': manual } = await chrome.storage.sync.get('cf.taskColors');
  const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
  const { 'cf.taskListColors': listColors } = await chrome.storage.sync.get('cf.taskListColors');

  // ... logic
}

// doRepaint() calls this for 50 tasks
// = 150 storage reads every 3 seconds
// = 50 reads/second
```

**After**:

```javascript
let taskToListMapCache = null;
let listColorsCache = null;
let manualColorsCache = null;
let cacheLastUpdated = 0;
const CACHE_LIFETIME = 30000; // 30 seconds

async function refreshColorCache() {
  if (cache valid) return cache;

  // 2 parallel reads (once per 30 seconds)
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get('cf.taskToListMap'),
    chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors'])
  ]);

  // Update cache
  taskToListMapCache = localData['cf.taskToListMap'] || {};
  manualColorsCache = syncData['cf.taskColors'] || {};
  listColorsCache = syncData['cf.taskListColors'] || {};
  cacheLastUpdated = Date.now();

  return cache;
}

async function getColorForTask(taskId) {
  const cache = await refreshColorCache();  // Uses cache if fresh

  // All lookups from memory
  if (cache.manualColors[taskId]) return cache.manualColors[taskId];
  const listId = cache.taskToListMap[taskId];
  if (listId) return cache.listColors[listId];
  return null;
}

// Invalidate on storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (color data changed) {
    cacheLastUpdated = 0;  // Force refresh
  }
});
```

**Result**:

- 150 reads/3sec → 2 reads/30sec
- 50 reads/sec → 0.07 reads/sec
- 99.86% reduction

---

### 2. Parallel API Searches

**Before**:

```javascript
async function findTaskInAllLists(taskId) {
  const lists = await fetchTaskLists();

  for (const list of lists) {
    const tasks = await fetchTasksInList(list.id); // Sequential
    const task = tasks.find((t) => t.id === taskId);
    if (task) return { listId: list.id, task };
  }

  return null;
}

// 10 lists = 10 sequential API calls = 10+ seconds
```

**After**:

```javascript
async function findTaskInAllLists(taskId) {
  const lists = await fetchTaskLists();

  // Parallel searches
  const searchPromises = lists.map(async (list) => {
    const tasks = await fetchTasksInList(list.id);
    const task = tasks.find((t) => atob(t.id) === taskId);
    return task ? { listId: list.id, task } : null;
  });

  const results = await Promise.all(searchPromises);
  return results.find((r) => r !== null);
}

// 10 lists = 10 parallel API calls = 1-2 seconds
```

**Result**: 5-10× faster for users with multiple lists

---

### 3. Fast Path for New Tasks

**Before**:

```javascript
async function findTaskInAllLists(taskId) {
  // Always searches all tasks in all lists
  const lists = await fetchTaskLists();
  // ... full search
}
```

**After**:

```javascript
async function findTaskInAllLists(taskId) {
  const lists = await fetchTaskLists();

  // FAST PATH: Search only recently updated tasks (last 30 seconds)
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
  const recentSearchPromises = lists.map(async (list) => {
    const recentTasks = await fetchTasksInList(list.id, thirtySecondsAgo);
    // updatedMin parameter filters to recent tasks only
    return recentTasks.find((t) => atob(t.id) === taskId);
  });

  const recentResults = await Promise.all(recentSearchPromises);
  const foundRecent = recentResults.find((r) => r !== null);

  if (foundRecent) return foundRecent; // Found in fast path!

  // FALLBACK: Full search if not found (rare)
  // ... full search
}
```

**Result**: New tasks found in <1 second (vs 5-10 seconds)

---

### 4. Debouncing Instant Lookups

**Before**:

```javascript
function handleNewTaskCreated(taskId) {
  // Immediately sends API request
  chrome.runtime.sendMessage({
    type: 'NEW_TASK_DETECTED',
    taskId: taskId,
  });
}

// Creating 5 tasks rapidly = 5 API searches
```

**After**:

```javascript
const pendingLookups = new Set();
const lookupDebounceTimers = new Map();
const LOOKUP_DEBOUNCE = 500; // 500ms

async function handleNewTaskCreated(taskId) {
  if (pendingLookups.has(taskId)) return; // Skip duplicates
  pendingLookups.add(taskId);

  // Clear existing timer
  if (lookupDebounceTimers.has(taskId)) {
    clearTimeout(lookupDebounceTimers.get(taskId));
  }

  // Wait 500ms before triggering API
  lookupDebounceTimers.set(
    taskId,
    setTimeout(async () => {
      lookupDebounceTimers.delete(taskId);

      // Now send request
      const response = await chrome.runtime.sendMessage({
        type: 'NEW_TASK_DETECTED',
        taskId: taskId,
      });

      pendingLookups.delete(taskId);
    }, LOOKUP_DEBOUNCE),
  );
}

// Creating 5 tasks rapidly = waits 500ms, then 5 parallel API searches
```

**Result**: Prevents API spam, groups rapid creates

---

## Security & Privacy

### Data Storage

- **Local only**: Task colors, settings, task→list mapping
- **Never leaves device**: Task content, titles, descriptions
- **Chrome Sync**: Some settings sync via Chrome's secure sync
- **No third-party servers**: Except Supabase for subscription validation

### OAuth Permissions

- **Read-only**: `tasks.readonly` scope (cannot modify/delete)
- **Limited scope**: Only task lists and task IDs, not content
- **User control**: Can revoke anytime via Google Account settings
- **Secure tokens**: Managed by Chrome, never exposed to extension code

### Subscription Validation

- **Minimal data**: Only checks subscription status
- **Encrypted**: All Supabase traffic over HTTPS
- **Cached**: 5-minute cache reduces server calls
- **No PII**: Extension doesn't send personal info to servers

### Content Security

- **No eval()**: No dynamic code execution
- **XSS protection**: `escapeHtml()` for user-generated content
- **CSP**: Content Security Policy in manifest
- **Isolated worlds**: Content scripts run in isolated JavaScript context

---

## Development Notes

### Building & Testing

**Load unpacked extension**:

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `customise calendar 3` folder

**Testing on Google Calendar**:

1. Open https://calendar.google.com
2. Open DevTools (F12) → Console
3. Check for errors
4. Test features via popup

**OAuth Testing**:

1. Need valid Google Cloud OAuth client ID in `manifest.json`
2. Extension ID must be added to OAuth authorized origins
3. Test both grant and revoke flows

### Debugging

**Enable verbose logging**:

```javascript
// In console (Google Calendar page)
localStorage.setItem('cc3_debug', 'true');
location.reload();
```

**Check storage**:

```javascript
// In console
chrome.storage.sync.get(null, (data) => console.log('Sync:', data));
chrome.storage.local.get(null, (data) => console.log('Local:', data));
```

**Monitor messages**:

```javascript
// In background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Message]', message.type, message, sender);
  // ... existing logic
});
```

### Common Pitfalls

1. **Storage quota**: Chrome sync has 100KB limit, local has 10MB limit
2. **Manifest V3**: Service workers replace background pages, context resets
3. **OAuth tokens**: Expire after 60 minutes, must refresh
4. **DOM selectors**: Google Calendar can change selectors, use data attributes
5. **Base64 encoding**: Task IDs are base64 in API, decoded in DOM

### Future Improvements

1. **Bulk operations**: Color multiple tasks at once
2. **Import/export**: Backup/restore settings
3. **Color templates**: Pre-defined color schemes
4. **Mobile support**: Detect mobile vs desktop
5. **Conflict resolution**: Handle concurrent edits across devices
6. **Offline mode**: Better handling of offline state
7. **Performance**: Virtual scrolling for large task lists

---

## Version History

### v0.0.3 (November 17, 2025) - UX Fixes & Polish

- 🐛 **Fixed: Completed task coloring** - `showHidden: true` parameter fix
- 🐛 **Fixed: Slider flickering** - Removed interfering hover effects
- 🐛 **Fixed: Slider scroll conflict** - Smart storage listener prevents DOM destruction
- 🐛 **Fixed: Setting dependencies** - All settings work independently now
- 🐛 **Fixed: Clear button UX** - Visual feedback and proper Google default reset
- ⚡ **Performance: Smart storage listener** - Only reloads when necessary
- 🎨 **UX: Transparent backgrounds** - Text-only and completed-only styling supported
- 📝 **Code locations**: `lib/google-tasks-api.js`, `popup/popup.js`, `popup/popup.html`, `features/tasks-coloring/index.js`

### v2.0 (January 2025) - Fail-Open Architecture

- 🔒 **CRITICAL**: Refactored to fail-open architecture
- ✅ Paying users never locked during API failures
- ✅ Auto-refresh expired tokens (1-hour expiry)
- ✅ Database fallback when Paddle API fails
- ✅ Preserve lock state on network/API errors
- 🐛 Fixed: Token expiry locking paying users
- 🐛 Fixed: Paddle API timeouts locking paying users
- 🐛 Fixed: Network issues locking paying users
- 📚 Documentation: Added FAIL_OPEN_ARCHITECTURE.md

### v1.0 (November 2025)

- ✨ NEW: Task List Default Colors feature
- ⚡ Performance: 99.9% faster color lookups
- ⚡ Instant coloring for new tasks (<1 second)
- 🐛 Fixed: Task ID encoding issues (base64 vs decoded)
- 🐛 Fixed: Storage read spam (33/sec → 0.03/sec)
- 🧹 Production cleanup: Removed 76 debug logs, 40 lines dead code

### v0.9 (October 2025)

- Initial release
- Calendar day coloring
- Individual task coloring
- Time blocking
- Supabase subscription integration

---

## Contact & Support

**Developers**: For codebase questions, refer to this document first

**Users**: See USER_GUIDE.md for usage instructions

**Issues**: Report at https://github.com/[your-repo]/issues

**License**: [Your license]

---

**End of CLAUDE.md** - Last updated November 17, 2025
