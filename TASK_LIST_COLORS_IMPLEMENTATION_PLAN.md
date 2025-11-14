# Task List Default Colors - Production-Ready Implementation Plan

**Status**: Ready for Implementation
**Last Updated**: 2025-11-02
**Estimated Timeline**: 8-10 days

---

## Executive Summary

This plan details the safe implementation of **Task List Default Colors** feature for the ColorKit Chrome extension. The feature allows users to set default colors for Google Calendar task lists, with instant coloring via DOM detection + smart state-based polling.

**Key Principles**:
✅ Zero destruction of existing functionality
✅ Backward compatible with all existing features
✅ Production-ready with comprehensive edge case handling
✅ Opt-in feature (disabled by default)
✅ Graceful degradation if API fails

---

## Part 1: Codebase Analysis

### 1.1 Current Architecture

**Extension Structure**:

```
customise calendar 3/
├── manifest.json                    # Extension configuration
├── background.js                    # Service worker (subscription validation, push notifications)
├── popup/
│   ├── popup.html                   # Popup UI (520x650px)
│   └── popup.js                     # Popup logic (~37k tokens)
├── content/
│   ├── index.js                     # Main content script initialization
│   ├── modalInjection.js            # Task modal detection
│   └── toolbar.js                   # Toolbar injections
├── lib/
│   ├── storage.js                   # Settings storage utilities
│   └── subscription-validator.js   # Supabase subscription validation
├── features/
│   ├── shared/utils.js              # Shared utilities including createCustomColorPicker()
│   ├── tasks-coloring/
│   │   ├── index.js                 # Task coloring logic (903 lines)
│   │   └── styles.css               # Task coloring styles
│   ├── calendar-coloring/           # Day coloring feature
│   └── time-blocking/               # Time blocking feature
└── config.production.js             # Production configuration
```

**Key Files & Line References**:
| File | Lines | Purpose |
|------|-------|---------|
| `features/shared/utils.js` | 120-844 | Custom color picker implementation |
| `features/tasks-coloring/index.js` | 761-793 | MutationObserver (detects new tasks) |
| `features/tasks-coloring/index.js` | 368-497 | Modal injection (color picker in task edit) |
| `lib/storage.js` | 1-300 | Storage patterns, deep merge logic |
| `lib/storage.js` | 68-72 | Task coloring settings structure |
| `popup/popup.html` | 2644-2743 | Task coloring section HTML |
| `popup/popup.js` | 1107, 2441, 2562 | Task coloring popup logic |
| `background.js` | 140-177 | Message handling |
| `manifest.json` | 11 | Current permissions |

### 1.2 Custom Color Picker API

**Location**: `features/shared/utils.js` lines 120-844
**Global Access**: `window.cc3SharedUtils.createCustomColorPicker(options)`

**API Signature**:

```javascript
window.cc3SharedUtils.createCustomColorPicker({
  initialColor: '#4285f4', // Starting color
  openDirection: 'down', // 'up' or 'down'
  position: 'popup', // 'popup' or 'modal'
  enableTabs: true, // Show Vibrant/Pastel/Dark/Custom tabs
  onColorChange: (color) => {}, // Called when color selected
  onApply: (color) => {}, // Called when apply clicked
  onClear: () => {}, // Called when clear clicked
});
```

**Returns**:

```javascript
{
  container: HTMLElement,             // DOM element to append
  setColor: (color) => void,          // Programmatically set color
  getColor: () => string,             // Get current color
  open: () => void,                   // Open picker
  close: () => void,                  // Close picker
  destroy: () => void                 // Clean up
}
```

**Color Palettes**:

- **Vibrant**: 31 colors (lines 208-241)
- **Pastel**: 35 colors (lines 242-282)
- **Dark**: 36 colors (lines 283-334)
- **Custom**: User-saved colors from `chrome.storage.sync.get('customDayColors')`

### 1.3 Storage Architecture

**Current Storage Keys**:

```javascript
{
  // Settings (chrome.storage.sync)
  "settings": {
    "enabled": false,                    // Day coloring enabled
    "weekdayColors": {...},              // Day colors
    "dateColors": {...},                 // Specific date colors
    "taskColoring": {
      "enabled": false,                  // Task coloring enabled
      "presetColors": [...],             // 12 preset colors
      "inlineColors": [...]              // 8 inline colors in modal
    },
    "timeBlocking": {...}                // Time blocking settings
  },

  // Individual task colors (chrome.storage.sync)
  "cf.taskColors": {
    "task-id-123": "#4285f4",           // Manual task colors
    "task-id-456": "#34a853"
  },

  // Subscription data (chrome.storage.local)
  "subscriptionStatus": {
    "isActive": true,
    "status": "active",
    "reason": "subscription_active",
    "scheduledCancellation": false
  },

  // Custom colors (chrome.storage.sync)
  "customDayColors": ["#ff0000", "#00ff00"]
}
```

**NEW Storage Keys to Add**:

```javascript
{
  // Task list default colors (chrome.storage.sync)
  "cf.taskListColors": {
    "MTIzNDU2Nzg5": "#4285f4",          // listId -> color
    "list-id-work": "#34a853"
  },

  // Task to list mapping cache (chrome.storage.local)
  "cf.taskToListMap": {
    "task-id-123": "MTIzNDU2Nzg5",      // taskId -> listId
    "task-id-456": "list-id-work"
  },

  // Task lists metadata (chrome.storage.local)
  "cf.taskListsMeta": [
    {
      "id": "MTIzNDU2Nzg5",
      "title": "My Tasks",
      "updated": "2025-01-01T00:00:00Z"
    }
  ],

  // Feature settings (chrome.storage.sync)
  "settings": {
    // ... existing settings ...
    "taskListColoring": {
      "enabled": false,                  // List coloring enabled
      "oauthGranted": false,             // Google OAuth granted
      "lastSync": null,                  // Last API sync timestamp
      "syncInterval": 5                  // Minutes (1 = active, 5 = idle)
    }
  }
}
```

### 1.4 Message Passing Architecture

**Background Script Listeners** (`background.js` lines 140-177):

- `CHECK_AUTH` - Check Supabase authentication status
- `CHECK_SUBSCRIPTION` - Check subscription status
- `OPEN_WEB_APP` - Open web portal
- `CLEAR_AUTH` - Clear authentication data
- `ENSURE_PUSH` - Ensure push notification subscription

**NEW Messages to Add**:

- `GOOGLE_OAUTH_REQUEST` - Request Google OAuth token
- `SYNC_TASK_LISTS` - Trigger task list sync
- `NEW_TASK_DETECTED` - Content script detected new task (needs instant list lookup)
- `GET_LIST_DEFAULT_COLOR` - Get default color for a list ID
- `CALENDAR_TAB_ACTIVE` - Calendar tab became visible
- `CALENDAR_TAB_INACTIVE` - Calendar tab hidden
- `USER_ACTIVITY` - User interacted with calendar

