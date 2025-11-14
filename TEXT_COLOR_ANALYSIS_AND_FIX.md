# Task List Text Color - Root Cause Analysis & Fix Plan

## 🔍 Analysis Summary

After deep audit of the codebase, I've identified **why text colors aren't working** and created a **diagnostic version** to trace the exact failure point.

---

## 📊 Current Flow (With Issues)

### 1. User Sets Text Color in Popup
```
popup.js → window.cc3Storage.setTaskListTextColor(listId, color)
  ↓
storage.js → Saves to TWO locations:
  - cf.taskListTextColors (direct sync storage)
  - settings.taskListColoring.pendingTextColors (nested)
  ↓
Storage change event fires
```

### 2. Content Script Receives Change
```
storage.onChanged.addListener → Detects cf.taskListTextColors change
  ↓
invalidateColorCache() → Sets cacheLastUpdated = 0
  ↓
repaintSoon() → Schedules repaint
```

### 3. Repaint Cycle
```
doRepaint() → For each task:
  ↓
getColorForTask(taskId) →
  ↓
refreshColorCache() → Loads from storage:
  - taskListTextColorsCache = {...settingsPending, ...cf.taskListTextColors}
  ↓
buildColorInfo({
  baseColor: listColor,
  pendingTextColor: listTextColorsCache[listId]  ← Should have text color
}) →
  ↓
textColor = pendingTextColor || pickContrastingText(baseColor)
  ↓
applyPaint(node, bgColor, textColor)
```

---

## 🐛 Potential Root Causes

### Theory 1: Cache Return Bug (MOST LIKELY)
**Location:** `features/tasks-coloring/index.js:676-683`

```javascript
if (taskToListMapCache && now - cacheLastUpdated < CACHE_LIFETIME) {
  return {
    taskToListMap: taskToListMapCache,
    listColors: listColorsCache,
    manualColors: manualColorsCache,
    // ❌ MISSING: listTextColors, completedStyling
  };
}
```

**Issue:** When returning cached data, the function was NOT returning `listTextColors` and `completedStyling`!

This means:
1. First repaint: Loads text colors from storage ✅
2. Cache is valid for 30 seconds
3. Second repaint (within 30s): Returns cached data WITHOUT text colors ❌
4. `getColorForTask()` receives cache with `listTextColors: undefined`
5. `pendingTextColor` becomes `null`
6. Falls back to auto-contrast white text

**FIX:** I already fixed this in the debug version (line 677-682).

### Theory 2: Storage Save Timing
Text colors might not be fully saved before the storage change event fires, causing the cache to load partial data.

### Theory 3: Deep Merge Issue
The `setSettings()` deep merge might not be correctly merging `pendingTextColors` into the settings object.

---

## 🔧 Debug Version (Committed)

I've added comprehensive logging to trace the flow:

### Logs Added:

1. **Storage.js** (line 305-312):
   - Logs when text color is saved
   - Verifies it was actually written to storage

2. **tasks-coloring/index.js** (line 707-713):
   - Logs cache refresh with all text colors loaded
   - Shows text colors from both storage and settings

3. **getColorForTask()** (line 765-773):
   - Logs each task's color lookup
   - Shows list ID, background color, and text color

4. **buildColorInfo()** (line 829-834):
   - Logs text color selection priority
   - Shows which text color was chosen (override/list/auto)

5. **Storage Change Listener** (line 1201-1218):
   - Logs when storage changes trigger repaints
   - Shows new text color values

---

## 📋 Testing Instructions

### Step 1: Reload Extension
```bash
# In Chrome:
1. Go to chrome://extensions
2. Find "ColorKit" extension
3. Click "Reload" button
4. Reload Google Calendar page
```

### Step 2: Open DevTools Console
```
F12 → Console tab
```

### Step 3: Set a Text Color
```
1. Open extension popup
2. Find a task list (e.g., "My Tasks")
3. Set a text color (e.g., red #FF0000)
4. Watch console for logs
```

### Step 4: Check Logs

You should see:
```
[Storage] Setting task list text color: { listId: "...", color: "#FF0000", updated: {...} }
[Storage] Verified text colors saved: { "listId": "#FF0000" }
[Task Colors] Storage changed - sync colors: { ..., newTextColors: {...} }
[Task Colors] Cache refreshed: { textColorsFromStorage: {...}, finalTextColorsCache: {...} }
[Task Colors] Getting color for task XXX: { listTextColor: "#FF0000", ... }
[Task Colors] buildColorInfo text color selection: { pendingTextColor: "#FF0000", selected: "#FF0000" }
```

### Step 5: Identify the Failure Point

If you see:
- ✅ "Setting task list text color" → Storage write works
- ✅ "Verified text colors saved" → Storage confirmed
- ❌ "Storage changed" NOT appearing → **Storage listener issue**
- ❌ "Cache refreshed" shows empty textColors → **Cache load issue**
- ❌ "Getting color" shows null textColor → **Lookup issue**
- ❌ "buildColorInfo" shows auto-contrast instead of list color → **Priority issue**

---

## 🚀 Next Steps

### If Theory 1 is Correct (Cache Return Bug):
**Status:** Already fixed in debug version
**Action:** Test and verify it works

### If Storage Listener Not Firing:
**Cause:** Extension might not be detecting storage changes
**Fix:** Add manual message listener for `TASK_LIST_TEXT_COLOR_UPDATED`

### If Cache Not Loading Text Colors:
**Cause:** Merge logic or storage read timing issue
**Fix:** Simplify to single storage location instead of TWO

### If Text Color Lost in buildColorInfo:
**Cause:** Priority logic or null check issue
**Fix:** Add null coalescing safeguards

---

## 📦 Commits

**Commit f2cfe8a:** Debug logging added
**Commit 27e5964:** List text color application fix (previous)
**Commit 8bfbc29:** Background handler fix (previous)

---

## ⚡ Quick Test Command

Run this in browser console (on Calendar page) to check storage:

```javascript
chrome.storage.sync.get(['cf.taskListTextColors', 'settings', 'cf.taskListColors'], (result) => {
  console.log('=== STORAGE CHECK ===');
  console.log('Text colors (direct):', result['cf.taskListTextColors']);
  console.log('Text colors (settings):', result.settings?.taskListColoring?.pendingTextColors);
  console.log('Background colors:', result['cf.taskListColors']);

  // Check if they match
  const direct = result['cf.taskListTextColors'] || {};
  const nested = result.settings?.taskListColoring?.pendingTextColors || {};
  const matches = JSON.stringify(direct) === JSON.stringify(nested);
  console.log('Direct and nested match:', matches);
});
```

---

## 🎯 Expected Outcome

After testing with debug logs, we'll know:
1. **WHERE** the text color is being lost
2. **WHY** it's not reaching the DOM
3. **HOW** to fix it permanently

The most likely fix (Theory 1) is already implemented. Test it and report what you see in the console!
