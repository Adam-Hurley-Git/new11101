# Manual Task Coloring Fix - Complete Session Log

**Date**: December 3, 2025
**Session Goal**: Fix task coloring for NEW UI (ttb_ format)
**Status**: ✅ Manual coloring WORKING | ⏳ List default coloring NOT WORKING

---

## Initial Problem

Extension had NEW UI (ttb_) tasks but coloring wasn't working:
- **Error**: `modalInjection.js:229 Uncaught TypeError: taskId.startsWith is not a function`
- **Root Cause**: Code only supported OLD UI (`tasks.` format), not NEW UI (`ttb_` format)
- **Key Insight**: NEW UI returns **Promises** for task IDs, OLD UI returns **strings**

---

## Understanding NEW UI (ttb_) Format

### OLD UI vs NEW UI

**OLD UI (tasks. prefix)**:
```javascript
// DOM: Direct task ID in data-eventid
<div data-eventid="tasks.Q0M5dU5razM0OGpEeGtrRA==">

// Extraction: Synchronous string
const taskId = eventId.slice(6); // "Q0M5dU5razM0OGpEeGtrRA=="
```

**NEW UI (ttb_ prefix)**:
```javascript
// DOM: Encoded calendar event ID + email
<div data-eventid="ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMg...">

// Decoding: ttb_ → Calendar Event ID → Task API ID (async!)
const ttbString = "ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMg...";
const decoded = atob(ttbString.slice(4)); // "15qmhor3c7v7f60rp0teq0lak3 adam.hurley..."
const calendarEventId = decoded.split(' ')[0]; // "15qmhor3c7v7f60rp0teq0lak3"

// Resolution: Calendar API lookup (Promise)
const taskApiId = await resolveCalendarEventToTaskId(calendarEventId);
// Returns: "SzhnUmlaa2lmX3FxREdJOA=="
```

### Key Difference: Sync vs Async

**This is the critical issue:**
- OLD UI: `getTaskIdFromChip(el)` returns `string`
- NEW UI: `getTaskIdFromChip(el)` returns `Promise<string>`

**Code expecting strings will break:**
```javascript
// ❌ BROKEN for NEW UI:
const taskId = getTaskIdFromChip(el);
if (taskId.startsWith('test-')) { ... } // TypeError: taskId.startsWith is not a function

// ✅ FIXED for NEW UI:
const taskId = await getResolvedTaskId(el);
if (taskId && taskId.startsWith('test-')) { ... } // Works!
```

---

## Resolution Infrastructure (Already Working)

The ttb_ → Task ID resolution chain was **already implemented** and **working**:

### 1. Decoding Function
**File**: `features/tasks-coloring/index.js:227-241`
```javascript
function decodeCalendarEventIdFromTtb(ttbString) {
  if (!ttbString || !ttbString.startsWith('ttb_')) return null;

  try {
    const base64Part = ttbString.slice(4); // Remove "ttb_" prefix
    const decoded = atob(base64Part); // Decode base64
    const parts = decoded.split(' '); // Split on space
    return parts[0] || null; // Return calendar event ID
  } catch (error) {
    console.error('[TaskColoring] Failed to decode ttb_:', error);
    return null;
  }
}
```

### 2. Resolution Function
**File**: `features/tasks-coloring/index.js:271-325`
```javascript
async function resolveCalendarEventToTaskId(calendarEventId) {
  // 1. Check cache first (30-second in-memory cache)
  const cache = await refreshCalendarMappingCache();
  if (cache[calendarEventId]) {
    return cache[calendarEventId].taskApiId;
  }

  // 2. Cache miss - send message to background script
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'RESOLVE_CALENDAR_EVENT',
      calendarEventId: calendarEventId,
    }, (response) => {
      if (response.success && response.taskApiId) {
        // Update cache
        calendarEventMappingCache[calendarEventId] = {
          taskApiId: response.taskApiId,
          taskFragment: response.taskFragment,
          lastVerified: new Date().toISOString(),
        };
        resolve(response.taskApiId);
      } else {
        resolve(null);
      }
    });
  });
}
```