---

## Part 2: Implementation Sequence

### Phase 1: Google OAuth & API Integration (Days 1-2)

#### 1.1 Update `manifest.json`

```json
{
  "manifest_version": 3,
  "permissions": [
    "identity", // ← ADD THIS (for Google OAuth)
    "storage",
    "tabs",
    "cookies",
    "notifications",
    "alarms"
  ],
  "oauth2": {
    // ← ADD THIS BLOCK
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/tasks.readonly"]
  }
  // ... rest unchanged
}
```

**OAuth Setup Steps**:

1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials (Chrome Extension type)
3. Copy client ID to manifest.json
4. Add authorized origins: `chrome-extension://YOUR_EXTENSION_ID`

#### 1.2 Create `lib/google-tasks-api.js` (~350 lines)

**Purpose**: Isolated Google Tasks API integration module

**Functions**:

```javascript
// OAuth Management
async function getAuthToken(interactive = false)
async function clearAuthToken()
async function isAuthGranted()

// API Calls
async function fetchTaskLists()
async function fetchTasksInList(listId, updatedMin = null)
async function fetchTaskDetails(taskId, listId)

// Mapping & Caching
async function buildTaskToListMapping()
async function getListIdForTask(taskId)
async function refreshMapping()

// Storage
async function cacheTaskListsMeta(lists)
async function cacheTaskToListMap(mapping)
async function getLastSyncTime()
async function setLastSyncTime(timestamp)

// Error Handling
function handleApiError(error)
function isRateLimitError(error)
function exponentialBackoff(attempt)
```

**Key Implementation Details**:

```javascript
// lib/google-tasks-api.js

// OAuth token management
let cachedToken = null;
let tokenExpiry = null;

async function getAuthToken(interactive = false) {
  // Check if cached token is still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const token = await chrome.identity.getAuthToken({
      interactive: interactive,
      scopes: ['https://www.googleapis.com/auth/tasks.readonly'],
    });

    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes (tokens last 60min)
      return token;
    }
  } catch (error) {
    console.error('OAuth failed:', error);
    if (error.message?.includes('OAuth2 not granted')) {
      throw new Error('OAUTH_NOT_GRANTED');
    }
    throw error;
  }

  return null;
}

// Fetch all task lists
async function fetchTaskLists() {
  const token = await getAuthToken(false);
  if (!token) throw new Error('NO_AUTH_TOKEN');

  const response = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401) {
    // Token expired, clear and retry
    await clearAuthToken();
    throw new Error('TOKEN_EXPIRED');
  }

  if (response.status === 429) {
    throw new Error('RATE_LIMIT');
  }

  if (!response.ok) {
    throw new Error(`API_ERROR_${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

// Build complete task-to-list mapping
async function buildTaskToListMapping() {
  const lists = await fetchTaskLists();
  const mapping = {};

  // Fetch tasks from each list
  for (const list of lists) {
    try {
      const tasks = await fetchTasksInList(list.id);
      tasks.forEach((task) => {
        mapping[task.id] = list.id;
      });
    } catch (error) {
      console.warn(`Failed to fetch tasks for list ${list.title}:`, error);
      // Continue with other lists
    }
  }

  // Cache the mapping
  await chrome.storage.local.set({ 'cf.taskToListMap': mapping });

  // Cache list metadata
  await chrome.storage.local.set({
    'cf.taskListsMeta': lists.map((l) => ({
      id: l.id,
      title: l.title,
      updated: l.updated,
    })),
  });

  return mapping;
}

// Quick lookup for instant coloring
async function getListIdForTask(taskId) {
  const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
  return mapping?.[taskId] || null;
}

// Handle rate limiting with exponential backoff
async function exponentialBackoff(attempt) {
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
  return new Promise((resolve) => setTimeout(resolve, delay));
}
```

#### 1.3 Update `background.js` - API Integration (~150 lines added)

**Add after line 177** (after existing message handlers):

```javascript
// ========================================
// GOOGLE TASKS API INTEGRATION
// ========================================

import * as GoogleTasksAPI from './lib/google-tasks-api.js';

// State machine for polling
let pollingState = 'SLEEP'; // 'ACTIVE', 'IDLE', 'SLEEP'
let activeCalendarTabs = new Set();
let lastUserActivity = Date.now();

// Message handlers for task list coloring
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GOOGLE_OAUTH_REQUEST':
      handleOAuthRequest().then(sendResponse);
      return true;

    case 'SYNC_TASK_LISTS':
      syncTaskLists().then(sendResponse);
      return true;

    case 'NEW_TASK_DETECTED':
      handleNewTaskDetected(message.taskId).then(sendResponse);
      return true;

    case 'GET_LIST_DEFAULT_COLOR':
      getListDefaultColor(message.listId).then(sendResponse);
      return true;

    case 'CALENDAR_TAB_ACTIVE':
      handleCalendarTabActive(sender.tab?.id);
      sendResponse({ received: true });
      break;

    case 'CALENDAR_TAB_INACTIVE':
      handleCalendarTabInactive(sender.tab?.id);
      sendResponse({ received: true });
      break;

    case 'USER_ACTIVITY':
      lastUserActivity = Date.now();
      updatePollingState();
      sendResponse({ received: true });
      break;
  }

  return true;
});

// OAuth request handler
async function handleOAuthRequest() {
  try {
    const token = await GoogleTasksAPI.getAuthToken(true); // interactive
    if (token) {
      // Update settings to reflect OAuth granted
      const settings = await window.cc3Storage.getAll();
      await window.cc3Storage.setAll({
        ...settings,
        settings: {
          ...settings.settings,
          taskListColoring: {
            ...settings.settings.taskListColoring,
            oauthGranted: true,
          },
        },
      });

      // Perform initial sync
      await syncTaskLists();

      return { success: true, token: token };
    }
    return { success: false, error: 'NO_TOKEN' };
  } catch (error) {
    console.error('OAuth request failed:', error);
    return { success: false, error: error.message };
  }
}

// Sync task lists from Google API
async function syncTaskLists() {
  try {
    debugLog('Syncing task lists from Google Tasks API...');

    const mapping = await GoogleTasksAPI.buildTaskToListMapping();

    // Update last sync time
    const settings = await window.cc3Storage.getAll();
    await window.cc3Storage.setAll({
      ...settings,
      settings: {
        ...settings.settings,
        taskListColoring: {
          ...settings.settings.taskListColoring,
          lastSync: Date.now(),
        },
      },
    });

    debugLog(`Sync complete: ${Object.keys(mapping).length} tasks mapped`);

    // Notify content scripts
    await broadcastToCalendarTabs({ type: 'TASK_LISTS_UPDATED' });

    return { success: true, taskCount: Object.keys(mapping).length };
  } catch (error) {
    console.error('Task list sync failed:', error);
    return { success: false, error: error.message };
  }
}

