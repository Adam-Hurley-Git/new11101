# Task Text Color Diagnostic

## Flow Analysis

### 1. Storage Write (popup.js → storage.js)
**When user sets list text color:**
- Popup calls `window.cc3Storage.setTaskListTextColor(listId, color)`
- Storage.js writes to **TWO locations**:
  - `cf.taskListTextColors` (direct sync storage)
  - `settings.taskListColoring.pendingTextColors` (nested in settings)

### 2. Cache Load (features/tasks-coloring/index.js)
**refreshColorCache() at line 672:**
```javascript
const [localData, syncData] = await Promise.all([
  chrome.storage.local.get('cf.taskToListMap'),
  chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors', 'cf.taskListTextColors', 'settings']),
]);

const settingsPending = syncData.settings?.taskListColoring?.pendingTextColors || {};
listTextColorsCache = {
  ...settingsPending,
  ...(syncData['cf.taskListTextColors'] || {}),
};
```

### 3. Color Retrieval (getColorForTask)
**At line 752:**
```javascript
const pendingTextColor = listId && cache.listTextColors ? cache.listTextColors[listId] : null;
```

**At line 767-775 (list default path):**
```javascript
if (listId && cache.listColors[listId]) {
  return buildColorInfo({
    baseColor: cache.listColors[listId],
    pendingTextColor,  // ← Should have text color here
    ...
  });
}
```

### 4. Color Building (buildColorInfo)
**At line 797:**
```javascript
const textColor = overrideTextColor || pendingTextColor || pickContrastingText(baseColor);
return {
  backgroundColor: baseColor,
  textColor,  // ← Should have custom color
  ...
};
```

### 5. Paint Application (applyPaint)
**At line 618:**
```javascript
const text = textColorOverride || pickContrastingText(color);
```

## 🔴 CRITICAL ISSUES FOUND

### Issue 1: Cache not being invalidated after storage write
The storage change listener (line 1157) listens for `cf.taskListTextColors` changes, but there might be a timing issue where the cache is read BEFORE the storage write completes.

### Issue 2: Potential race condition
`setTaskListTextColor` does TWO async writes:
1. `chrome.storage.sync.set({ 'cf.taskListTextColors': updated })`
2. `setSettings({ taskListColoring: { pendingTextColors: updated } })`

These are sequential but the storage change event might fire before BOTH complete.

### Issue 3: Debug logging missing
No way to verify if:
- Text color is actually saved to storage
- Cache is loading text colors
- getColorForTask is returning text colors
- applyPaint is receiving text colors

## Diagnostic Commands

Run these in browser console (on calendar page):

```javascript
// Check storage
chrome.storage.sync.get(['cf.taskListTextColors', 'settings', 'cf.taskListColors'], console.log);

// Check cache (if extension exposes it)
if (window.cfTasksColoring) {
  console.log("Cache test - call repaint and check");
}

// Check applied styles on a task element
const task = document.querySelector('[data-eventid^="tasks_"]');
if (task) {
  const target = task.querySelector('.GTG3wb') || task;
  console.log("Task styles:", {
    bgColor: target.dataset.cfTaskBgColor,
    textColor: target.dataset.cfTaskTextColor,
    textActual: target.dataset.cfTaskTextActual,
    computedColor: window.getComputedStyle(target).color
  });
}
```