### 3. Background Handler
**File**: `background.js:1038-1088`
```javascript
async function handleResolveCalendarEvent(calendarEventId) {
  // 1. Check cache
  const cached = await chrome.storage.local.get('cf.calendarEventMapping');
  const mapping = cached['cf.calendarEventMapping'] || {};

  if (mapping[calendarEventId]) {
    return {
      success: true,
      taskApiId: mapping[calendarEventId].taskApiId,
    };
  }

  // 2. Fetch from Calendar API
  const taskApiId = await GoogleCalendarAPI.calendarEventIdToTaskId(calendarEventId);

  if (!taskApiId) {
    return { success: false, error: 'Could not resolve' };
  }

  // 3. Store in cache
  mapping[calendarEventId] = {
    taskApiId,
    taskFragment: GoogleCalendarAPI.taskApiIdToFragment(taskApiId),
    lastVerified: new Date().toISOString(),
  };

  await chrome.storage.local.set({ 'cf.calendarEventMapping': mapping });

  return { success: true, taskApiId };
}
```

**Verification**: User's console logs showed this working perfectly:
```
[TaskColoring] NEW UI (ttb_) detected: ttb_NnNrbTJqMzExazRhYWwwOXZmMzFjMzJtOHUg...
[TaskColoring] Decoded Calendar Event ID: 6skm2j311k4aal09vf31c32m8u
[TaskColoring] ✅ Found in cache: Q0M5dU5razM0OGpEeGtrRA==
```

---

## What We Fixed (3 Commits)

### Commit 1: Fix modal injection for NEW UI (ttb_) tasks
**File**: `content/modalInjection.js`
**Commit**: `744bd81`

**Problem**: Modal color picker not appearing for ttb_ tasks

**Changes**:

#### 1.1 Made `mountInto()` async
```javascript
// BEFORE:
function mountInto(dialog) {

// AFTER:
async function mountInto(dialog) {
```
**Why**: Need to await Promise-based task ID resolution

#### 1.2 Added ttb_ selector in modal detection
**Line 174**:
```javascript
// BEFORE:
const modalTaskElement = dialog.querySelector('[data-eventid^="tasks."]');

// AFTER:
const modalTaskElement = dialog.querySelector('[data-eventid^="tasks."], [data-eventid^="ttb_"]');
```

#### 1.3 Added ttb_ resolution logic
**Lines 184-192**:
```javascript
// NEW UI: ttb_ format - need to resolve via getResolvedTaskId
else if (eventId.startsWith('ttb_')) {
  console.log('[ModalInjection] Found NEW UI (ttb_) in modal, resolving...');
  if (window.cfTasksColoring?.getResolvedTaskId) {
    taskId = await window.cfTasksColoring.getResolvedTaskId(modalTaskElement);
    console.log('[ModalInjection] Resolved NEW UI task ID:', taskId);
  } else {
    console.warn('[ModalInjection] getResolvedTaskId not available yet');
  }
}
```

#### 1.4 Handle Promise from getLastClickedTaskId
**Lines 202-208**:
```javascript
// If it's a Promise (NEW UI), await it
if (clickedTaskId && typeof clickedTaskId.then === 'function') {
  console.log('[ModalInjection] Task ID is Promise, awaiting...');
  taskId = await clickedTaskId;
  console.log('[ModalInjection] Resolved Promise task ID:', taskId);
} else {
  taskId = clickedTaskId;
}
```