// Handle new task detected (instant coloring)
async function handleNewTaskDetected(taskId) {
  try {
    debugLog('New task detected:', taskId);

    // Quick lookup from cache first
    let listId = await GoogleTasksAPI.getListIdForTask(taskId);

    // If not in cache, it's a brand new task - fetch from API
    if (!listId) {
      debugLog('Task not in cache, fetching from API...');
      // Try each list to find the task
      const lists = await GoogleTasksAPI.fetchTaskLists();
      for (const list of lists) {
        try {
          const tasks = await GoogleTasksAPI.fetchTasksInList(list.id);
          const task = tasks.find((t) => t.id === taskId);
          if (task) {
            listId = list.id;
            // Update cache
            const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
            mapping[taskId] = listId;
            await chrome.storage.local.set({ 'cf.taskToListMap': mapping });
            break;
          }
        } catch (error) {
          console.warn(`Error checking list ${list.title}:`, error);
        }
      }
    }

    if (listId) {
      // Get default color for this list
      const color = await getListDefaultColor(listId);
      return { success: true, listId, color };
    }

    return { success: false, error: 'TASK_NOT_FOUND' };
  } catch (error) {
    console.error('Error handling new task:', error);
    return { success: false, error: error.message };
  }
}

// Get default color for a list
async function getListDefaultColor(listId) {
  const { 'cf.taskListColors': listColors } = await chrome.storage.sync.get('cf.taskListColors');
  return listColors?.[listId] || null;
}

// State machine: Calendar tab active
function handleCalendarTabActive(tabId) {
  if (tabId) {
    activeCalendarTabs.add(tabId);
  }
  updatePollingState();
}

// State machine: Calendar tab inactive
function handleCalendarTabInactive(tabId) {
  if (tabId) {
    activeCalendarTabs.delete(tabId);
  }
  updatePollingState();
}

// Update polling state based on activity
async function updatePollingState() {
  const hasActiveTabs = activeCalendarTabs.size > 0;
  const recentActivity = Date.now() - lastUserActivity < 5 * 60 * 1000; // 5 minutes

  let newState;
  if (hasActiveTabs && recentActivity) {
    newState = 'ACTIVE';
  } else if (hasActiveTabs) {
    newState = 'IDLE';
  } else {
    newState = 'SLEEP';
  }

  if (newState !== pollingState) {
    debugLog(`Polling state transition: ${pollingState} → ${newState}`);
    await transitionPollingState(pollingState, newState);
    pollingState = newState;
  }
}

// Transition polling state
async function transitionPollingState(from, to) {
  // Clear existing alarm
  await chrome.alarms.clear('task-list-sync');

  // Set new alarm based on state
  if (to === 'ACTIVE') {
    // 1-minute polling
    await chrome.alarms.create('task-list-sync', {
      periodInMinutes: 1,
      delayInMinutes: 0,
    });
    debugLog('Polling: ACTIVE mode (1-minute interval)');
  } else if (to === 'IDLE') {
    // 5-minute polling
    await chrome.alarms.create('task-list-sync', {
      periodInMinutes: 5,
    });
    debugLog('Polling: IDLE mode (5-minute interval)');
  } else {
    // SLEEP - no polling
    debugLog('Polling: SLEEP mode (paused)');
  }
}

// Alarm listener for periodic sync
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'task-list-sync') {
    debugLog('Periodic task list sync triggered');
    await syncTaskLists();
  }
});

// Broadcast message to all calendar tabs
async function broadcastToCalendarTabs(message) {
  const tabs = await chrome.tabs.query({ url: 'https://calendar.google.com/*' });
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      // Tab might not have content script loaded
      debugLog(`Could not send message to tab ${tab.id}`);
    }
  }
}

// Monitor tab changes for state machine
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url?.includes('calendar.google.com')) {
    handleCalendarTabActive(activeInfo.tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleCalendarTabInactive(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('calendar.google.com')) {
    handleCalendarTabActive(tabId);
  }
});
```

---

### Phase 2: Storage Extensions (Day 3)

#### 2.1 Update `lib/storage.js` (~50 lines added)

**Add after line 257** (after task coloring functions):

```javascript
// ========================================
// TASK LIST COLORING FUNCTIONS
// ========================================

// Enable/disable list coloring feature
async function setTaskListColoringEnabled(enabled) {
  return setSettings({
    taskListColoring: { enabled },
  });
}

// Set default color for a task list
async function setTaskListDefaultColor(listId, color) {
  if (!listId) return;

  const { 'cf.taskListColors': current } = await chrome.storage.sync.get('cf.taskListColors');
  const updated = { ...(current || {}), [listId]: color };

  return new Promise((resolve) => {
    chrome.storage.sync.set({ 'cf.taskListColors': updated }, () => {
      resolve(updated);
    });
  });
}

// Clear default color for a task list
async function clearTaskListDefaultColor(listId) {
  if (!listId) return;

  const { 'cf.taskListColors': current } = await chrome.storage.sync.get('cf.taskListColors');
  const updated = { ...(current || {}) };
  delete updated[listId];

  return new Promise((resolve) => {
    chrome.storage.sync.set({ 'cf.taskListColors': updated }, () => {
      resolve(updated);
    });
  });
}

// Get all list default colors
async function getTaskListColors() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('cf.taskListColors', (res) => {
      resolve(res['cf.taskListColors'] || {});
    });
  });
}

// Get default color for specific task (checks list default)
async function getDefaultColorForTask(taskId) {
  // First check if task has manual color
  const { 'cf.taskColors': taskColors } = await chrome.storage.sync.get('cf.taskColors');
  if (taskColors?.[taskId]) {
    return { type: 'manual', color: taskColors[taskId] };
  }

  // Check list default
  const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
  const listId = mapping?.[taskId];

  if (listId) {
    const { 'cf.taskListColors': listColors } = await chrome.storage.sync.get('cf.taskListColors');
    const color = listColors?.[listId];
    if (color) {
      return { type: 'list_default', color, listId };
    }
  }

  return { type: 'none', color: null };
}

