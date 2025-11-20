# ColorKit Chrome Extension - Architecture Analysis

**Analysis Date**: November 20, 2025  
**Focus**: Core systems, instant feedback mechanisms, edge case handling, and inter-dependencies

---

## Table of Contents

1. [Core Architecture Overview](#core-architecture-overview)
2. [Critical Code Patterns for Instant Feedback](#critical-code-patterns-for-instant-feedback)
3. [Edge Case Handling Strategies](#edge-case-handling-strategies)
4. [Message Passing Architecture](#message-passing-architecture)
5. [State Management & Polling](#state-management--polling)
6. [Critical Inter-Dependencies](#critical-inter-dependencies)
7. [Timing-Sensitive Areas](#timing-sensitive-areas)

---

## Core Architecture Overview

### Extension Execution Model

**Manifest V3** architecture with three execution contexts:

```
┌─────────────────────────────────────────────────────────────┐
│  SERVICE WORKER (background.js)                             │
│  - Always loaded, persists across page loads                │
│  - Message router, OAuth token manager, polling state       │
│  - Task list sync engine, subscription validation           │
│  - Broadcasts events to content scripts                     │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
              (chrome.runtime.sendMessage)
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│  CONTENT SCRIPTS (features/tasks-coloring/index.js, etc)   │
│  - Runs on https://calendar.google.com/*                   │
│  - DOM manipulation and event handling                      │
│  - In-memory caching of colors/mappings                     │
│  - MutationObserver for DOM change detection               │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
              (User interaction, DOM events)
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│  POPUP (popup/popup.html + popup.js)                        │
│  - 520x650px settings UI                                    │
│  - Feature toggles, color pickers, sync status             │
│  - Smart storage listener (selective reloading)             │
└─────────────────────────────────────────────────────────────┘
```

### Script Load Order (Critical)

Content scripts load in sequence defined in manifest.json:

```
1. lib/storage.js              (Storage API abstraction)
2. content/featureRegistry.js  (Feature registration system)
3. features/shared/utils.js    (Color picker utilities)
4. features/calendar-coloring/* (Day coloring feature)
5. features/tasks-coloring/index.js (Main task coloring - LARGEST FILE)
6. features/time-blocking/*    (Time blocking feature)
7. content/toolbar.js          (Toolbar injection)
8. content/modalInjection.js   (Task modal detection)
9. content/index.js            (ENTRY POINT - initializes everything)
```

**CRITICAL**: If load order is changed, global objects may not be available when needed:
- `window.cc3Storage` depends on lib/storage.js
- `window.cc3Features` depends on featureRegistry.js
- Feature registration requires both the registry AND the feature modules

---

## Critical Code Patterns for Instant Feedback

### 1. In-Memory Cache with 30-Second Lifetime

**Location**: `features/tasks-coloring/index.js:130-1009`

**Problem Solved**: Storage reads every task paint (50 tasks) = 150 storage reads/3sec = 50 reads/sec

**Solution Pattern**:

```javascript
// Cache variables (at module level)
let taskToListMapCache = null;
let listColorsCache = null;
let manualColorsCache = null;
let cacheLastUpdated = 0;
const CACHE_LIFETIME = 30000; // 30 seconds

async function refreshColorCache() {
  const now = Date.now();
  
  // CRITICAL: Check freshness before fetching
  if (taskToListMapCache && now - cacheLastUpdated < CACHE_LIFETIME) {
    return {
      taskToListMap: taskToListMapCache,
      listColors: listColorsCache,
      manualColors: manualColorsCache,
    };
  }

  // Parallel fetch of 2 storage areas (sync + local)
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get('cf.taskToListMap'),
    chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors']),
  ]);

  // Update cache and timestamp
  taskToListMapCache = localData['cf.taskToListMap'] || {};
  manualColorsCache = syncData['cf.taskColors'] || {};
  listColorsCache = syncData['cf.taskListColors'] || {};
  cacheLastUpdated = now;  // CRITICAL: Update timestamp AFTER populating

  return { taskToListMap: taskToListMapCache, ... };
}

function invalidateColorCache() {
  cacheLastUpdated = 0;  // Force refresh on next call
  // Don't null the objects - just invalidate timestamp
}
```

**Why This Works**:
- Parallel Promise.all fetches both storage areas simultaneously
- 30-second lifetime allows cache to remain valid during active coloring operations
- Invalidation is cheap (just reset timestamp) vs. re-zeroing objects
- First check is fastest path - most calls return cached data

**Cache Invalidation Triggers**:
```javascript
// In initTasksColoring():
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes['cf.taskColors'] || changes['cf.taskListColors'])) {
    invalidateColorCache();  // Force refresh on next getColorForTask call
    if (!isResetting) repaintSoon();
  }
  if (area === 'local' && changes['cf.taskToListMap']) {
    invalidateColorCache();
    if (!isResetting) repaintSoon();
  }
});
```

---

### 2. Debounced Repainting with Multiple Strategies

**Location**: `features/tasks-coloring/index.js:1466-1482`

**Problem**: Rapid DOM mutations could trigger 100+ repaints/sec if unbounded

**Solution Pattern**:

```javascript
let repaintQueued = false;
let repaintCount = 0;
let lastRepaintTime = 0;

async function doRepaint(bypassThrottling = false) {
  const now = Date.now();
  repaintCount++;

  // THROTTLING LOGIC: Allow faster repaints initially, then slow down
  if (!bypassThrottling) {
    const minInterval = repaintCount > 5 ? 100 : 25;  // 25ms first 5 times, then 100ms
    if (now - lastRepaintTime < minInterval) return;
    if (repaintCount > 15) return;  // Hard limit after 15 repaints
  }

  lastRepaintTime = now;
  // ... actual repainting logic
}

function repaintSoon(immediate = false) {
  if (repaintQueued && !immediate) return;  // Already scheduled
  repaintQueued = true;

  if (immediate) {
    // For critical operations (color picker, new task)
    doRepaint(true).then(() => {
      repaintQueued = false;
    });
  } else {
    // For DOM mutations - frame-based to avoid jank
    requestAnimationFrame(async () => {
      await doRepaint(false);
      repaintQueued = false;
    });
  }
}
```

**Three Repaint Triggering Modes**:

1. **Immediate** (`repaintSoon(true)`):
   - Used for color picker changes, new tasks
   - Bypasses throttling
   - Direct execution, no requestAnimationFrame

2. **Normal** (`repaintSoon()`):
   - Used for DOM mutations, storage changes
   - Uses requestAnimationFrame for frame-aware execution
   - Respects throttling (25ms initially, then 100ms)

3. **Retry** (in navigation):
   - Used when page navigation detected
   - Fires 3 additional repaints at 10ms, 50ms, 150ms delays
   - Catches late-loading elements

---

### 3. Navigation Detection via MutationObserver

**Location**: `features/tasks-coloring/index.js:1574-1610`

**Problem**: Google Calendar doesn't fire native navigation events; uses SPA-like DOM updates

**Solution Pattern**:

```javascript
const mo = new MutationObserver((mutations) => {
  mutationCount++;
  
  // DETECT NAVIGATION by mutation volume and structure
  const hasLargeMutation = mutations.some((m) => m.addedNodes.length > 5);
  const isLikelyNavigation = mutationCount > 3 || hasLargeMutation;

  if (isLikelyNavigation && !isNavigating) {
    isNavigating = true;
    
    // CRITICAL: Clear element cache for fresh discovery
    taskElementReferences.clear();
    
    // Rapid-fire repaints to catch elements at different load stages
    repaintSoon();                    // Immediate
    setTimeout(repaintSoon, 10);      // After 10ms
    setTimeout(repaintSoon, 50);      // After 50ms
    setTimeout(repaintSoon, 150);     // After 150ms
    
    // Reset after mutations settle (500ms timeout)
    setTimeout(() => {
      isNavigating = false;
      mutationCount = 0;
    }, 500);
  } else if (!isNavigating) {
    // Normal debouncing for minor updates
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(repaintSoon, 50);
  }
});

mo.observe(document.body, {
  childList: true,  // Watch for added/removed children
  subtree: true,    // Watch entire tree
});
```

**Why Multiple Repaints During Navigation**:
- 10ms: Catches early DOM updates
- 50ms: Catches mid-phase updates
- 150ms: Catches late async updates
- Google Calendar renders tasks in phases, not atomically

---

### 4. Parallel API Searches with Fast Path + Fallback

**Location**: `lib/google-tasks-api.js:495-570`

**Problem**: Finding a newly created task in N lists takes N sequential API calls (10+ seconds)

**Solution Pattern**:

```javascript
export async function findTaskInAllLists(taskId) {
  const lists = await fetchTaskLists();

  // FAST PATH: Search only last 30 seconds of updates (parallel)
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
  
  const recentSearchPromises = lists.map(async (list) => {
    try {
      const recentTasks = await fetchTasksInList(list.id, thirtySecondsAgo);
      const task = recentTasks.find((t) => {
        try {
          return atob(t.id) === taskId;  // Try decode
        } catch (e) {
          return t.id === taskId;  // Fall back to direct comparison
        }
      });
      return task ? { listId: list.id, listTitle: list.title, task } : null;
    } catch (error) {
      console.error(`[Fast Search] Error:`, error);
      return null;
    }
  });

  // Parallel execution - all lists searched simultaneously
  const recentResults = await Promise.all(recentSearchPromises);
  const foundRecent = recentResults.find((r) => r !== null);

  if (foundRecent) {
    // CACHE UPDATE: Store result for future lookups
    const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
    const updatedMapping = { ...(mapping || {}), [taskId]: foundRecent.listId };
    await chrome.storage.local.set({ 'cf.taskToListMap': updatedMapping });
    return { listId: foundRecent.listId, task: foundRecent.task };
  }

  // FALLBACK: Full search if not found recently (rare path)
  const fullSearchPromises = lists.map(async (list) => {
    // ... same logic as fast path, but without time filter
  });

  const fullResults = await Promise.all(fullSearchPromises);
  const foundFull = fullResults.find((r) => r !== null);

  if (foundFull) {
    // Update cache with found task
    const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
    const updatedMapping = { ...(mapping || {}), [taskId]: foundFull.listId };
    await chrome.storage.local.set({ 'cf.taskToListMap': updatedMapping });
    return { listId: foundFull.listId, task: foundFull.task };
  }

  return null;
}
```

**Performance Impact**:
- Fast path: ~1-2 seconds (single API call per list with time filter)
- vs. Sequential search: 10-15 seconds (multiple API calls per list)
- 5-10× speedup for newly created tasks

---

### 5. Color Priority System with Graceful Fallbacks

**Location**: `features/tasks-coloring/index.js:1042-1127`

**Problem**: Tasks can have colors from 3 sources; unclear which takes precedence

**Solution Pattern**:

```javascript
async function getColorForTask(taskId, manualColorsMap = null, options = {}) {
  const cache = await refreshColorCache();
  const manualColors = manualColorsMap || cache.manualColors;
  const listId = cache.taskToListMap[taskId];
  const isCompleted = options.isCompleted === true;

  // PRIORITY 1: Manual colors (highest)
  const manualColor = manualColors?.[taskId];
  if (manualColor) {
    // Manual always wins, even for completed tasks
    let bgOpacity = 0.3;  // Default 30% for completed
    let textOpacity = 0.3;

    // ... opacity handling logic
    return {
      backgroundColor: manualColor,
      textColor: overrideTextColor || pickContrastingText(manualColor),
      bgOpacity,
      textOpacity,
    };
  }

  // PRIORITY 2: List default colors
  if (listId) {
    const listBgColor = cache.listColors[listId];
    const hasTextColor = !!pendingTextColor;
    const hasCompletedStyling = isCompleted && completedStyling && 
      (completedStyling.mode || completedStyling.bgOpacity !== undefined);

    // Apply colors if we have ANY setting (background, text, or completed styling)
    if (listBgColor || hasTextColor || hasCompletedStyling) {
      return buildColorInfo({
        baseColor: listBgColor,
        pendingTextColor,
        isCompleted,
        completedStyling,
      });
    }
  }

  // PRIORITY 3: No color
  return null;
}
```

**Critical Fix (v0.0.3)**: Settings now work independently
- Can set text colors without background colors
- Can set completed styling without pending colors
- Uses transparent color (`rgba(255,255,255,0)`) to signal "use Google's default"

---

## Edge Case Handling Strategies

### 1. Double Initialization Prevention

**Location**: `features/tasks-coloring/index.js:1484-1491`

**Problem**: If content scripts reload or feature is re-initialized, listeners/observers accumulate

**Solution**:

```javascript
let initialized = false;

function initTasksColoring() {
  // Prevent duplicate initialization
  if (initialized) {
    // Already initialized - just trigger a repaint for any new settings
    repaintSoon();
    return;
  }
  initialized = true;

  // Set up MutationObserver, event listeners, etc.
  // These only get added once
}
```

**Why This Matters**: 
- MutationObserver fires callback on EVERY mutation
- If initialized twice, callback fires twice per mutation
- Cascades into exponential repaint calls

---

### 2. Stale Element Reference Cleanup

**Location**: `features/tasks-coloring/index.js:141-147`

**Problem**: WeakMap references to task elements can point to detached DOM nodes

**Solution**:

```javascript
let taskElementReferences = new Map();  // Using Map, not WeakMap, for cache control

function cleanupStaleReferences() {
  for (const [taskId, element] of taskElementReferences.entries()) {
    // isConnected = true only if element is in active DOM tree
    if (!element.isConnected) {
      taskElementReferences.delete(taskId);
    }
  }
}

// Called during doRepaint() to clean before processing
async function doRepaint(bypassThrottling = false) {
  // ...
  cleanupStaleReferences();  // Remove references to detached elements
  // ...
}
```

**Critical Difference**: 
- Using Map instead of WeakMap allows explicit cleanup control
- WeakMap would not fire cleanup until GC, leaving stale references in memory

---

### 3. Modal vs. Calendar Grid Distinction

**Location**: `features/tasks-coloring/index.js:32-67, 365-406`

**Problem**: Task elements appear in both modals AND on calendar grid; painting modal tasks breaks editing

**Solution Pattern**:

```javascript
function getPaintTarget(chip) {
  if (!chip) return null;

  // CRITICAL: Check if in modal FIRST
  const isInModal = chip.closest('[role="dialog"]');
  if (isInModal) return null;  // Never paint modal tasks

  // Only paint tasks on calendar grid
  const taskButton = chip.querySelector?.('.GTG3wb') || chip.closest?.('.GTG3wb');
  if (taskButton && !taskButton.closest('[role="dialog"]')) {
    return taskButton;
  }

  return chip;
}

// Used everywhere colors are applied
async function paintTaskImmediately(taskId, colorOverride = null) {
  const allTaskElements = document.querySelectorAll(`[data-eventid="tasks.${taskId}"], ...`);
  
  const modalElement = document.querySelector('[role="dialog"]');

  for (const taskElement of allTaskElements) {
    // CRITICAL: Skip if element is inside modal
    if (modalElement && modalElement.contains(taskElement)) {
      continue;
    }

    const target = getPaintTarget(taskElement);
    // ... apply paint
  }
}
```

**Result**: 
- Modal injection (injectTaskColorControls) adds color picker to modal
- Actual coloring only happens on grid
- Prevents modal element from being styled incorrectly

---

### 4. Google Color Capture Before Painting

**Location**: `features/tasks-coloring/index.js:551-606, 828-920`

**Problem**: Once colors are painted, can't distinguish original Google colors from painted colors

**Solution**:

```javascript
function captureGoogleTaskColors() {
  const allTasks = document.querySelectorAll(`[data-eventid^="tasks."], ...`);

  for (const taskEl of allTasks) {
    if (taskEl.closest('[role="dialog"]')) continue;

    const target = getPaintTarget(taskEl);
    if (!target) continue;

    // CRITICAL: Skip tasks we've already painted
    if (target.classList.contains(MARK)) {
      continue;  // Don't recapture our own colors
    }

    // CRITICAL: Skip if already captured
    if (target.dataset.cfGoogleBg) {
      continue;  // Only capture once
    }

    // Now capture Google's original colors
    const computedStyle = window.getComputedStyle(target);
    const googleBg = target.style.backgroundColor || computedStyle.backgroundColor;
    
    // Store whether this was a completed task (for unfading logic)
    const isCompleted = isTaskElementCompleted(taskEl);
    target.dataset.cfGoogleBg = googleBg;
    target.dataset.cfGoogleBgWasCompleted = isCompleted ? 'true' : 'false';
  }
}

// Called BEFORE any painting in doRepaint()
async function doRepaint(bypassThrottling = false) {
  // CRITICAL: Capture Google's original colors BEFORE we paint anything
  captureGoogleTaskColors();  // Line 1315
  
  // ... now safe to paint
}
```

**Why Critical**:
- Google pre-fades completed tasks (blends with white ~70%)
- Need to capture original color BEFORE conversion to custom colors
- Used later to recover original vibrant colors for styling

---

### 5. Reset Flag Prevents Repaint During Cleanup

**Location**: `features/tasks-coloring/index.js:545, 1688-1699`

**Problem**: When clearing list colors, storage changes trigger repaint of stale data

**Solution**:

```javascript
let isResetting = false;  // Flag to prevent repaint during reset

// In storage listener:
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes['cf.taskListColors']) {
    invalidateColorCache();
    if (!isResetting) {  // CRITICAL: Only repaint if not resetting
      repaintSoon();
    }
  }
});

// During reset operation:
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'RESET_LIST_COLORS') {
    isResetting = true;  // Block storage listener from repainting
    
    const { listId } = message;
    await unpaintTasksFromList(listId);  // Remove colors from DOM
    // Storage is cleared elsewhere
    
    // Reset flag after delay
    setTimeout(() => {
      isResetting = false;
    }, 1000);
  }
});
```

**Result**: Storage clear doesn't cascade into repainting with stale data

---

### 6. Smart Storage Listener in Popup (Prevents DOM Destruction)

**Location**: `popup/popup.js:6517-6555`

**Problem**: Dragging opacity sliders saves to storage → storage listener reloads task lists → DOM destroyed while user is dragging

**Solution Pattern**:

```javascript
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    const oldSettings = changes.settings.oldValue || {};
    const newSettings = changes.settings.newValue || {};

    // CRITICAL: Check if ONLY completedStyling values changed
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

    // Only reload task lists if something OTHER than completedStyling changed
    if (!onlyCompletedStylingChanged) {
      updateTaskListColoringToggle();  // This reloads task lists (HTML reset)
    }
    
    // Other updates continue normally
    updateToggle();
    updateTaskColoringToggle();
    // ... but DOM is not destroyed
  }
});
```

**Result**: 
- Slider dragging saves colors to storage
- Listener detects it's ONLY completedStyling changed
- Task list DOM not rebuilt
- Slider remains draggable, scroll position preserved

---

## Message Passing Architecture

### Background ← → Content Script Communication

**Pattern**: One-way request/response via `chrome.runtime.sendMessage`

```javascript
// Content → Background
const response = await chrome.runtime.sendMessage({
  type: 'NEW_TASK_DETECTED',
  taskId: taskId,
});
// response: { success: true, listId: "...", color: "..." }

// Background → Content (broadcast to all calendar tabs)
await broadcastToCalendarTabs({ type: 'TASK_LISTS_UPDATED' });

// Content receiving broadcast
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TASK_LISTS_UPDATED') {
    invalidateColorCache();
    taskElementReferences.clear();
    repaintSoon(true);  // Force immediate repaint
    sendResponse({ received: true });
  }
  return true;  // Required for async response
});
```

**Critical Messages**:

| Message Type | Direction | Purpose |
|---|---|---|
| NEW_TASK_DETECTED | Content → BG | Trigger instant API search for new task list |
| TASK_LISTS_UPDATED | BG → Content | Sync complete, repaint with new mappings |
| SUBSCRIPTION_CANCELLED | BG → Content | Lock all features immediately |
| SUBSCRIPTION_UPDATED | BG → Content | Revalidate and potentially re-enable |
| CHECK_SUBSCRIPTION | Content → BG | Verify subscription status |
| SYNC_TASK_LISTS | Any → BG | Trigger manual or automatic sync |

**Return Value Expectations**:

All message handlers must call `sendResponse()` or return `true` for async handlers:

```javascript
case 'NEW_TASK_DETECTED':
  handleNewTaskDetected(message.taskId).then(sendResponse);
  return true;  // REQUIRED for async response
```

---

### Storage Change Broadcasting

**Pattern**: All feature changes flow through storage, triggering listeners everywhere

```javascript
// Popup changes color → saves to storage
await chrome.storage.sync.set({
  'cf.taskListColors': { listId: newColor }
});

// Content script listener fires immediately
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes['cf.taskListColors']) {
    invalidateColorCache();
    repaintSoon();
  }
});

// Popup listener also fires (handles UI updates)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes['cf.taskListColors']) {
    updateTaskListColoringToggle();  // Refresh list display
  }
});
```

**Key Insight**: Changes propagate via storage, not direct messaging

---

## State Management & Polling

### Polling State Machine

**Location**: `background.js:636-998`

**Three States**:

```
SLEEP  ←→  IDLE  ←→  ACTIVE
  ↓         ↓         ↓
No polling  5-min   1-min polling
            polling
```

**Transition Logic**:

```javascript
let pollingState = 'SLEEP';
let activeCalendarTabs = new Set();
let lastUserActivity = Date.now();

async function updatePollingState() {
  const hasActiveTabs = activeCalendarTabs.size > 0;
  const recentActivity = Date.now() - lastUserActivity < 5 * 60 * 1000;  // 5 min

  let newState;
  if (hasActiveTabs && recentActivity) {
    newState = 'ACTIVE';  // Calendar open + user active
  } else if (hasActiveTabs) {
    newState = 'IDLE';    // Calendar open + user idle
  } else {
    newState = 'SLEEP';   // No calendar tabs
  }

  if (newState !== pollingState) {
    await transitionPollingState(pollingState, newState);
    pollingState = newState;
  }
}

async function transitionPollingState(from, to) {
  await chrome.alarms.clear('task-list-sync');

  if (to === 'ACTIVE') {
    await chrome.alarms.create('task-list-sync', {
      periodInMinutes: 5,  // 5-minute interval for fast sync
      delayInMinutes: 0,
    });
  } else if (to === 'IDLE') {
    await chrome.alarms.create('task-list-sync', {
      periodInMinutes: 15,  // 15-minute interval when idle
    });
  }
  // SLEEP: no alarm at all
}
```

**Activity Tracking**:

```javascript
// From content script
chrome.runtime.sendMessage({
  type: 'USER_ACTIVITY',  // Sent every 30 seconds max
});

// From background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_ACTIVITY') {
    lastUserActivity = Date.now();
    updatePollingState();
  }
});

// Tab lifecycle
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url?.includes('calendar.google.com')) {
    handleCalendarTabActive(activeInfo.tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleCalendarTabInactive(tabId);
});
```

**Benefits**:
- Minimizes API calls when not needed
- Prevents excessive polling during active use
- Automatic scale-down during idle time

---

### Full Sync vs. Incremental Sync

**Location**: `background.js:685-782`

**Decision Logic**:

```javascript
async function syncTaskLists(fullSync = false) {
  // Determine if we need to force a full sync
  let shouldDoFullSync = fullSync || !lastSyncTime;

  if (!shouldDoFullSync) {
    // Check if too many incremental syncs accumulated
    if (incrementalSyncCount >= MAX_INCREMENTAL_SYNCS_BEFORE_FULL) {
      shouldDoFullSync = true;  // Force full sync after 50 incrementals
    }

    // Check storage quota
    const { percentUsed } = await GoogleTasksAPI.checkStorageQuota();
    if (percentUsed > 70) {
      shouldDoFullSync = true;  // Force full sync if storage > 70%
    }
  }

  if (shouldDoFullSync) {
    await GoogleTasksAPI.buildTaskToListMapping();  // Replace entire mapping
    incrementalSyncCount = 0;
  } else {
    await GoogleTasksAPI.incrementalSync(lastSyncTime);  // Merge changes
    incrementalSyncCount++;
  }
}
```

**When Full Sync Occurs**:
- First sync ever
- User explicitly requests full sync
- After 50 incremental syncs (prevents drift)
- Storage approaching 70% of 10MB limit

---

## Critical Inter-Dependencies

### Dependency Graph (What Breaks What)

```
FOUNDATION LAYER (Must exist first)
├── lib/storage.js (window.cc3Storage)
├── content/featureRegistry.js (window.cc3Features)
└── features/shared/utils.js (window.cc3SharedUtils)
    │
    ├→ Breaks if missing: Features can't load
    ├→ Breaks if wrong order: Global objects undefined
    └→ Breaks if re-initialized: Storage API caching issues

FEATURE LAYER (Depends on foundation)
├── features/tasks-coloring/index.js
│   ├→ Requires: window.cc3Storage (getSettings, getAll)
│   ├→ Requires: window.cc3SharedUtils (createCustomColorPicker)
│   └→ Requires: chrome.storage.*
│
├── features/calendar-coloring/index.js
│   ├→ Requires: window.cc3Storage
│   └→ Requires: window.cc3Features
│
└── features/time-blocking/index.js
    ├→ Requires: window.cc3Storage
    └→ Requires: window.cc3Features

INITIALIZATION LAYER (Orchestrates everything)
└── content/index.js
    ├→ Waits for: window.cc3Features, window.cc3Storage
    ├→ Calls: window.cc3Features.boot()
    └→ Calls: window.cc3Toolbar.mount()
```

### If You Modify...

**Background.js** (service worker):
- ⚠️ All message types must match expected payloads
- ⚠️ Polling state transitions affect sync frequency
- ⚠️ Task list sync timing affects new task discovery speed

**Content/index.js** (entry point):
- ⚠️ Subscription check must happen before features.boot()
- ⚠️ Activity tracking startup messages enable smart polling
- ⚠️ Feature boot order matters (calendar-coloring before tasks)

**features/tasks-coloring/index.js** (main feature):
- ⚠️ Cache invalidation removes performance optimization
- ⚠️ Mutation detection timing affects navigation responsiveness
- ⚠️ Repaint throttling values affect visual feedback speed
- ⚠️ Google color capture MUST run before painting

**lib/google-tasks-api.js** (API integration):
- ⚠️ Token caching prevents repeated auth requests
- ⚠️ `showHidden: true` parameter is CRITICAL (completed tasks)
- ⚠️ Base64 decoding logic handles API response format variation
- ⚠️ Parallel searches require Promise.all semantics

**lib/storage.js** (data persistence):
- ⚠️ deepMerge logic prevents accidental setting overwrites
- ⚠️ Storage quota limits affect how much task data can be cached
- ⚠️ Sync storage has 100KB limit (larger lists use local storage)

---

## Timing-Sensitive Areas

### 1. **Navigation Detection Window (500ms)**

**Location**: `features/tasks-coloring/index.js:1600-1604`

```javascript
setTimeout(() => {
  isNavigating = false;
  mutationCount = 0;
}, 500);  // CRITICAL: Hard reset after 500ms
```

**Risk**: If navigation lasts > 500ms, system thinks it ended

**Symptom**: Tasks colored intermittently during slow navigation

**Fix**: Increase timeout if users report missing colors during page transitions

---

### 2. **Cache Lifetime (30 seconds)**

**Location**: `features/tasks-coloring/index.js:136`

```javascript
const CACHE_LIFETIME = 30000;  // CRITICAL: Stale after 30 seconds
```

**Risk**: If user doesn't interact for 30+ seconds, cache expires → higher latency

**Symptom**: Slower performance during idle periods (after 30 seconds)

**Tradeoff**: 
- Lower = more storage reads, worse performance
- Higher = stale data, colors not updating when changed from mobile

---

### 3. **Repaint Throttle Values (25ms → 100ms)**

**Location**: `features/tasks-coloring/index.js:1320`

```javascript
const minInterval = repaintCount > 5 ? 100 : 25;  // CRITICAL: Starts fast, slows down
```

**Risk**: Too high = sluggish visual feedback; Too low = browser jank

**Symptom**: 
- Too high: Color picker seems unresponsive
- Too low: Calendar lags during rapid mutations

---

### 4. **Lookup Debounce Delay (500ms)**

**Location**: `features/tasks-coloring/index.js:1238`

```javascript
const LOOKUP_DEBOUNCE = 500;  // Wait 500ms before API call for new task
```

**Risk**: Too high = slow coloring of new tasks; Too low = API spam

**Symptom**: New tasks take 500ms+ to color after creation

---

### 5. **Full Sync Frequency Thresholds**

**Location**: `background.js:641-642`

```javascript
const MAX_INCREMENTAL_SYNCS_BEFORE_FULL = 50;      // Force full sync after 50 incrementals
const STORAGE_THRESHOLD_FOR_FULL_SYNC = 70;        // Force at 70% storage
```

**Risk**: 
- Too high incrementals = drift in task-to-list mapping
- Too low storage threshold = frequent full syncs (slow)

---

### 6. **Poll Frequency by State**

**Location**: `background.js:981-993`

```javascript
if (to === 'ACTIVE') {
  periodInMinutes: 5,    // CRITICAL: 5-minute minimum
} else if (to === 'IDLE') {
  periodInMinutes: 15,   // 15-minute when idle
}
```

**Risk**: Too frequent = API quota exhaustion; Too infrequent = stale data

**API Budget** (50,000 calls/day):
- 5 users × 5-min polling × 24 hours = 1,440 calls/user
- Total: 7,200 calls/day (14% of budget) ✓

---

## Summary: Critical Safeguards

| Issue | Safeguard | Location |
|-------|-----------|----------|
| Double initialization | `initialized` flag | tasks-coloring:1486 |
| Stale DOM refs | `isConnected` check | tasks-coloring:143 |
| Modal painting | `closest([role="dialog"])` check | tasks-coloring:35 |
| Color precedence confusion | Explicit priority (manual > list > none) | tasks-coloring:1042 |
| Repaint spam | Throttling + queue flag | tasks-coloring:1466 |
| Cache staleness | 30-second lifetime | tasks-coloring:136 |
| Storage bloat | Full sync after 50 incrementals | background:641 |
| Slider destruction | Smart storage listener | popup:6525 |
| Navigation misses | Multi-stage repaint | tasks-coloring:1596 |
| API quota explosion | State-based polling | background:636 |

---

## Recommendations for Audit Fixes

1. **Before modifying message handlers**: Verify all callers pass expected payload structure
2. **Before changing repaint logic**: Test during fast navigation (week/month/agenda views)
3. **Before modifying storage**: Ensure deepMerge semantics still work
4. **Before tweaking timing**: Profile in Chrome DevTools, measure repaint counts
5. **Before removing cache**: Measure storage read frequency with DevTools profiler
6. **Before changing task coloring**: Test with 100+ tasks and manual + list colors
7. **Before modifying polling**: Calculate API quota impact for different frequencies