#### 1.5 Updated comprehensive search
**Lines 228, 244-252**:
```javascript
// Include both OLD UI (tasks.) and NEW UI (ttb_) selectors
const taskSelectors = ['[data-eventid^="tasks."]', '[data-eventid^="tasks_"]', '[data-eventid^="ttb_"]', '[data-taskid]'];

// ... in loop:
else if (eventId && eventId.startsWith('ttb_')) {
  console.log('[ModalInjection] Found NEW UI (ttb_) task in comprehensive search, resolving...');
  if (window.cfTasksColoring?.getResolvedTaskId) {
    taskId = await window.cfTasksColoring.getResolvedTaskId(taskElement);
    console.log('[ModalInjection] Resolved NEW UI task ID:', taskId);
    if (taskId) break;
  } else {
    console.warn('[ModalInjection] getResolvedTaskId not available');
  }
}
```

#### 1.6 Updated isTaskDialog
**Line 50**:
```javascript
// BEFORE:
const hasExistingTaskElements = dialog.querySelector('[data-eventid^="tasks."], [data-taskid]');

// AFTER:
const hasExistingTaskElements = dialog.querySelector('[data-eventid^="tasks."], [data-eventid^="ttb_"], [data-taskid]');
```

#### 1.7 Updated click handler
**Line 421**:
```javascript
// BEFORE:
const taskElement = e.target.closest('[data-eventid^="tasks."]');

// AFTER:
const taskElement = e.target.closest('[data-eventid^="tasks."], [data-eventid^="ttb_"]');
```

---

### Commit 2: Fix task painting and click tracking for NEW UI (ttb_)
**File**: `features/tasks-coloring/index.js`
**Commit**: `6a33df1`

**Problem**: Tasks not being painted, click tracking broken for ttb_

**Changes**:

#### 2.1 Fixed paintTaskImmediately()
**Lines 714-732**:
```javascript
async function paintTaskImmediately(taskId, colorOverride = null, textColorOverride = null) {
  if (!taskId) return;

  const manualOverrideMap = colorOverride ? { [taskId]: colorOverride } : null;

  // OLD UI: Search by direct task ID
  const oldUiSelector = `[data-eventid="tasks.${taskId}"], [data-eventid="tasks_${taskId}"], [data-taskid="${taskId}"]`;
  const oldUiElements = document.querySelectorAll(oldUiSelector);

  // NEW UI: Search all ttb_ elements and resolve them
  const newUiElements = document.querySelectorAll('[data-eventid^="ttb_"]');

  // Combine both OLD and NEW UI elements
  const allTaskElements = [...oldUiElements];

  // Resolve NEW UI elements and check if they match the taskId
  for (const ttbElement of newUiElements) {
    const resolvedId = await getResolvedTaskId(ttbElement);
    if (resolvedId === taskId) {
      allTaskElements.push(ttbElement);
    }
  }

  console.log('[TaskColoring] paintTaskImmediately: Found', allTaskElements.length, 'elements for task', taskId);

  // ... rest of function
}
```

**Why**: Can't search ttb_ tasks by Task ID (ttb_ contains Calendar Event ID). Must resolve all ttb_ elements to find matches.

#### 2.2 Fixed click handler
**Lines 1925-1942**:
```javascript
// BEFORE:
clickHandler = (e) => {
  const id = resolveTaskIdFromEventTarget(e.target); // NOT AWAITED!
  if (id) {
    lastClickedTaskId = id; // This is a Promise for ttb_!
    const taskElement = e.target.closest('[data-eventid^="tasks."]');
    // ...
  }
};

// AFTER:
clickHandler = async (e) => {
  // CRITICAL: Must await for NEW UI (ttb_) tasks, which return Promises
  const id = await resolveTaskIdFromEventTarget(e.target);
  if (id) {
    lastClickedTaskId = id; // Now always a string
    // Support both OLD UI (tasks.) and NEW UI (ttb_) selectors
    const taskElement = e.target.closest('[data-eventid^="tasks."], [data-eventid^="ttb_"]') || e.target;
    if (taskElement && !taskElement.closest('[role="dialog"]')) {
      taskElementReferences.set(id, taskElement);
    } else {
      const calendarTaskElement = await findTaskElementOnCalendarGrid(id);
      if (calendarTaskElement) {
        taskElementReferences.set(id, calendarTaskElement);
      }
    }
  }
};
```