// Get task list metadata
async function getTaskListsMeta() {
  return new Promise((resolve) => {
    chrome.storage.local.get('cf.taskListsMeta', (res) => {
      resolve(res['cf.taskListsMeta'] || []);
    });
  });
}
```

**Update default settings** (line 61-88):

```javascript
const defaultSettings = {
  enabled: false,
  weekdayColors: DEFAULT_WEEKDAY_COLORS,
  weekdayOpacity: DEFAULT_WEEKDAY_OPACITY,
  dateColors: {},
  presetColors: DEFAULT_PRESET_COLORS,
  weekStart: 0,
  taskColoring: {
    enabled: false,
    presetColors: DEFAULT_TASK_PRESET_COLORS,
    inlineColors: DEFAULT_TASK_INLINE_COLORS,
  },
  // ← ADD THIS:
  taskListColoring: {
    enabled: false,           // List coloring feature toggle
    oauthGranted: false,      // Google OAuth granted
    lastSync: null,           // Last sync timestamp
    syncInterval: 5           // Sync interval in minutes
  },
  timeBlocking: {
    enabled: false,
    globalColor: '#FFEB3B',
    shadingStyle: 'solid',
    weeklySchedule: {...},
    dateSpecificSchedule: {}
  }
};
```

**Export new functions** (line 346+):

```javascript
window.cc3Storage = {
  // Existing exports...
  setTaskColoringEnabled,
  setTaskPresetColors,
  addTaskPresetColor,
  removeTaskPresetColor,
  updateTaskPresetColor,
  setTaskInlineColors,
  updateTaskInlineColor,

  // ← ADD THESE:
  setTaskListColoringEnabled,
  setTaskListDefaultColor,
  clearTaskListDefaultColor,
  getTaskListColors,
  getDefaultColorForTask,
  getTaskListsMeta,

  // Time blocking exports...
  setTimeBlockingEnabled,
  // ... rest
};
```

---

### Phase 3: Instant DOM Detection (Day 4)

#### 3.1 Update `features/tasks-coloring/index.js` (~100 lines added/modified)

**Enhance MutationObserver** (lines 761-793):

```javascript
// BEFORE (line 761):
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

// AFTER - Enhanced with new task detection:
const mo = new MutationObserver((mutations) => {
  mutationCount++;
  const hasLargeMutation = mutations.some((m) => m.addedNodes.length > 5);
  const isLikelyNavigation = mutationCount > 3 || hasLargeMutation;

  // ← ADD: Detect new task creation
  detectNewTasks(mutations);

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

// ← ADD: New function to detect task creation
async function detectNewTasks(mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue; // Skip non-elements

      // Check if this is a task element
      if (isTasksChip(node)) {
        const taskId = getTaskIdFromChip(node);
        if (taskId && !taskElementReferences.has(taskId)) {
          // This is a BRAND NEW task!
          console.log('🆕 New task detected:', taskId);
          handleNewTaskCreated(taskId, node);
        }
      }

      // Check children recursively
      const childTasks = node.querySelectorAll?.('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
      if (childTasks) {
        childTasks.forEach((childTask) => {
          const taskId = getTaskIdFromChip(childTask);
          if (taskId && !taskElementReferences.has(taskId)) {
            console.log('🆕 New child task detected:', taskId);
            handleNewTaskCreated(taskId, childTask);
          }
        });
      }
    }
  }
}

// ← ADD: Handle new task creation (instant coloring)
async function handleNewTaskCreated(taskId, element) {
  // Store reference immediately
  taskElementReferences.set(taskId, element);

  // Send message to background script for instant API call
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'NEW_TASK_DETECTED',
      taskId: taskId,
    });

    if (response?.success && response.color) {
      console.log(`🎨 Instant coloring task ${taskId} with list default: ${response.color}`);

      // Apply color immediately
      paintTaskImmediately(taskId, response.color);
    } else {
      console.log(`No list default color for task ${taskId}`);
    }
  } catch (error) {
    console.error('Error applying instant color:', error);
  }
}
```

**Update `paintTaskImmediately()` function** (line 328):

```javascript
// BEFORE (line 328):
function paintTaskImmediately(taskId, color) {
  const els = findTaskElementOnCalendarGrid(taskId);
  els.forEach((el) => {
    const target = getPaintTarget(el);
    if (!target) return;
    if (color) {
      applyPaint(target, color);
    } else {
      clearPaint(target);
    }
  });
}

// AFTER - Check list default if no manual color:
async function paintTaskImmediately(taskId, color) {
  // If color not provided, check for list default
  if (!color) {
    const defaultColor = await window.cc3Storage?.getDefaultColorForTask?.(taskId);
    if (defaultColor?.type === 'list_default') {
      color = defaultColor.color;
      console.log(`Using list default color for task ${taskId}: ${color}`);
    }
  }

  const els = findTaskElementOnCalendarGrid(taskId);
  els.forEach((el) => {
    const target = getPaintTarget(el);
    if (!target) return;
    if (color) {
      applyPaint(target, color);
    } else {
      clearPaint(target);
    }
  });
}
```

**Update task color priority** (where colors are loaded):

```javascript
// ADD at top of file near line 122:
async function getColorForTask(taskId) {
  // Priority 1: Manual color (existing behavior)
  const manualColor = cachedColorMap[taskId];
  if (manualColor) {
    return { type: 'manual', color: manualColor };
  }

  // Priority 2: List default color (NEW)
  const settings = await window.cc3Storage.getAll();
  if (settings.settings?.taskListColoring?.enabled) {
    const defaultColor = await window.cc3Storage.getDefaultColorForTask(taskId);
    if (defaultColor.color) {
      return defaultColor;
    }
  }

  // Priority 3: No color
  return { type: 'none', color: null };
}
```

#### 3.2 Update `content/index.js` (~30 lines added)

**Add activity tracking** (at end of file):

```javascript
// ========================================
// ACTIVITY TRACKING FOR SMART POLLING
// ========================================

let lastActivityReport = Date.now();

// Track user activity
['click', 'keydown'].forEach((eventType) => {
  document.addEventListener(
    eventType,
    () => {
      const now = Date.now();
      // Only report once per minute to reduce message spam
      if (now - lastActivityReport > 60000) {
        lastActivityReport = now;
        chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' });
      }
    },
    { passive: true },
  );
});

// Track page visibility
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    chrome.runtime.sendMessage({
      type: 'CALENDAR_TAB_ACTIVE',
    });
  } else {
    chrome.runtime.sendMessage({
      type: 'CALENDAR_TAB_INACTIVE',
    });
  }
});

// Report active immediately on load
if (document.visibilityState === 'visible') {
  chrome.runtime.sendMessage({
    type: 'CALENDAR_TAB_ACTIVE',
  });
}
```

---

### Phase 4: Popup UI Integration (Days 5-6)

#### 4.1 Update `popup/popup.html` (~200 lines added)

**Add after task coloring section** (after line ~2800):

```html
<!-- TASK LIST DEFAULT COLORS SECTION -->
<div class="section task-list-coloring" style="margin-top: 24px;">
  <div class="section-header">
    <h3><span class="section-icon">📋</span>Task List Default Colors</h3>
    <div class="toggle">
      <label>Enable list default colors</label>
      <div class="switch" id="enableTaskListColoring"></div>
    </div>
  </div>

  <div class="section-content">
    <div id="taskListColoringSettings" style="display: none;">
      <!-- OAuth Status -->
      <div id="oauthStatus" class="oauth-status">
        <div class="oauth-not-granted" id="oauthNotGranted">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="font-size: 32px;">🔐</div>
            <div>
              <div style="font-weight: 600; margin-bottom: 4px;">Google Calendar Access Required</div>
              <div style="font-size: 12px; color: #5f6368;">
                Grant permission to view your task lists and apply default colors
              </div>
            </div>
          </div>
          <button id="grantOAuthBtn" class="primary-button">
            Grant Access to Task Lists
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 8px;">
              <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <div style="font-size: 11px; color: #80868b; margin-top: 8px;">
            ✓ Read-only access &nbsp; ✓ Secure OAuth 2.0 &nbsp; ✓ Revoke anytime
          </div>
        </div>

        <div class="oauth-granted" id="oauthGranted" style="display: none;">
          <div
            style="display: flex; align-items: center; gap: 8px; color: #1e8e3e; font-size: 13px; margin-bottom: 16px;"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path
                d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z"
              />
            </svg>
            <span style="font-weight: 600;">Access Granted</span>
          </div>

          <!-- Sync Status -->
          <div
            id="syncStatus"
            style="margin-bottom: 16px; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 12px;"
          >
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span id="syncStatusText">Last synced: Never</span>
              <button id="manualSyncBtn" class="secondary-button" style="padding: 4px 12px; font-size: 11px;">
                Sync Now
              </button>
            </div>
          </div>

          <!-- Task Lists -->
          <div style="margin-bottom: 12px;">
            <label style="font-size: 13px; color: #333; display: block; margin-bottom: 8px; font-weight: 600;">
              Your Task Lists:
            </label>
            <div id="taskListsContainer" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- Dynamically populated -->
              <div class="loading-state" id="taskListsLoading">
                <div class="spinner"></div>
                <span>Loading task lists...</span>
              </div>

              <div class="empty-state" id="taskListsEmpty" style="display: none;">
                <div style="text-align: center; padding: 24px; color: #80868b;">
                  <div style="font-size: 32px; margin-bottom: 8px;">📝</div>
                  <div style="font-size: 13px;">No task lists found</div>
                  <div style="font-size: 11px; margin-top: 4px;">Create a task list in Google Calendar</div>
                </div>
              </div>

              <!-- Task list items will be inserted here -->
            </div>
          </div>

          <!-- Help Text -->
          <div
            style="font-size: 11px; color: #80868b; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #4285f4;"
          >
            <strong>How it works:</strong> Set a default color for each task list. New tasks will automatically get
            their list's default color. You can still override individual task colors.
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Add CSS styles -->
<style>
  .oauth-status {
    padding: 16px;
    background: #fff;
    border-radius: 8px;
  }

  .oauth-not-granted {
    text-align: center;
    padding: 8px;
  }

  .primary-button {
    background: linear-gradient(135deg, #4285f4 0%, #3367d6 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all 0.2s ease;
    font-size: 14px;
  }

  .primary-button:hover {
    background: linear-gradient(135deg, #3367d6 0%, #2851a3 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
  }

  .secondary-button {
    background: #f8f9fa;
    color: #3c4043;
    border: 1px solid #dadce0;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 13px;
  }

  .secondary-button:hover {
    background: #e8eaed;
    border-color: #bdc1c6;
  }

  .task-list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .task-list-item:hover {
    background: #fff;
    border-color: #4285f4;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .task-list-name {
    font-size: 13px;
    font-weight: 500;
    color: #3c4043;
    flex: 1;
  }

  .task-list-color-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    color: #80868b;
    font-size: 13px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #e0e0e0;
    border-top-color: #4285f4;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
```

#### 4.2 Update `popup/popup.js` (~300 lines added)

**Add after existing task coloring code** (after line ~3000):

```javascript
// ========================================
// TASK LIST COLORING POPUP LOGIC
// ========================================

// Initialize task list coloring section
async function initTaskListColoring() {
  const toggle = qs('enableTaskListColoring');
  const settingsDiv = qs('taskListColoringSettings');
  const oauthNotGranted = qs('oauthNotGranted');
  const oauthGranted = qs('oauthGranted');
  const grantOAuthBtn = qs('grantOAuthBtn');
  const manualSyncBtn = qs('manualSyncBtn');
  const taskListsContainer = qs('taskListsContainer');

  if (!toggle) return;

  // Get current settings
  const settings = await chrome.storage.sync.get('settings');
  const listColoringSettings = settings.settings?.taskListColoring || {};
  const isEnabled = listColoringSettings.enabled || false;
  const oauthGranted = listColoringSettings.oauthGranted || false;

  // Set toggle state
  toggle.classList.toggle('active', isEnabled);

  // Show/hide settings
  if (isEnabled) {
    settingsDiv.style.display = 'block';

    // Show appropriate OAuth state
    if (oauthGranted) {
      qs('oauthNotGranted').style.display = 'none';
      qs('oauthGranted').style.display = 'block';

      // Load and display task lists
      await loadTaskLists();

      // Update sync status
      updateSyncStatus(listColoringSettings.lastSync);
    } else {
      qs('oauthNotGranted').style.display = 'block';
      qs('oauthGranted').style.display = 'none';
    }
  } else {
    settingsDiv.style.display = 'none';
  }

  // Toggle click handler
  toggle.addEventListener('click', async () => {
    const newEnabled = !toggle.classList.contains('active');
    toggle.classList.toggle('active', newEnabled);

    // Update settings
    const currentSettings = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({
      settings: {
        ...currentSettings.settings,
        taskListColoring: {
          ...currentSettings.settings.taskListColoring,
          enabled: newEnabled,
        },
      },
    });

    // Show/hide settings
    settingsDiv.style.display = newEnabled ? 'block' : 'none';

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'FEATURE_TOGGLED',
      feature: 'taskListColoring',
      enabled: newEnabled,
    });

    debugLog('Task list coloring toggled:', newEnabled);
  });

  // Grant OAuth button
  grantOAuthBtn?.addEventListener('click', async () => {
    debugLog('Requesting Google OAuth...');

    // Disable button during request
    grantOAuthBtn.disabled = true;
    grantOAuthBtn.textContent = 'Requesting access...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GOOGLE_OAUTH_REQUEST',
      });

      if (response.success) {
        debugLog('OAuth granted successfully');

        // Update UI
        qs('oauthNotGranted').style.display = 'none';
        qs('oauthGranted').style.display = 'block';

        // Load task lists
        await loadTaskLists();

        // Show success message
        showToast('Access granted! Loading your task lists...', 'success');
      } else {
        debugLog('OAuth failed:', response.error);
        showToast('Failed to grant access. Please try again.', 'error');
        grantOAuthBtn.disabled = false;
        grantOAuthBtn.textContent = 'Grant Access to Task Lists';
      }
    } catch (error) {
      console.error('OAuth request error:', error);
      showToast('Error requesting access. Please try again.', 'error');
      grantOAuthBtn.disabled = false;
      grantOAuthBtn.textContent = 'Grant Access to Task Lists';
    }
  });

  // Manual sync button
  manualSyncBtn?.addEventListener('click', async () => {
    debugLog('Manual sync requested');

    // Disable button during sync
    manualSyncBtn.disabled = true;
    manualSyncBtn.textContent = 'Syncing...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SYNC_TASK_LISTS',
      });

      if (response.success) {
        debugLog('Sync successful:', response.taskCount, 'tasks');

        // Reload task lists
        await loadTaskLists();

        // Update sync status
        updateSyncStatus(Date.now());

        showToast(`Synced ${response.taskCount} tasks successfully!`, 'success');
      } else {
        debugLog('Sync failed:', response.error);
        showToast('Sync failed. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Sync error:', error);
      showToast('Sync error. Please try again.', 'error');
    } finally {
      manualSyncBtn.disabled = false;
      manualSyncBtn.textContent = 'Sync Now';
    }
  });
}