**Critical Fix**: `lastClickedTaskId` was being set to a Promise for ttb_ tasks!

#### 2.3 Fixed findTaskElementOnCalendarGrid()
**Lines 126-148**:
```javascript
// BEFORE:
function findTaskElementOnCalendarGrid(taskId) {
  const taskElements = document.querySelectorAll(`[data-eventid="tasks.${taskId}"], [data-eventid="tasks_${taskId}"]`);
  for (const el of taskElements) {
    if (!el.closest('[role="dialog"]')) {
      return el;
    }
  }
  return null;
}

// AFTER:
async function findTaskElementOnCalendarGrid(taskId) {
  // OLD UI: Search by direct task ID
  const oldUiElements = document.querySelectorAll(`[data-eventid="tasks.${taskId}"], [data-eventid="tasks_${taskId}"]`);
  for (const el of oldUiElements) {
    if (!el.closest('[role="dialog"]')) {
      return el;
    }
  }

  // NEW UI: Search all ttb_ elements and resolve them
  const newUiElements = document.querySelectorAll('[data-eventid^="ttb_"]');
  for (const ttbElement of newUiElements) {
    if (ttbElement.closest('[role="dialog"]')) {
      continue; // Skip modal elements
    }
    const resolvedId = await getResolvedTaskId(ttbElement);
    if (resolvedId === taskId) {
      return ttbElement;
    }
  }

  return null;
}
```

**Why**: Same reason as `paintTaskImmediately()` - can't search ttb_ by Task ID

---

### Commit 3: Export getResolvedTaskId for modalInjection.js
**File**: `features/tasks-coloring/index.js`
**Commit**: `90a520a`

**Problem**: `modalInjection.js` calls `window.cfTasksColoring?.getResolvedTaskId()` but function wasn't exported

**Change**:
**Line 2080**:
```javascript
window.cfTasksColoring = {
  getLastClickedTaskId: () => lastClickedTaskId,
  getResolvedTaskId: getResolvedTaskId, // ← ADDED THIS
  repaint: repaintSoon,
  initTasksColoring: initTasksColoring,
  injectTaskColorControls: injectTaskColorControls,
  // Debug functions
  getColorMap: () => loadMap(),
  debugRepaint: () => {
    doRepaint();
  },
};
```

---

## Helper Functions (Already Existed)

### getResolvedTaskId() - Universal wrapper
**File**: `features/tasks-coloring/index.js:87-97`
```javascript
async function getResolvedTaskId(el) {
  const result = getTaskIdFromChip(el);

  // If result is a Promise, await it
  if (result && typeof result.then === 'function') {
    return await result;
  }

  // Otherwise return directly
  return result;
}
```

**Purpose**: Handles both OLD UI (string) and NEW UI (Promise) uniformly

### getTaskIdFromChip() - Handles both UI formats
**File**: `features/tasks-coloring/index.js:14-80`
```javascript
function getTaskIdFromChip(el) {
  if (!el || !el.getAttribute) return null;

  const ev = el.getAttribute('data-eventid');

  // OLD UI: tasks. or tasks_ prefix (direct task ID)
  if (ev && (ev.startsWith('tasks.') || ev.startsWith('tasks_'))) {
    return ev.slice(6); // Returns string
  }

  // NEW UI: ttb_ prefix (requires calendar event mapping)
  if (ev && ev.startsWith('ttb_')) {
    const calendarEventId = decodeCalendarEventIdFromTtb(ev);
    if (calendarEventId) {
      return resolveCalendarEventToTaskId(calendarEventId); // Returns Promise!
    }
    return null;
  }

  // Fallback: data-taskid attribute
  const taskId = el.getAttribute('data-taskid');
  if (taskId) {
    return taskId;
  }

  // Search parent elements (same logic)
  let current = el;
  while (current && current !== document.body) {
    const parentEv = current.getAttribute?.('data-eventid');

    if (parentEv && (parentEv.startsWith('tasks.') || parentEv.startsWith('tasks_'))) {
      return parentEv.slice(6);
    }

    if (parentEv && parentEv.startsWith('ttb_')) {
      const calendarEventId = decodeCalendarEventIdFromTtb(parentEv);
      if (calendarEventId) {
        return resolveCalendarEventToTaskId(calendarEventId);
      }
    }

    const parentTaskId = current.getAttribute?.('data-taskid');
    if (parentTaskId) {
      return parentTaskId;
    }

    current = current.parentNode;
  }

  return null;
}
```