// Load and display task lists
async function loadTaskLists() {
  const container = qs('taskListsContainer');
  const loading = qs('taskListsLoading');
  const empty = qs('taskListsEmpty');

  if (!container) return;

  // Show loading
  loading.style.display = 'flex';
  empty.style.display = 'none';

  // Remove existing list items
  container.querySelectorAll('.task-list-item').forEach((item) => item.remove());

  try {
    // Get task lists from storage
    const lists = await window.cc3Storage.getTaskListsMeta();
    const listColors = await window.cc3Storage.getTaskListColors();

    debugLog('Loaded task lists:', lists.length);

    if (lists.length === 0) {
      loading.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    // Create list items
    for (const list of lists) {
      const listItem = createTaskListItem(list, listColors[list.id]);
      container.appendChild(listItem);
    }

    loading.style.display = 'none';
  } catch (error) {
    console.error('Error loading task lists:', error);
    loading.style.display = 'none';
    showToast('Error loading task lists', 'error');
  }
}

// Create task list item element
function createTaskListItem(list, currentColor) {
  const item = document.createElement('div');
  item.className = 'task-list-item';
  item.innerHTML = `
    <div class="task-list-name">${escapeHtml(list.title)}</div>
    <div class="task-list-color-controls" id="colorControls_${list.id}"></div>
  `;

  // Create color picker using shared utils
  const controlsContainer = item.querySelector(`#colorControls_${list.id}`);

  const colorPicker = window.cc3SharedUtils.createCustomColorPicker({
    initialColor: currentColor || '#4285f4',
    openDirection: 'down',
    position: 'popup',
    enableTabs: true,
    onColorChange: async (color) => {
      debugLog(`List ${list.title} color changed to:`, color);

      // Save to storage
      await window.cc3Storage.setTaskListDefaultColor(list.id, color);

      // Ask if user wants to apply to existing tasks
      const apply = await showConfirmDialog(
        'Apply to Existing Tasks?',
        `Do you want to apply this color to all existing tasks in "${list.title}"?`,
        'Apply',
        'Skip',
      );

      if (apply) {
        // Notify background script to repaint tasks
        chrome.runtime.sendMessage({
          type: 'APPLY_LIST_COLOR_TO_EXISTING',
          listId: list.id,
          color: color,
        });

        showToast(`Applied color to all tasks in ${list.title}`, 'success');
      }
    },
  });

  controlsContainer.appendChild(colorPicker.container);

  // Add clear button
  const clearBtn = document.createElement('button');
  clearBtn.className = 'secondary-button';
  clearBtn.style.cssText = 'padding: 6px 12px; font-size: 11px;';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', async () => {
    await window.cc3Storage.clearTaskListDefaultColor(list.id);
    colorPicker.setColor('#4285f4');
    showToast(`Cleared default color for ${list.title}`, 'info');
  });
  controlsContainer.appendChild(clearBtn);

  return item;
}

// Update sync status text
function updateSyncStatus(lastSyncTimestamp) {
  const syncStatusText = qs('syncStatusText');
  if (!syncStatusText) return;

  if (!lastSyncTimestamp) {
    syncStatusText.textContent = 'Last synced: Never';
    return;
  }

  const now = Date.now();
  const diff = now - lastSyncTimestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) {
    syncStatusText.textContent = 'Last synced: Just now';
  } else if (minutes < 60) {
    syncStatusText.textContent = `Last synced: ${minutes} min ago`;
  } else if (hours < 24) {
    syncStatusText.textContent = `Last synced: ${hours} hr ago`;
  } else {
    const date = new Date(lastSyncTimestamp);
    syncStatusText.textContent = `Last synced: ${date.toLocaleDateString()}`;
  }
}

// Toast notification helper
function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#1e8e3e' : type === 'error' ? '#d93025' : '#4285f4'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Confirm dialog helper
function showConfirmDialog(title, message, confirmText, cancelText) {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999999;
    `;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    `;

    dialog.innerHTML = `
      <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">${title}</div>
      <div style="font-size: 13px; color: #5f6368; margin-bottom: 20px;">${message}</div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="cancel-btn secondary-button">${cancelText}</button>
        <button class="confirm-btn primary-button">${confirmText}</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Button handlers
    dialog.querySelector('.confirm-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    dialog.querySelector('.cancel-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

// HTML escape helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // ... existing initialization ...

  // Initialize task list coloring
  initTaskListColoring();
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
```

---

## Part 3: Edge Cases & Bug Prevention

### 3.1 Complete Edge Case List

| #   | Edge Case                             | Impact                     | Solution                                      |
| --- | ------------------------------------- | -------------------------- | --------------------------------------------- |
| 1   | User denies OAuth                     | Feature unusable           | Show friendly message, allow retry            |
| 2   | OAuth token expires                   | API calls fail             | Auto-refresh token, re-auth if needed         |
| 3   | API rate limit hit                    | Sync fails                 | Exponential backoff, show user message        |
| 4   | User has no task lists                | Empty UI                   | Show "No lists" message, suggest creating one |
| 5   | User has no tasks                     | Empty mapping              | Handle gracefully, no errors                  |
| 6   | Task deleted on Google                | Stale mapping              | Periodic sync cleans up, no visual issue      |
| 7   | Task moved between lists              | Wrong color                | Next sync updates mapping                     |
| 8   | List deleted on Google                | Orphaned color setting     | Ignore orphaned settings, clean on sync       |
| 9   | Multiple calendar tabs                | Multiple active state      | Track all tabs, use Set()                     |
| 10  | Extension updated while calendar open | State inconsistency        | Service worker restart triggers resync        |
| 11  | Browser closed/restarted              | State reset                | Resume from storage on startup                |
| 12  | Offline mode                          | API unavailable            | Use cached mappings, show offline indicator   |
| 13  | Manual task color set                 | Conflict with list default | Manual color takes priority always            |
| 14  | User changes list default             | Existing tasks unchanged   | Prompt to apply to existing                   |
| 15  | Very large task list (1000+ tasks)    | Slow sync                  | Paginate API calls, show progress             |
| 16  | Concurrent color changes              | Race condition             | Debounce saves, last-write-wins               |
| 17  | Storage quota exceeded                | Save fails                 | Warn user, suggest cleanup                    |
| 18  | Popup opened during sync              | Stale data shown           | Listen for sync complete message              |
| 19  | Task created on mobile                | Not in mapping             | Next sync (1-5 min) adds it                   |
| 20  | Google Calendar UI update             | DOM selectors break        | Feature degrades gracefully                   |
| 21  | Extension disabled then re-enabled    | Stale cache                | Force sync on re-enable                       |
| 22  | User revokes OAuth in Google settings | All API calls fail         | Detect 401, show re-auth prompt               |
| 23  | Network error during sync             | Partial data               | Rollback failed sync, keep old data           |
| 24  | Task ID format changes                | Can't find tasks           | Validate format, log errors                   |
| 25  | Supabase auth fails                   | Feature should still work  | OAuth independent of Supabase                 |

### 3.2 Bug Prevention Strategies

#### **Strategy 1: Defensive API Calls**

```javascript
async function safeApiCall(apiFunction, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await apiFunction();
    } catch (error) {
      if (error.message === 'TOKEN_EXPIRED') {
        await clearAuthToken();
        continue; // Retry with new token
      }
      if (error.message === 'RATE_LIMIT') {
        await exponentialBackoff(attempt);
        continue; // Retry after backoff
      }
      if (attempt === retries - 1) throw error; // Last attempt
    }
  }
}
```

#### **Strategy 2: Storage Transaction Safety**

```javascript
async function atomicStorageUpdate(key, updateFn) {
  // Read-modify-write with retry
  for (let i = 0; i < 3; i++) {
    const current = await chrome.storage.sync.get(key);
    const updated = updateFn(current[key]);

    try {
      await chrome.storage.sync.set({ [key]: updated });
      return updated;
    } catch (error) {
      if (i === 2) throw error;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
}
```

#### **Strategy 3: DOM Detection Safety**

```javascript
function isTasksChip(el) {
  // Multiple checks for robustness
  if (!el || el.nodeType !== 1) return false;
  if (!el.matches) return false;

  try {
    return el.matches('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
  } catch (error) {
    console.warn('Task chip detection failed:', error);
    return false;
  }
}
```

#### **Strategy 4: Feature Toggle Safety**

```javascript
// Always check if feature is enabled before running
async function applyListDefaultColor(taskId) {
  const settings = await chrome.storage.sync.get('settings');
  if (!settings.settings?.taskListColoring?.enabled) {
    return; // Feature disabled
  }
  if (!settings.settings?.taskListColoring?.oauthGranted) {
    return; // OAuth not granted
  }

  // Proceed with coloring logic
}
```

#### **Strategy 5: Graceful Degradation**

```javascript
// If anything fails, fall back to existing behavior
try {
  const listDefaultColor = await getListDefaultColor(taskId);
  return listDefaultColor || manualColor || null;
} catch (error) {
  console.error('List color lookup failed, using manual color:', error);
  return manualColor || null; // Existing behavior
}
```

---

## Part 4: Testing Plan

### 4.1 Unit Testing Checklist

**Storage Functions** (`lib/storage.js`):

- [ ] `setTaskListDefaultColor()` saves correctly
- [ ] `clearTaskListDefaultColor()` removes correctly
- [ ] `getDefaultColorForTask()` returns manual > list > none priority
- [ ] Deep merge doesn't break existing settings

**API Functions** (`lib/google-tasks-api.js`):

- [ ] `getAuthToken()` caches and reuses valid tokens
- [ ] `fetchTaskLists()` handles empty results
- [ ] `buildTaskToListMapping()` handles large lists (500+ tasks)
- [ ] Rate limit errors trigger backoff
- [ ] Token expiry triggers re-auth

**DOM Detection** (`features/tasks-coloring/index.js`):

- [ ] `detectNewTasks()` identifies new tasks only
- [ ] Existing tasks don't trigger instant coloring
- [ ] Navigation events don't spam API calls
- [ ] Task elements found correctly after Google Calendar UI changes

### 4.2 Integration Testing Scenarios

**Scenario 1: First-Time Setup**

1. Fresh install extension
2. Enable task list coloring
3. Grant OAuth access
4. Verify initial sync completes
5. Set default color for a list
6. Create new task in Google Calendar
7. Verify task gets list default color instantly (<500ms)

**Scenario 2: Existing User Upgrade**

1. User has existing manual task colors
2. Update extension to new version
3. Enable list coloring feature
4. Verify existing manual colors still work
5. Set list default
6. Verify manual colors take priority over list defaults

**Scenario 3: Multi-Device Sync**

1. Set list default color on Device A
2. Create task on Device A → verify color
3. Open calendar on Device B
4. Wait for sync (1-5 min)
5. Verify task shows correct color on Device B
6. Create task on Device B → verify color

**Scenario 4: Offline/Online**

1. Set list defaults while online
2. Go offline (disable network)
3. Create task → verify cached color applied
4. Go back online
5. Verify next sync updates mapping

**Scenario 5: State Transitions**

1. Open calendar tab → verify ACTIVE mode (1-min polling)
2. Switch to another tab → verify IDLE mode (5-min polling)
3. Close calendar tab → verify SLEEP mode (no polling)
4. Re-open calendar → verify ACTIVE resumes

### 4.3 QA Checklist (Production Readiness)

**Functionality:**

- [ ] OAuth flow completes successfully
- [ ] Initial sync loads all task lists
- [ ] Manual sync button works
- [ ] Setting list default color saves correctly
- [ ] Clearing list default color works
- [ ] Instant coloring works (<500ms for new tasks)
- [ ] Manual task colors take priority
- [ ] List defaults apply to tasks without manual colors
- [ ] "Apply to existing tasks" prompt appears
- [ ] Applying to existing tasks updates all tasks in list

**UI/UX:**

- [ ] Popup loads without errors
- [ ] Task list coloring section appears correctly
- [ ] Toggle switch works
- [ ] OAuth status shows correctly (granted/not granted)
- [ ] Task lists display with names
- [ ] Color picker opens and closes smoothly
- [ ] Color selection updates preview
- [ ] Toast notifications appear for actions
- [ ] Loading states show during operations
- [ ] Empty states show when no lists
- [ ] Sync status updates correctly

**Performance:**

- [ ] Popup opens quickly (<500ms)
- [ ] Initial sync completes in <10 seconds for 100 tasks
- [ ] Color picker doesn't lag
- [ ] No memory leaks after extended use
- [ ] Polling doesn't cause excessive CPU usage
- [ ] Extension doesn't slow down Google Calendar

**Error Handling:**

- [ ] OAuth denial shows friendly message
- [ ] API errors show user-friendly messages
- [ ] Network errors handled gracefully
- [ ] Rate limit errors trigger backoff
- [ ] Token expiry triggers re-auth
- [ ] Invalid data doesn't crash extension

**Compatibility:**

- [ ] Works on Chrome 121+
- [ ] Works with existing Supabase auth
- [ ] Doesn't break day coloring feature
- [ ] Doesn't break existing task coloring
- [ ] Doesn't break time blocking feature
- [ ] Works with dark mode
- [ ] Works with different screen sizes

**Security:**

- [ ] OAuth uses read-only scope
- [ ] Tokens stored securely
- [ ] No sensitive data in console logs
- [ ] No XSS vulnerabilities
- [ ] No data leakage to third parties

---

## Part 5: Rollout Strategy

### 5.1 Deployment Phases

**Phase 1: Development (Days 1-8)**

- Implement all features
- Test locally
- Fix bugs

**Phase 2: Internal Testing (Days 9-10)**

- Deploy to unpacked extension (developer mode)
- Test on multiple machines
- Test all edge cases
- Performance testing

**Phase 3: Closed Beta (Days 11-14)**

- Deploy to Chrome Web Store (unlisted)
- Invite 10-20 beta testers
- Collect feedback
- Fix critical issues

**Phase 4: Public Release (Day 15+)**

- Update version to stable
- Make public on Chrome Web Store
- Monitor error logs
- Provide user support

### 5.2 Feature Flag Strategy

**Settings Structure:**

```javascript
{
  "taskListColoring": {
    "enabled": false,        // User toggle
    "oauthGranted": false,   // OAuth state
    "betaMode": true,        // ← ADD THIS for controlled rollout
    "lastSync": null
  }
}
```

**Rollout Control:**

```javascript
// In background.js startup:
async function checkFeatureAvailability() {
  const { installDate } = await chrome.storage.local.get('installDate');
  const daysSinceInstall = (Date.now() - installDate) / (1000 * 60 * 60 * 24);

  // Only show feature to users who installed >7 days ago (trusted users)
  if (daysSinceInstall > 7) {
    // Show feature in popup
  } else {
    // Hide feature for new users
  }
}
```

### 5.3 Monitoring & Metrics

**Key Metrics to Track:**

1. **Adoption Rate**: % of users who enable list coloring
2. **OAuth Grant Rate**: % who grant access vs decline
3. **API Success Rate**: % of API calls that succeed
4. **Sync Frequency**: Average syncs per user per day
5. **Error Rate**: % of operations that fail
6. **Performance**: Average instant coloring latency

**Error Logging:**

```javascript
function logError(context, error, metadata = {}) {
  const errorLog = {
    timestamp: Date.now(),
    context: context,
    error: error.message,
    stack: error.stack,
    metadata: metadata,
    version: chrome.runtime.getManifest().version,
  };

  // Send to error tracking service (Sentry, etc.)
  console.error('[ERROR]', errorLog);
}
```

---

## Part 6: Rollback Plan

### 6.1 Emergency Disable

**If critical bug found:**

```javascript
// Push emergency update with feature disabled
const EMERGENCY_DISABLE = true;

if (EMERGENCY_DISABLE) {
  // Force disable feature for all users
  const settings = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({
    settings: {
      ...settings.settings,
      taskListColoring: {
        ...settings.settings.taskListColoring,
        enabled: false,
      },
    },
  });

  // Notify users
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'images/icon-48.png',
    title: 'ColorKit Update',
    message: 'Task list coloring temporarily disabled for maintenance.',
  });
}
```

### 6.2 Safe Unwind

**To completely remove feature if needed:**

1. Set `enabled: false` in all user settings
2. Clear all new storage keys:
   - `cf.taskListColors`
   - `cf.taskToListMap`
   - `cf.taskListsMeta`
3. Remove OAuth permissions from manifest
4. Comment out all new code
5. Revert to previous version

**Data preservation:**

- Manual task colors (`cf.taskColors`) remain untouched
- All other features continue working normally

---

## Part 7: Documentation

### 7.1 User-Facing Documentation

**Feature Announcement:**

```
🎉 New Feature: Task List Default Colors

Set a default color for each of your Google Calendar task lists!

How it works:
1. Enable "Task List Default Colors" in the extension popup
2. Grant access to view your task lists (read-only, secure)
3. Set a default color for each list
4. New tasks automatically get their list's color!

Your manual task colors always take priority. This just saves you time!
```

**FAQ:**

```
Q: Do I need to grant Google Calendar access?
A: Yes, to see which list a task belongs to. We only request read-only access.

Q: Will this affect my existing task colors?
A: No! Manual task colors always take priority over list defaults.

Q: How often does it sync?
A: Every 1 minute when you're using Google Calendar, every 5 minutes when idle.

Q: Can I revoke access?
A: Yes, anytime in your Google Account settings or by disabling the feature.

Q: Does this cost extra?
A: No, it's included in your ColorKit subscription!
```

### 7.2 Developer Documentation

**File: `TASK_LIST_COLORS_DEV_DOCS.md`** (create this):

````markdown
# Task List Default Colors - Developer Guide

## Architecture Overview

[Diagram showing: Content Script → Background Script → Google Tasks API]

## Key Files

- `lib/google-tasks-api.js` - API integration
- `features/tasks-coloring/index.js` - DOM detection & coloring
- `popup/popup.js` - UI for list color management
- `background.js` - State machine & message handling

## Adding New Features

If you need to extend this feature:

1. Always check `taskListColoring.enabled` before running logic
2. Prioritize manual colors over list defaults
3. Handle API failures gracefully (fall back to cached data)
4. Test with rate limiting enabled

## Debugging

Enable debug logging:

```javascript
localStorage.setItem('cc3_debug', 'true');
```
````

## API Quota Management

Current usage: ~150 calls/day/user
Limit: 50,000 calls/day
Headroom: 333 users before hitting limit

```

---

## FINAL CHECKLIST

### Pre-Implementation
- [ ] Review this plan with team
- [ ] Get user approval on UI mockups
- [ ] Set up Google Cloud project for OAuth
- [ ] Create test Google account with task lists

### During Implementation
- [ ] Follow implementation sequence exactly
- [ ] Test each phase before moving to next
- [ ] Use feature flag for gradual rollout
- [ ] Monitor error logs daily

### Post-Implementation
- [ ] Complete all QA checklist items
- [ ] Run beta test with 10-20 users
- [ ] Collect feedback and iterate
- [ ] Deploy to production when stable

---

**ESTIMATED TIMELINE: 8-10 days**
**RISK LEVEL: Low** (isolated feature, graceful degradation)
**COMPLEXITY: Medium** (API integration, state management)

**READY TO PROCEED?** ✓
```