**Key**: Returns **string** for OLD UI, **Promise** for NEW UI

---

## What's Working Now ✅

### 1. Modal Color Picker
- ✅ Opens for ttb_ tasks
- ✅ Properly resolves task IDs
- ✅ No more `taskId.startsWith is not a function` error

### 2. Manual Task Coloring
- ✅ User can select color in modal
- ✅ Color is applied immediately via `paintTaskImmediately()`
- ✅ ttb_ tasks are found and painted

### 3. Click Tracking
- ✅ Clicks on ttb_ tasks properly tracked
- ✅ `lastClickedTaskId` stores resolved string, not Promise
- ✅ Modal knows which task was clicked

### 4. Task Painting
- ✅ `paintTaskImmediately()` finds and paints ttb_ tasks
- ✅ Manual colors persist across page navigation
- ✅ Main repaint loop (`doRepaint()`) already supported ttb_

---

## What's NOT Working ⏳

### Task List Default Coloring

**Problem**: List default colors not being applied to ttb_ tasks

**What Should Work**:
1. User grants Google OAuth access
2. Extension syncs task lists via Google Tasks API
3. User sets default color for "Work Tasks" list
4. All tasks in "Work Tasks" list automatically get that color

**Current Status**: Manual coloring works, but list defaults don't

**Likely Causes** (need investigation):

#### Hypothesis 1: Color Resolution Not Finding List Colors
**File**: `features/tasks-coloring/index.js:350-440`

The `getColorForTask()` function determines which color to use:
```javascript
async function getColorForTask(taskId, manualColorsMap, options = {}) {
  // Priority 1: Manual color (highest)
  if (cache.manualColors[taskId]) {
    return cache.manualColors[taskId];
  }

  // Priority 2: List default color
  const listId = cache.taskToListMap[taskId];
  if (listId && cache.listColors[listId]) {
    return buildColorInfo({
      baseColor: cache.listColors[listId],
      // ...
    });
  }

  // Priority 3: No color
  return null;
}
```

**Possible issue**: `cache.taskToListMap[taskId]` might not have the mapping for ttb_ tasks?

#### Hypothesis 2: Task ID Format Mismatch

**Critical Question**: What format is stored in `cf.taskToListMap`?

The Google Tasks API returns task IDs in **base64 format**:
```javascript
// Tasks API response:
{
  "id": "Q0M5dU5razM0OGpEeGtrRA==",  // Base64 task ID
  "title": "Buy groceries",
  // ...
}
```

**But**: The `resolveCalendarEventToTaskId()` function also returns base64:
```javascript
// From background.js handleResolveCalendarEvent:
const taskApiId = await GoogleCalendarAPI.calendarEventIdToTaskId(calendarEventId);
// Returns: "Q0M5dU5razM0OGpEeGtrRA==" (base64)

mapping[calendarEventId] = {
  taskApiId,  // Base64 format
  // ...
};
```

**Question**: Are the task IDs in the same format in both places?

Let's trace the flow:

**Task List Sync** (builds `cf.taskToListMap`):
1. `background.js`: Calls `buildTaskToListMapping()`
2. `lib/google-tasks-api.js`: Fetches tasks from API
3. Returns tasks with base64 IDs
4. Stores: `taskToListMap[base64TaskId] = listId`

**Task Resolution** (resolves ttb_ to task ID):
1. Modal opens with ttb_ task
2. Calls `resolveCalendarEventToTaskId()`
3. Returns: base64 task ID
4. Looks up: `taskToListMap[base64TaskId]`

**This SHOULD match!** Both use base64 format.

#### Hypothesis 3: Mapping Not Available Yet

The `cf.taskToListMap` is populated by background script syncing.

**Possible timing issue**:
1. User opens task modal (ttb_ task)
2. Task ID is resolved to base64
3. But `cf.taskToListMap` hasn't synced yet
4. No list ID found → no default color

**Check**: Does the mapping exist in storage?
```javascript
// In console on calendar page:
chrome.storage.local.get('cf.taskToListMap', (result) => {
  console.log('Task → List Map:', result['cf.taskToListMap']);
});
```

#### Hypothesis 4: Cache Not Refreshing

The color cache might be stale:
```javascript
// features/tasks-coloring/index.js:280-305
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
  taskToListMapCache = localData['cf.taskToListMap'];
  listColorsCache = syncData['cf.taskListColors'];
  // ...
}
```

**Check**: Is `cf.taskListColors` actually populated?
```javascript
// In console:
chrome.storage.sync.get('cf.taskListColors', (result) => {
  console.log('List Colors:', result['cf.taskListColors']);
});
```

---

## Debugging Steps for List Coloring

### Step 1: Verify Task → List Mapping Exists
```javascript
// In console on calendar.google.com:
chrome.storage.local.get('cf.taskToListMap', (result) => {
  const map = result['cf.taskToListMap'];
  console.log('Total tasks in map:', Object.keys(map || {}).length);
  console.log('Sample mappings:', Object.entries(map || {}).slice(0, 5));
});
```

**Expected**: Should see task IDs (base64) → list IDs

### Step 2: Verify List Colors Exist
```javascript
chrome.storage.sync.get('cf.taskListColors', (result) => {
  const colors = result['cf.taskListColors'];
  console.log('List colors:', colors);
});
```

**Expected**: Should see `{ "listId": "#ff0000", ... }`

### Step 3: Test Resolution Chain
```javascript
// Click on a ttb_ task to capture its ID
// Then in console:
const taskId = window.cfTasksColoring?.getLastClickedTaskId?.();
console.log('Clicked task ID:', taskId);

// If it's a Promise, await it:
taskId.then(id => {
  console.log('Resolved task ID:', id);

  // Check if it's in the mapping:
  chrome.storage.local.get('cf.taskToListMap', (result) => {
    const map = result['cf.taskToListMap'];
    const listId = map[id];
    console.log('List ID for task:', listId);

    if (listId) {
      chrome.storage.sync.get('cf.taskListColors', (syncResult) => {
        const color = syncResult['cf.taskListColors'][listId];
        console.log('Default color for list:', color);
      });
    }
  });
});
```

### Step 4: Check getColorForTask Output
```javascript
// After resolving task ID from Step 3:
const taskId = 'Q0M5dU5razM0OGpEeGtrRA=='; // Use actual resolved ID

// Call the color resolution function:
window.cfTasksColoring?.getColorMap?.().then(manualMap => {
  // This is a hack to call the internal function
  // In production, you'd add this to window.cfTasksColoring exports
  console.log('Manual colors:', manualMap);
  console.log('Is task manually colored?', !!manualMap[taskId]);
});
```

### Step 5: Add Debug Logging
Add temporary logging to `getColorForTask()`:

**File**: `features/tasks-coloring/index.js:350` (approximate)
```javascript
async function getColorForTask(taskId, manualColorsMap, options = {}) {
  const cache = await refreshColorCache();

  // ADD THIS:
  console.log('[DEBUG getColorForTask]', {
    taskId,
    hasManualColor: !!cache.manualColors[taskId],
    listId: cache.taskToListMap[taskId],
    hasListColor: !!(cache.taskToListMap[taskId] && cache.listColors[cache.taskToListMap[taskId]]),
    cacheKeys: {
      manualColors: Object.keys(cache.manualColors || {}).length,
      taskToListMap: Object.keys(cache.taskToListMap || {}).length,
      listColors: Object.keys(cache.listColors || {}).length,
    }
  });

  // ... rest of function
}
```

**Then reload extension and check console when painting tasks**

---

## Code Files Reference

### Files Modified (3 commits)
1. `content/modalInjection.js` - Modal color picker injection
2. `features/tasks-coloring/index.js` - Task painting and click tracking

### Files NOT Modified (but relevant)
1. `lib/google-tasks-api.js` - Google Tasks API integration
2. `lib/google-calendar-api.js` - Calendar API for ttb_ resolution
3. `background.js` - Message handlers and sync logic
4. `lib/storage.js` - Storage abstraction

### Key Functions

**Task ID Resolution**:
- `getTaskIdFromChip(el)` - Returns string (OLD) or Promise (NEW)
- `getResolvedTaskId(el)` - Always returns Promise, handles both
- `decodeCalendarEventIdFromTtb(ttbString)` - Decodes ttb_ to calendar event ID
- `resolveCalendarEventToTaskId(calendarEventId)` - Async lookup to get task ID

**Task Painting**:
- `doRepaint()` - Main repaint loop (already supports ttb_)
- `paintTaskImmediately(taskId)` - Immediate painting after color selection
- `getColorForTask(taskId)` - Determines which color to apply
- `applyPaint(element, color)` - Applies CSS to element

**Storage**:
- `cf.taskColors` (sync) - Manual task colors: `{ taskId: color }`
- `cf.taskListColors` (sync) - List default colors: `{ listId: color }`
- `cf.taskToListMap` (local) - Task→List mapping: `{ taskId: listId }`
- `cf.calendarEventMapping` (local) - Calendar Event→Task mapping: `{ calEventId: { taskApiId, taskFragment } }`

---

## Next Steps for List Coloring Fix

### Investigation Plan

1. **Verify mapping exists**: Check `cf.taskToListMap` has entries
2. **Verify colors exist**: Check `cf.taskListColors` has entries
3. **Test resolution**: Manually trace a ttb_ task through the resolution chain
4. **Check cache**: Ensure `refreshColorCache()` loads list colors
5. **Add logging**: Debug `getColorForTask()` to see why list colors aren't found

### Likely Fix Locations

If mapping is missing:
- Check `background.js` sync logic
- Verify `buildTaskToListMapping()` is being called
- Check OAuth state

If colors are missing:
- Check popup.js list color setting logic
- Verify storage keys match

If cache is stale:
- Check `refreshColorCache()` implementation
- Verify cache invalidation on storage changes

If format mismatch:
- Compare task ID format in `taskToListMap` vs resolved IDs
- Check if base64 encoding/decoding is consistent

---

## Summary

**Manual Coloring**: ✅ **WORKING**
- Modal opens for ttb_ tasks
- User can select color
- Task is painted immediately
- Color persists

**List Default Coloring**: ✅ **FIXED** (December 3, 2025)
- Root cause: Task ID format mismatch (base64 vs decoded)
- Solution: Dual-format lookup in `getColorForTask()`
- See: `LIST_DEFAULT_COLORING_FIX_COMPLETE.md` for full details

**Key Learnings**:
1. NEW UI returns Promises, OLD UI returns strings
2. Must use `await getResolvedTaskId(el)` for universal support
3. Can't search ttb_ tasks by Task ID (must resolve all and filter)
4. Always check if value is Promise: `typeof x.then === 'function'`

**Files Modified**: 2 (modalInjection.js, tasks-coloring/index.js)
**Commits**: 3 (744bd81, 6a33df1, 90a520a)
**Lines Changed**: ~80 lines across all files

---

**End of Session Document**
